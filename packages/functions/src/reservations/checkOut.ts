import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import {
  db,
  folioRef,
  foliosRef,
  reservationRef,
  roomRef,
} from "../lib/firestore.js";
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

    const resRefDoc = reservationRef(tenantId, propertyId, data.reservationId);

    // Pre-txn read of the reservation to get its folioId. Group folios
    // store `reservationIds: [...]` — the legacy `foliosRef.where("reservationId","==",...)`
    // query only matches the folio's legacy singular field and MISSES
    // sibling reservations of a group booking. Using the reservation's own
    // folioId is authoritative for both solo AND group.
    const preResSnap = await resRefDoc.get();
    if (!preResSnap.exists) throw notFound("Reservation not found");
    const preResData = preResSnap.data()!;
    const folioIdOnRes = preResData.folioId as string | undefined;
    let folioDocRef: FirebaseFirestore.DocumentReference | null = null;
    if (folioIdOnRes) {
      folioDocRef = folioRef(tenantId, propertyId, folioIdOnRes);
    } else {
      // Fall back to legacy lookup for pre-group-migration reservations.
      const folioQuery = await foliosRef(tenantId, propertyId)
        .where("reservationId", "==", data.reservationId)
        .limit(1)
        .get();
      folioDocRef = folioQuery.empty ? null : folioQuery.docs[0]!.ref;
    }

    await db.runTransaction(async (tx) => {
      const resSnap = await tx.get(resRefDoc);
      if (!resSnap.exists) throw notFound("Reservation not found");

      const res = resSnap.data()!;
      if (res.status !== "checked_in") {
        throw preconditionFailed("Reservation must be checked in to check out");
      }

      // Balance guard. If we can't find a folio at all, refuse — the
      // silent-bypass bug (checkout succeeding with unpaid balance) is
      // exactly the shortage risk the client is worried about.
      if (!folioDocRef) {
        throw preconditionFailed(
          "Folio not found for this reservation — cannot verify balance. Contact support.",
        );
      }
      const folioSnap = await tx.get(folioDocRef);
      if (!folioSnap.exists) {
        throw preconditionFailed(
          "Folio not found for this reservation — cannot verify balance. Contact support.",
        );
      }
      const folio = folioSnap.data()!;
      if ((folio.balance as number) > 0) {
        throw preconditionFailed(
          `Folio has an outstanding balance of R${((folio.balance as number) / 100).toFixed(2)}. Settle before check-out.`,
        );
      }
      // Only settle the folio if all group siblings have also checked out;
      // otherwise other siblings still need the folio open for their own
      // charges (shared folio, group booking case).
      const folioReservationIds =
        (folio.reservationIds as string[] | undefined) ?? null;
      let allSiblingsDone = true;
      if (folioReservationIds && folioReservationIds.length > 1) {
        for (const sibId of folioReservationIds) {
          if (sibId === data.reservationId) continue;
          const sibSnap = await tx.get(
            reservationRef(tenantId, propertyId, sibId),
          );
          if (!sibSnap.exists) continue;
          const sibStatus = sibSnap.data()!.status as string;
          if (sibStatus !== "checked_out" && sibStatus !== "cancelled") {
            allSiblingsDone = false;
            break;
          }
        }
      }
      if (allSiblingsDone) {
        tx.update(folioDocRef, {
          status: "settled",
          updatedAt: FieldValue.serverTimestamp(),
        });
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
