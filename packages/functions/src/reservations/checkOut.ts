import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, reservationRef, foliosRef, roomRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";
import { checkOutSchema } from "@swiftpms/shared";

export const checkOut = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(checkOutSchema, request.data);

    // Pre-transaction: find folio doc (queries not allowed inside tx)
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
      if (res.status !== "checked_in") {
        throw preconditionFailed("Reservation must be checked in to check out");
      }

      // Check folio balance
      if (folioDocRef) {
        const folioSnap = await tx.get(folioDocRef);
        if (folioSnap.exists) {
          const folio = folioSnap.data()!;
          if ((folio.balance as number) > 0) {
            throw preconditionFailed("Folio must be settled before check-out");
          }
          tx.update(folioDocRef, {
            status: "settled",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      // Update reservation
      tx.update(resRefDoc, {
        status: "checked_out",
        checkedOutAt: FieldValue.serverTimestamp(),
        checkedOutBy: request.auth!.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Mark room as dirty
      if (res.roomId) {
        tx.update(roomRef(tenantId, propertyId, res.roomId as string), {
          status: "dirty",
          currentReservationId: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    await writeAuditLog({
      action: "reservation.checkout",
      resource: "reservation",
      resourceId: data.reservationId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      propertyId,
    }).catch(() => {});

    return { success: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
