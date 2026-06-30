import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";

import {
  PEACH_RESULT_CODE_SUCCESS,
  PaymentIntentStatus,
  addCents,
  subtractCents,
} from "@swiftpms/shared";

import { writeAuditLog } from "../lib/audit.js";
import {
  db,
  folioRef,
  paymentIntentRef,
  reservationRef,
  roomRef,
} from "../lib/firestore.js";
import { PEACH_SECRET, verifyPeachSignature } from "./peachClient.js";

type PeachWebhookPayload = Record<string, string>;

function parseBody(rawBody: Buffer | string): Record<string, string> {
  const text =
    typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export const peachWebhook = onRequest(
  { cors: false, secrets: [PEACH_SECRET] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    let body: PeachWebhookPayload;
    if (req.is("application/json")) {
      body = (req.body ?? {}) as PeachWebhookPayload;
    } else {
      body = parseBody(req.rawBody ?? "") as PeachWebhookPayload;
    }

    if (!body.signature) {
      res.status(400).send("Missing signature");
      return;
    }

    const valid = verifyPeachSignature(
      body,
      body.signature,
      PEACH_SECRET.value(),
    );
    if (!valid) {
      res.status(401).send("Invalid signature");
      return;
    }

    const tenantId = body["customParameters[tenantId]"];
    const propertyId = body["customParameters[propertyId]"];
    const paymentIntentId = body["customParameters[paymentIntentId]"];
    if (!tenantId || !propertyId || !paymentIntentId) {
      res.status(400).send("Missing customParameters");
      return;
    }

    const intentDocRef = paymentIntentRef(
      tenantId,
      propertyId,
      paymentIntentId,
    );

    const resultCode = body["result.code"] ?? "";
    const resultDescription = body["result.description"] ?? "";
    const isSuccess =
      resultCode === PEACH_RESULT_CODE_SUCCESS ||
      /^000\.000\.(000|100\.11[01]|10[0-9])/.test(resultCode);

    const status = isSuccess
      ? PaymentIntentStatus.SUCCEEDED
      : PaymentIntentStatus.FAILED;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(intentDocRef);
      if (!snap.exists) {
        throw new Error("PaymentIntent not found");
      }
      const intent = snap.data()!;

      // Idempotency: skip if already terminal
      if (
        intent.status === PaymentIntentStatus.SUCCEEDED ||
        intent.status === PaymentIntentStatus.FAILED ||
        intent.status === PaymentIntentStatus.CANCELLED
      ) {
        return;
      }

      tx.update(intentDocRef, {
        status,
        peachPaymentId: body.id ?? null,
        peachResultCode: resultCode,
        peachResultDescription: resultDescription,
        completedAt: new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (!isSuccess) return;

      // Apply payment to folio if linked + paymentType is DB (debit/charge).
      const folioId = intent.folioId as string | null;
      const paymentType = intent.paymentType as string;
      if (paymentType !== "DB" || !folioId) return;

      const fRef = folioRef(tenantId, propertyId, folioId);
      const fSnap = await tx.get(fRef);
      if (!fSnap.exists) return;
      const folio = fSnap.data()!;
      if (folio.status !== "open") return;

      const amount = intent.amount as number;
      const payment = {
        id: `pmt_${Date.now()}_peach`,
        method: "card",
        amount,
        reference: body.id ?? body.merchantTransactionId,
        processedBy: "system:peach-webhook",
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
      const newStatus = newBalance <= 0 ? "settled" : "open";

      tx.update(fRef, {
        payments: FieldValue.arrayUnion(payment),
        totalPayments: newTotalPayments,
        balance: Math.max(0, newBalance),
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // If folio is now settled and reservation has a held room, promote it.
      const reservationId = intent.reservationId as string | null;
      if (newStatus === "settled" && reservationId) {
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
      action: isSuccess ? "payment.intent.succeeded" : "payment.intent.failed",
      resource: "paymentIntent",
      resourceId: paymentIntentId,
      userId: "system:peach-webhook",
      userEmail: "",
      tenantId,
      propertyId,
      details: {
        resultCode,
        resultDescription,
        peachPaymentId: body.id ?? null,
      },
    }).catch(() => {});

    res.status(200).send("OK");
  },
);
