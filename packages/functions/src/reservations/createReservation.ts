import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { calculateNights, multiplyCents } from "@swiftpms/shared";

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

    const result = await db.runTransaction(async (tx) => {
      // Verify guest exists
      const guestSnap = await tx.get(guestRef(tenantId, data.guestId));
      if (!guestSnap.exists) throw notFound("Guest not found");

      // Get room type for rate
      const rtSnap = await tx.get(roomTypeRef(tenantId, data.roomTypeId));
      if (!rtSnap.exists) throw notFound("Room type not found");
      const roomType = rtSnap.data()!;

      // Check room availability if specific room is requested
      if (data.roomId) {
        const roomSnap = await tx.get(roomRef(tenantId, propertyId, data.roomId));
        if (!roomSnap.exists) throw notFound("Room not found");
        const room = roomSnap.data()!;
        if (room.status !== "available") {
          throw preconditionFailed("Room is not available");
        }
      }

      const nightCount = calculateNights(data.checkInDate, data.checkOutDate);
      const roomRate = roomType.baseRate as number;
      const totalRoomCharges = multiplyCents(roomRate, nightCount);

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
        status: "confirmed",
        roomRate,
        totalRoomCharges,
        specialRequests: data.specialRequests ?? null,
        source: "front_desk",
        createdBy: request.auth!.uid,
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
          description: `${roomType.name} - ${nightCount} night(s)`,
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
