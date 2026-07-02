import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import {
  db,
  folioRef,
  foliosRef,
  reservationRef,
  reservationsRef,
  roomRef,
} from "../lib/firestore.js";
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

    const resRefDoc = reservationRef(tenantId, propertyId, data.reservationId);

    // Pre-transaction: fetch the reservation once to know its groupId /
    // folioId / roomId before the tx. Queries (needed for the group sibling
    // check) can't run inside a Firestore txn.
    const preSnap = await resRefDoc.get();
    if (!preSnap.exists) throw notFound("Reservation not found");
    const preData = preSnap.data()!;
    const preGroupId = preData.groupId as string | undefined;
    const preFolioIdOnRes = preData.folioId as string | undefined;

    // Find the folio: prefer the reservation's own folioId (group-aware);
    // fall back to the legacy foliosRef.where(reservationId==) lookup.
    let folioDocRef: FirebaseFirestore.DocumentReference | null = null;
    if (preFolioIdOnRes) {
      folioDocRef = folioRef(tenantId, propertyId, preFolioIdOnRes);
    } else {
      const folioQuery = await foliosRef(tenantId, propertyId)
        .where("reservationId", "==", data.reservationId)
        .limit(1)
        .get();
      folioDocRef = folioQuery.empty ? null : folioQuery.docs[0]!.ref;
    }

    // For group bookings: count sibling reservations that would still be
    // active AFTER this cancel. If any remain, keep the folio open.
    let hasActiveSiblings = false;
    if (preGroupId) {
      const sibsSnap = await reservationsRef(tenantId, propertyId)
        .where("groupId", "==", preGroupId)
        .get();
      hasActiveSiblings = sibsSnap.docs.some((d) => {
        if (d.id === data.reservationId) return false;
        const s = d.data().status as string;
        return s === "confirmed" || s === "checked_in";
      });
    }

    await db.runTransaction(async (tx) => {
      // 1) ALL READS first — Firestore requires reads before writes.
      const resSnap = await tx.get(resRefDoc);
      if (!resSnap.exists) throw notFound("Reservation not found");
      const res = resSnap.data()!;
      if (res.status !== "confirmed") {
        throw preconditionFailed("Only confirmed reservations can be cancelled");
      }
      const roomId = res.roomId as string | null;
      const roomDocRef = roomId ? roomRef(tenantId, propertyId, roomId) : null;

      const folioSnap = folioDocRef ? await tx.get(folioDocRef) : null;
      const roomSnap = roomDocRef ? await tx.get(roomDocRef) : null;

      // 2) ALL WRITES.
      tx.update(resRefDoc, {
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: request.auth!.uid,
        cancelReason: data.reason ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Only void the folio when no other group siblings remain. Solo
      // bookings have hasActiveSiblings=false so the folio still voids.
      if (folioDocRef && folioSnap?.exists && !hasActiveSiblings) {
        tx.update(folioDocRef, {
          status: "void",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Free this reservation's room regardless — siblings have their own rooms.
      if (roomDocRef && roomSnap?.exists) {
        tx.update(roomDocRef, {
          status: "available",
          currentReservationId: null,
          holdExpiresAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
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
