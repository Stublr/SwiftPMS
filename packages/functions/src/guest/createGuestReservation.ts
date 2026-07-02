import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  calculateNights,
  calculateTieredStayTotal,
  multiplyCents,
  createReservationSchema,
  type TieredPricing,
} from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, reservationsRef, foliosRef, roomTypeRef, roomsRef, guestRef, propertyRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

export const createGuestReservation = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const role = request.auth.token.role as string;
    // Allow guests, plus super_admin (so admins can self-book for testing).
    if (role !== "guest" && role !== "super_admin") {
      throw preconditionFailed("Only guest accounts can use this endpoint");
    }

    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(createReservationSchema, request.data);

    // Idempotency — if we've seen this clientRequestId, return the existing
    // reservation instead of creating a duplicate. Mostly protects against
    // network-retry double-bookings from flaky mobile clients.
    if (data.clientRequestId) {
      const existing = await reservationsRef(tenantId, propertyId)
        .where("clientRequestId", "==", data.clientRequestId)
        .limit(1)
        .get();
      if (!existing.empty) {
        const d = existing.docs[0]!;
        const r = d.data();
        return {
          id: d.id,
          folioId: null,
          nightCount: r.nightCount as number,
          roomRate: r.roomRate as number,
          totalRoomCharges: r.totalRoomCharges as number,
        };
      }
    }

    // Check property is active
    const propSnap = await propertyRef(tenantId, propertyId).get();
    if (!propSnap.exists || !(propSnap.data()?.isActive)) {
      throw preconditionFailed("This property is currently unavailable for bookings.");
    }

    // Verify guestId matches authenticated user
    if (data.guestId !== request.auth.uid) {
      throw preconditionFailed("guestId must match authenticated user");
    }

    const result = await db.runTransaction(async (tx) => {
      // Verify guest
      const guestSnap = await tx.get(guestRef(tenantId, data.guestId));
      if (!guestSnap.exists) throw notFound("Guest not found");

      // Get room type for rate
      const rtSnap = await tx.get(roomTypeRef(tenantId, data.roomTypeId));
      if (!rtSnap.exists) throw notFound("Room type not found");
      const roomType = rtSnap.data()!;

      const nightCount = calculateNights(data.checkInDate, data.checkOutDate);
      const tiered = roomType.tieredPricing as TieredPricing | undefined;
      const adults = data.adults;
      const children = data.children ?? 0;

      let roomRate: number;
      let totalRoomCharges: number;
      let chargeDescription: string;
      if (tiered) {
        const calc = calculateTieredStayTotal(
          tiered,
          data.checkInDate,
          data.checkOutDate,
          adults,
          children,
        );
        roomRate = calc.nightlyRate;
        totalRoomCharges = calc.total;
        const childLabel =
          children > 0 ? `, ${children} child(ren) under ${tiered.childAgeMax + 1}` : "";
        chargeDescription = `${roomType.name} - ${nightCount} night(s) (${calc.tier} season, ${adults} adult(s)${childLabel})`;
      } else {
        roomRate = roomType.baseRate as number;
        totalRoomCharges = multiplyCents(roomRate, nightCount);
        chargeDescription = `${roomType.name} - ${nightCount} night(s)`;
      }

      // Auto-assign an available room of this type
      const allRooms = await tx.get(
        roomsRef(tenantId, propertyId)
          .where("roomTypeId", "==", data.roomTypeId)
          .where("isActive", "==", true),
      );

      // Find overlapping reservations to exclude booked rooms
      const allRes = await tx.get(
        reservationsRef(tenantId, propertyId)
          .where("status", "in", ["confirmed", "checked_in"]),
      );
      const bookedRoomIds = new Set<string>();
      for (const rd of allRes.docs) {
        const r = rd.data();
        if (
          r.roomId &&
          (r.checkInDate as string) < data.checkOutDate &&
          (r.checkOutDate as string) > data.checkInDate
        ) {
          bookedRoomIds.add(r.roomId as string);
        }
      }

      const availableRoom = allRooms.docs.find((d) => {
        const s = d.data().status as string;
        return (s === "available") && !bookedRoomIds.has(d.id);
      });

      if (!availableRoom) {
        throw preconditionFailed("No rooms available for the selected type and dates.");
      }

      // Hold the room for 30 minutes
      const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      tx.update(availableRoom.ref, {
        status: "held",
        holdExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create reservation with room assigned
      const resRef = reservationsRef(tenantId, propertyId).doc();
      tx.set(resRef, {
        guestId: data.guestId,
        roomId: availableRoom.id,
        roomTypeId: data.roomTypeId,
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
        nightCount,
        adults: data.adults,
        children: data.children ?? 0,
        status: "confirmed",
        holdExpiresAt,
        roomRate,
        totalRoomCharges,
        specialRequests: data.specialRequests ?? null,
        source: "guest_portal",
        createdBy: `guest:${request.auth!.uid}`,
        clientRequestId: data.clientRequestId ?? null,
        checkedInAt: null,
        checkedInBy: null,
        checkedOutAt: null,
        checkedOutBy: null,
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create folio
      const folioRef = foliosRef(tenantId, propertyId).doc();
      tx.set(folioRef, {
        reservationId: resRef.id,
        guestId: data.guestId,
        charges: [{
          id: `chg_${Date.now()}`,
          category: "room",
          description: chargeDescription,
          amount: roomRate,
          quantity: nightCount,
          total: totalRoomCharges,
          date: data.checkInDate,
          addedBy: `guest:${request.auth!.uid}`,
          addedAt: new Date().toISOString(),
        }],
        payments: [],
        totalCharges: totalRoomCharges,
        totalPayments: 0,
        balance: totalRoomCharges,
        status: "open",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        id: resRef.id,
        folioId: folioRef.id,
        nightCount,
        roomRate,
        totalRoomCharges,
      };
    });

    // NOTE: Confirmation email is sent from syncPaymentStatus.ts on
    // successful settlement, not here. Sending at reservation-create time
    // would email guests for bookings that then get cancelled if payment
    // fails to initiate.
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
