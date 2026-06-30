import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  PaymentIntentStatus,
  addCents,
  subtractCents,
} from "@swiftpms/shared";

import { writeAuditLog } from "../lib/audit.js";
import {
  notFound,
  preconditionFailed,
  unauthorized,
  wrapError,
} from "../lib/errors.js";
import {
  db,
  folioRef,
  paymentIntentRef,
  reservationRef,
  roomRef,
} from "../lib/firestore.js";
import {
  PLANKTON_API_KEY,
  getPlanktonPayment,
  isTerminalFailure,
  isTerminalSuccess,
  syncPlanktonPayment,
  type PlanktonStatus,
} from "./planktonPaymentsClient.js";

function mapStatus(s: PlanktonStatus): PaymentIntentStatus {
  if (isTerminalSuccess(s)) return PaymentIntentStatus.SUCCEEDED;
  if (s === "cancelled") return PaymentIntentStatus.CANCELLED;
  if (s === "timed_out") return PaymentIntentStatus.EXPIRED;
  if (isTerminalFailure(s)) return PaymentIntentStatus.FAILED;
  // requires_action / created / authorizing → still in flight
  return PaymentIntentStatus.REDIRECTED;
}

/**
 * Poll the Plankton platform for a payment's authoritative status, update
 * our PaymentIntent doc, and on success apply the payment to the folio +
 * promote a held room to reserved.
 *
 * Designed to be called repeatedly from the client (every ~3s) until the
 * status is terminal. Idempotent: doesn't double-apply if the intent is
 * already SUCCEEDED/FAILED/etc.
 */
export const syncPaymentStatus = onCall(
  { cors: true, secrets: [PLANKTON_API_KEY] },
  async (request) => {
    try {
      if (!request.auth) throw unauthorized();

      const tenantId = request.auth.token.tenantId as string | undefined;
      if (!tenantId) throw preconditionFailed("tenantId missing on token");

      const propertyId = request.data.propertyId as string;
      const paymentIntentId = request.data.paymentIntentId as string;
      if (!propertyId || !paymentIntentId) {
        throw preconditionFailed(
          "propertyId and paymentIntentId are required",
        );
      }
      const forceSync = request.data.forceSync === true;

      const intentDoc = paymentIntentRef(
        tenantId,
        propertyId,
        paymentIntentId,
      );
      const intentSnap = await intentDoc.get();
      if (!intentSnap.exists) throw notFound("PaymentIntent not found");
      const intent = intentSnap.data()!;

      // Idempotency — if already terminal, just return current state.
      const currentStatus = intent.status as PaymentIntentStatus;
      if (
        currentStatus === PaymentIntentStatus.SUCCEEDED ||
        currentStatus === PaymentIntentStatus.FAILED ||
        currentStatus === PaymentIntentStatus.CANCELLED ||
        currentStatus === PaymentIntentStatus.EXPIRED
      ) {
        return {
          paymentIntentId,
          status: currentStatus,
          terminal: true,
        };
      }

      const planktonPaymentId = intent.planktonPaymentId as string | null;
      if (!planktonPaymentId) {
        throw preconditionFailed(
          "PaymentIntent has no planktonPaymentId — was it initiated via the railways platform?",
        );
      }

      // Fetch from Plankton platform. Use forceSync to nudge the gateway
      // if the client thinks the customer paid but our status is stale.
      const planktonRes = forceSync
        ? await syncPlanktonPayment(planktonPaymentId)
        : await getPlanktonPayment(planktonPaymentId);

      const newStatus = mapStatus(planktonRes.status);

      // Still in flight — update audit/log fields but don't touch folio.
      if (newStatus === PaymentIntentStatus.REDIRECTED) {
        return {
          paymentIntentId,
          status: PaymentIntentStatus.REDIRECTED,
          planktonStatus: planktonRes.status,
          terminal: false,
        };
      }

      // Terminal — apply if it's a success and we haven't already.
      const isSuccess = newStatus === PaymentIntentStatus.SUCCEEDED;

      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(intentDoc);
        if (!fresh.exists) return;
        const freshIntent = fresh.data()!;

        // Re-check idempotency inside transaction.
        if (
          freshIntent.status === PaymentIntentStatus.SUCCEEDED ||
          freshIntent.status === PaymentIntentStatus.FAILED ||
          freshIntent.status === PaymentIntentStatus.CANCELLED ||
          freshIntent.status === PaymentIntentStatus.EXPIRED
        ) {
          return;
        }

        tx.update(intentDoc, {
          status: newStatus,
          planktonStatus: planktonRes.status,
          planktonFailureReason: planktonRes.failureReason ?? null,
          planktonFailureMessage: planktonRes.failureMessage ?? null,
          completedAt: new Date().toISOString(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (!isSuccess) return;

        // Apply to folio if linked + paymentType is DB (debit/charge).
        const folioId = freshIntent.folioId as string | null;
        const paymentType = freshIntent.paymentType as string;
        if (paymentType !== "DB" || !folioId) return;

        const fRef = folioRef(tenantId, propertyId, folioId);
        const fSnap = await tx.get(fRef);
        if (!fSnap.exists) return;
        const folio = fSnap.data()!;
        if (folio.status !== "open") return;

        const amount = freshIntent.amount as number;
        const payment = {
          id: `pmt_${Date.now()}_plankton`,
          method: "card",
          amount,
          reference: planktonPaymentId,
          processedBy: "system:plankton-sync",
          processedAt: new Date().toISOString(),
        };

        const newTotalPayments = addCents(
          folio.totalPayments as number,
          amount,
        );
        const newBalance = subtractCents(
          folio.totalCharges as number,
          newTotalPayments,
        );
        const newFolioStatus = newBalance <= 0 ? "settled" : "open";

        tx.update(fRef, {
          payments: FieldValue.arrayUnion(payment),
          totalPayments: newTotalPayments,
          balance: Math.max(0, newBalance),
          status: newFolioStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // If folio settled and reservation has a held room, promote it.
        const reservationId = freshIntent.reservationId as string | null;
        if (newFolioStatus === "settled" && reservationId) {
          const resR = reservationRef(tenantId, propertyId, reservationId);
          const resSnap = await tx.get(resR);
          if (resSnap.exists) {
            const resData = resSnap.data()!;
            const rid = resData.roomId as string | null;
            if (rid) {
              const rRef = roomRef(tenantId, propertyId, rid);
              const rSnap = await tx.get(rRef);
              if (rSnap.exists && rSnap.data()?.status === "held") {
                tx.update(rRef, {
                  status: "reserved",
                  holdExpiresAt: null,
                  currentReservationId: reservationId,
                  updatedAt: FieldValue.serverTimestamp(),
                });
              }
            }
            tx.update(resR, {
              holdExpiresAt: null,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      });

      await writeAuditLog({
        action: isSuccess
          ? "payment.intent.succeeded"
          : "payment.intent.failed",
        resource: "paymentIntent",
        resourceId: paymentIntentId,
        userId: request.auth.uid,
        userEmail: request.auth.token.email ?? "",
        tenantId,
        propertyId,
        details: {
          planktonStatus: planktonRes.status,
          planktonFailureReason: planktonRes.failureReason ?? null,
          planktonFailureMessage: planktonRes.failureMessage ?? null,
        },
      }).catch(() => {});

      return {
        paymentIntentId,
        status: newStatus,
        planktonStatus: planktonRes.status,
        terminal: true,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      wrapError(err);
    }
  },
);
