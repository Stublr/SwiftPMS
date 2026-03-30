import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { calculateNights, multiplyCents, createReservationSchema } from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, reservationsRef, foliosRef, roomTypeRef, guestRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

export const createGuestReservation = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const role = request.auth.token.role as string;
    if (role !== "guest") throw preconditionFailed("Only guest accounts can use this endpoint");

    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(createReservationSchema, request.data);

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

      // Create reservation (no room assigned yet - front desk will assign at check-in)
      const resRef = reservationsRef(tenantId, propertyId).doc();
      tx.set(resRef, {
        guestId: data.guestId,
        roomId: null,
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

    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
