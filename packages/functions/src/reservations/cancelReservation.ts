import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, reservationRef, foliosRef, roomRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";
import { cancelReservationSchema } from "@swiftpms/shared";

export const cancelReservation = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(cancelReservationSchema, request.data);

    // Pre-transaction: find the folio doc (queries not allowed inside tx)
    const folioQuery = await foliosRef(tenantId, propertyId)
      .where("reservationId", "==", data.reservationId)
      .limit(1)
      .get();
    const folioDocRef = folioQuery.empty ? null : folioQuery.docs[0]!.ref;

    const resRefDoc = reservationRef(tenantId, propertyId, data.reservationId);

    await db.runTransaction(async (tx) => {
      const resSnap = await tx.get(resRefDoc);
      if (!resSnap.exists) throw notFound("Reservation not found");

      const res = resSnap.data()!;
      if (res.status !== "confirmed") {
        throw preconditionFailed("Only confirmed reservations can be cancelled");
      }

      tx.update(resRefDoc, {
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: request.auth!.uid,
        cancelReason: data.reason ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Void the folio if it exists
      if (folioDocRef) {
        const folioSnap = await tx.get(folioDocRef);
        if (folioSnap.exists) {
          tx.update(folioDocRef, {
            status: "void",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      // Free the room if it was reserved
      if (res.roomId) {
        const roomDocRef = roomRef(tenantId, propertyId, res.roomId as string);
        const roomSnap = await tx.get(roomDocRef);
        if (roomSnap.exists) {
          tx.update(roomDocRef, {
            status: "available",
            currentReservationId: null,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    });

    await writeAuditLog({
      action: "reservation.cancel",
      resource: "reservation",
      resourceId: data.reservationId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      propertyId,
      details: { reason: data.reason },
    }).catch(() => {});

    return { success: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
