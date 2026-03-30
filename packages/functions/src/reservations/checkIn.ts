import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, reservationRef, roomRef, roomsRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";
import { checkInSchema } from "@swiftpms/shared";

export const checkIn = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(checkInSchema, request.data);

    // Pre-transaction: read reservation and find available room (queries not allowed inside tx)
    const resRefDoc = reservationRef(tenantId, propertyId, data.reservationId);
    const resPreSnap = await resRefDoc.get();
    if (!resPreSnap.exists) throw notFound("Reservation not found");

    const resData = resPreSnap.data()!;
    if (resData.status !== "confirmed") {
      throw preconditionFailed("Reservation must be confirmed to check in");
    }

    let assignedRoomId = data.roomId ?? (resData.roomId as string | null);

    if (!assignedRoomId) {
      const availRooms = await roomsRef(tenantId, propertyId)
        .where("roomTypeId", "==", resData.roomTypeId)
        .where("status", "==", "available")
        .where("isActive", "==", true)
        .limit(1)
        .get();

      if (availRooms.empty) {
        throw preconditionFailed("No available rooms of this type");
      }
      assignedRoomId = availRooms.docs[0]!.id;
    }

    // Transaction: re-validate and perform atomic updates
    const roomId = assignedRoomId;
    const result = await db.runTransaction(async (tx) => {
      const resSnap = await tx.get(resRefDoc);
      if (!resSnap.exists) throw notFound("Reservation not found");
      const res = resSnap.data()!;
      if (res.status !== "confirmed") {
        throw preconditionFailed("Reservation must be confirmed to check in");
      }

      const roomSnap = await tx.get(roomRef(tenantId, propertyId, roomId));
      if (!roomSnap.exists) throw notFound("Room not found");
      const room = roomSnap.data()!;
      if (room.status !== "available" && room.status !== "reserved") {
        throw preconditionFailed("Room is not available for check-in");
      }

      tx.update(resRefDoc, {
        status: "checked_in",
        roomId,
        checkedInAt: FieldValue.serverTimestamp(),
        checkedInBy: request.auth!.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.update(roomRef(tenantId, propertyId, roomId), {
        status: "occupied",
        currentReservationId: data.reservationId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { roomId, roomNumber: room.roomNumber as string };
    });

    await writeAuditLog({
      action: "reservation.checkin",
      resource: "reservation",
      resourceId: data.reservationId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      propertyId,
      details: { roomId: result.roomId },
    }).catch(() => {});

    return { success: true, ...result };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
