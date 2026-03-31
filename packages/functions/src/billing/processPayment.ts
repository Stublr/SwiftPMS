import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { addCents, subtractCents } from "@swiftpms/shared";
import { processPaymentSchema } from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, folioRef, reservationsRef, roomRef } from "../lib/firestore.js";
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
      const fRef = folioRef(tenantId, propertyId, data.folioId);
      const fSnap = await tx.get(fRef);
      if (!fSnap.exists) throw notFound("Folio not found");

      const folio = fSnap.data()!;
      if (folio.status !== "open") {
        throw preconditionFailed("Folio is not open");
      }

      const payment = {
        id: `pmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        method: data.method,
        amount: data.amount,
        reference: data.reference ?? null,
        processedBy: request.auth!.uid,
        processedAt: new Date().toISOString(),
      };

      const newTotalPayments = addCents(folio.totalPayments as number, data.amount);
      const newBalance = subtractCents(folio.totalCharges as number, newTotalPayments);
      const newStatus = newBalance <= 0 ? "settled" : "open";

      tx.update(fRef, {
        payments: FieldValue.arrayUnion(payment),
        totalPayments: newTotalPayments,
        balance: Math.max(0, newBalance),
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // If folio is now settled, confirm the room reservation
      if (newStatus === "settled") {
        // Find the reservation linked to this folio
        const resQuery = await tx.get(
          reservationsRef(tenantId, propertyId)
            .where("__name__", ">=", "")
            .limit(500),
        );
        const linkedRes = resQuery.docs.find(
          (d) => d.id === (folio.reservationId as string),
        );
        if (linkedRes) {
          const resData = linkedRes.data();
          const rid = resData.roomId as string | null;
          if (rid) {
            const rRef = roomRef(tenantId, propertyId, rid);
            const rSnap = await tx.get(rRef);
            if (rSnap.exists && rSnap.data()?.status === "held") {
              tx.update(rRef, {
                status: "reserved",
                holdExpiresAt: null,
                currentReservationId: linkedRes.id,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }
          // Clear hold expiry on reservation
          tx.update(linkedRes.ref, {
            holdExpiresAt: null,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
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
