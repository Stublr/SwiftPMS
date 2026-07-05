import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  calculateNights,
  calculateTieredStayTotal,
  multiplyCents,
  type TieredPricing,
} from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, reservationsRef, foliosRef, roomRef, roomTypeRef, guestRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";
import { createReservationSchema } from "@swiftpms/shared";

export const createReservation = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(createReservationSchema, request.data);

    // Idempotency check (pre-transaction). If the client sent a
    // clientRequestId we've seen before, return the existing reservation
    // without creating a duplicate. The query runs outside the transaction
    // — the small race window is bounded by the txn's own write below
    // (Firestore retries the txn if anything it read changed).
    if (data.clientRequestId) {
      const existingSnap = await reservationsRef(tenantId, propertyId)
        .where("clientRequestId", "==", data.clientRequestId)
        .limit(1)
        .get();
      if (!existingSnap.empty) {
        return { id: existingSnap.docs[0]!.id };
      }
    }

    const result = await db.runTransaction(async (tx) => {
      // Verify guest exists
      const guestSnap = await tx.get(guestRef(tenantId, data.guestId));
      if (!guestSnap.exists) throw notFound("Guest not found");

      // Get room type for rate
      const rtSnap = await tx.get(roomTypeRef(tenantId, data.roomTypeId));
      if (!rtSnap.exists) throw notFound("Room type not found");
      const roomType = rtSnap.data()!;

      // Check room availability if specific room is requested.
      // Two checks: (1) current status, (2) no overlapping reservation on
      // the same room for the requested date range. A room can be
      // `available` right now yet already reserved for a future stay —
      // the staff path previously missed that and double-booked.
      if (data.roomId) {
        const roomSnap = await tx.get(roomRef(tenantId, propertyId, data.roomId));
        if (!roomSnap.exists) throw notFound("Room not found");
        const room = roomSnap.data()!;
        if (room.status !== "available") {
          throw preconditionFailed("Room is not available");
        }

        // Overlap query: any non-terminal reservation on this room whose
        // window touches the requested window. Reservation overlap rule:
        //   existing.checkInDate < new.checkOutDate AND
        //   existing.checkOutDate > new.checkInDate
        const overlapping = await tx.get(
          reservationsRef(tenantId, propertyId)
            .where("roomId", "==", data.roomId)
            .where("status", "in", ["confirmed", "checked_in"]),
        );
        const conflict = overlapping.docs.find((d) => {
          const r = d.data();
          return (
            (r.checkInDate as string) < data.checkOutDate &&
            (r.checkOutDate as string) > data.checkInDate
          );
        });
        if (conflict) {
          throw preconditionFailed(
            `Room already has a ${conflict.data().status} reservation overlapping these dates`,
          );
        }
      }

      const nightCount = calculateNights(data.checkInDate, data.checkOutDate);
      const tiered = roomType.tieredPricing as TieredPricing | undefined;
      const adults = data.adults;
      const children = data.children ?? 0;
      const pensioners = data.pensioners ?? 0;

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
          pensioners,
        );
        roomRate = calc.nightlyRate;
        totalRoomCharges = calc.total;
        const childLabel =
          children > 0
            ? `, ${children} child(ren) under ${tiered.childAgeMax + 1}`
            : "";
        const pensionerLabel =
          pensioners > 0
            ? `, ${pensioners} pensioner${pensioners !== 1 ? "s" : ""}`
            : "";
        chargeDescription = `${roomType.name} - ${nightCount} night(s) (${calc.tier} season, ${adults} adult(s)${childLabel}${pensionerLabel})`;
      } else {
        roomRate = roomType.baseRate as number;
        totalRoomCharges = multiplyCents(roomRate, nightCount);
        chargeDescription = `${roomType.name} - ${nightCount} night(s)`;
      }

      // Create reservation
      const resRef = reservationsRef(tenantId, propertyId).doc();
      tx.set(resRef, {
        guestId: data.guestId,
        roomId: data.roomId ?? null,
        roomTypeId: data.roomTypeId,
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
        nightCount,
        adults: data.adults,
        children: data.children ?? 0,
        pensioners: data.pensioners ?? 0,
        status: "confirmed",
        roomRate,
        totalRoomCharges,
        specialRequests: data.specialRequests ?? null,
        source: "front_desk",
        createdBy: request.auth!.uid,
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

      // Create folio with room charges
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
          addedBy: request.auth!.uid,
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

      // If room was assigned, mark as reserved
      if (data.roomId) {
        tx.update(roomRef(tenantId, propertyId, data.roomId), {
          status: "reserved",
          currentReservationId: resRef.id,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      return {
        id: resRef.id,
        folioId: folioRef.id,
        nightCount,
        roomRate,
        totalRoomCharges,
      };
    });

    await writeAuditLog({
      action: "reservation.create",
      resource: "reservation",
      resourceId: result.id,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      propertyId,
      details: { guestId: data.guestId, checkIn: data.checkInDate, checkOut: data.checkOutDate },
    }).catch(() => {});

    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
