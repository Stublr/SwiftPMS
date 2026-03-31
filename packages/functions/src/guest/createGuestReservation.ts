import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { calculateNights, multiplyCents, formatCents, createReservationSchema } from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, reservationsRef, foliosRef, roomTypeRef, roomsRef, guestRef, propertyRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";
import { sendBookingConfirmation } from "../lib/email.js";

export const createGuestReservation = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const role = request.auth.token.role as string;
    if (role !== "guest") throw preconditionFailed("Only guest accounts can use this endpoint");

    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(createReservationSchema, request.data);

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
      const roomRate = roomType.baseRate as number;
      const totalRoomCharges = multiplyCents(roomRate, nightCount);

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
          description: `${roomType.name} - ${nightCount} night(s)`,
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

    // Send booking confirmation email (non-blocking)
    try {
      const guestSnap = await guestRef(tenantId, data.guestId).get();
      const guest = guestSnap.data();
      const propData = propSnap.data();
      const rtSnap = await roomTypeRef(tenantId, data.roomTypeId).get();
      const rtData = rtSnap.data();
      const guestEmail = guest?.email as string | undefined;

      if (guestEmail) {
        await sendBookingConfirmation({
          to: guestEmail,
          guestName: `${guest?.firstName ?? ""} ${guest?.lastName ?? ""}`.trim() || "Guest",
          propertyName: (propData?.name as string) ?? "Our Lodge",
          roomTypeName: (rtData?.name as string) ?? "Room",
          roomName: null,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          nightCount: result.nightCount,
          totalAmount: formatCents(result.totalRoomCharges),
          reservationId: result.id,
        });
      }
    } catch (emailErr) {
      console.error("Failed to send booking email:", emailErr);
    }

    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
