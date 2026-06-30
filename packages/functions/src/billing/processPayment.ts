import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { addCents, subtractCents } from "@swiftpms/shared";
import { processPaymentSchema } from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, folioRef, reservationRef, roomRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";

export const processPayment = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(processPaymentSchema, request.data);

    const result = await db.runTransaction(async (tx) => {
      // Firestore transactions require ALL reads before ANY writes.
      // 1) Read folio
      const fRef = folioRef(tenantId, propertyId, data.folioId);
      const fSnap = await tx.get(fRef);
      if (!fSnap.exists) throw notFound("Folio not found");
      const folio = fSnap.data()!;
      if (folio.status !== "open") {
        throw preconditionFailed("Folio is not open");
      }

      // Idempotency — bail if we've already processed this clientRequestId.
      if (data.clientRequestId) {
        const dupe = (folio.payments as Array<{ clientRequestId?: string }>)?.find(
          (p) => p?.clientRequestId === data.clientRequestId,
        );
        if (dupe) {
          return {
            balance: folio.balance as number,
            status: folio.status as string,
          };
        }
      }

      const newTotalPayments = addCents(folio.totalPayments as number, data.amount);
      const newBalance = subtractCents(folio.totalCharges as number, newTotalPayments);
      const newStatus = newBalance <= 0 ? "settled" : "open";

      // 2) If we'll be settling, pre-read the linked reservation + its room
      //    by direct doc lookup (no 500-row scan). Direct lookup also avoids
      //    the previous bug where past 500 reservations the linked one was
      //    never found and the room stayed `held`.
      let resR: FirebaseFirestore.DocumentReference | null = null;
      let resSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let rRef: FirebaseFirestore.DocumentReference | null = null;
      let rSnap: FirebaseFirestore.DocumentSnapshot | null = null;

      if (newStatus === "settled" && folio.reservationId) {
        resR = reservationRef(tenantId, propertyId, folio.reservationId as string);
        resSnap = await tx.get(resR);
        if (resSnap.exists) {
          const rid = resSnap.data()!.roomId as string | null;
          if (rid) {
            rRef = roomRef(tenantId, propertyId, rid);
            rSnap = await tx.get(rRef);
          }
        }
      }

      // --- All reads complete. Begin writes. ---
      const payment = {
        id: `pmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        method: data.method,
        amount: data.amount,
        reference: data.reference ?? null,
        processedBy: request.auth!.uid,
        processedAt: new Date().toISOString(),
        clientRequestId: data.clientRequestId ?? null,
      };

      tx.update(fRef, {
        payments: FieldValue.arrayUnion(payment),
        totalPayments: newTotalPayments,
        balance: Math.max(0, newBalance),
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (newStatus === "settled" && resR && resSnap?.exists) {
        if (rRef && rSnap?.exists && rSnap.data()?.status === "held") {
          tx.update(rRef, {
            status: "reserved",
            holdExpiresAt: null,
            currentReservationId: folio.reservationId,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        tx.update(resR, {
          holdExpiresAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      return { balance: Math.max(0, newBalance), status: newStatus };
    });

    await writeAuditLog({
      action: "folio.payment",
      resource: "folio",
      resourceId: data.folioId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      propertyId,
      details: { method: data.method, amount: data.amount },
    }).catch(() => {});

    return { success: true, ...result };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
