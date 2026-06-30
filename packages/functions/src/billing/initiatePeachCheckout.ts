import crypto from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  PaymentIntentStatus,
  initiatePeachCheckoutRequestSchema,
} from "@swiftpms/shared";

import { writeAuditLog } from "../lib/audit.js";
import {
  badRequest,
  notFound,
  preconditionFailed,
  unauthorized,
  wrapError,
} from "../lib/errors.js";
import {
  folioRef,
  paymentIntentRef,
  reservationRef,
} from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";
import {
  PEACH_ENTITY_ID,
  PEACH_ENV,
  PEACH_SECRET,
  initiateCheckoutAtPeach,
} from "./peachClient.js";

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "swiftpms-prod";

function webhookUrl(): string {
  return `https://us-central1-${PROJECT_ID}.cloudfunctions.net/peachWebhook`;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function centsToMajorString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export const initiatePeachCheckout = onCall(
  {
    cors: true,
    secrets: [PEACH_ENTITY_ID, PEACH_SECRET, PEACH_ENV],
  },
  async (request) => {
    try {
      if (!request.auth) throw unauthorized();

      const tenantId = request.auth.token.tenantId as string | undefined;
      const propertyId = request.data.propertyId as string | undefined;
      if (!tenantId) throw preconditionFailed("tenantId missing on token");
      if (!propertyId) throw preconditionFailed("propertyId is required");

      const data = validateRequest(
        initiatePeachCheckoutRequestSchema,
        request.data,
      );

      // Resolve reservation + folio if provided; validate amount against folio balance.
      let folioData: FirebaseFirestore.DocumentData | null = null;

      if (data.reservationId) {
        const resSnap = await reservationRef(
          tenantId,
          propertyId,
          data.reservationId,
        ).get();
        if (!resSnap.exists) throw notFound("Reservation not found");
      }

      if (data.folioId) {
        const folioSnap = await folioRef(
          tenantId,
          propertyId,
          data.folioId,
        ).get();
        if (!folioSnap.exists) throw notFound("Folio not found");
        folioData = folioSnap.data() ?? null;
        if (folioData?.status !== "open") {
          throw preconditionFailed("Folio is not open");
        }
        const balance = folioData.balance as number;
        if (data.amount > balance) {
          throw badRequest(
            `Amount ${data.amount} exceeds folio balance ${balance}`,
          );
        }
      }

      const intentId = genId("pi");
      const merchantTransactionId = genId("mtx");
      const paymentType = data.paymentType ?? "DB";
      const amountMajor = centsToMajorString(data.amount);
      const currency = (folioData?.currency as string | undefined) ?? "ZAR";

      // Build customer info from reservation/guest if available (best-effort).
      const customerEmail = request.auth.token.email ?? undefined;

      const { redirectUrl, checkoutId } = await initiateCheckoutAtPeach({
        entityId: PEACH_ENTITY_ID.value(),
        secret: PEACH_SECRET.value(),
        amount: amountMajor,
        currency,
        paymentType,
        merchantTransactionId,
        nonce: intentId,
        customerEmail,
        shopperResultUrl: data.shopperResultUrl,
        cancelUrl: data.shopperResultUrl,
        notificationUrl: webhookUrl(),
        customParameters: {
          tenantId,
          propertyId,
          paymentIntentId: intentId,
        },
      });

      const nowIso = new Date().toISOString();
      await paymentIntentRef(tenantId, propertyId, intentId).set({
        id: intentId,
        tenantId,
        propertyId,
        reservationId: data.reservationId ?? null,
        folioId: data.folioId ?? null,
        purpose: data.purpose,
        amount: data.amount,
        currency,
        status: PaymentIntentStatus.REDIRECTED,
        peachCheckoutId: checkoutId ?? null,
        peachPaymentId: null,
        peachResultCode: null,
        peachResultDescription: null,
        paymentType,
        merchantTransactionId,
        redirectUrl,
        shopperResultUrl: data.shopperResultUrl,
        initiatedBy: request.auth.uid,
        initiatedAt: nowIso,
        completedAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      await writeAuditLog({
        action: "payment.intent.created",
        resource: "paymentIntent",
        resourceId: intentId,
        userId: request.auth.uid,
        userEmail: request.auth.token.email ?? "",
        tenantId,
        propertyId,
        details: {
          purpose: data.purpose,
          amount: data.amount,
          paymentType,
          reservationId: data.reservationId ?? null,
          folioId: data.folioId ?? null,
        },
      }).catch(() => {});

      return {
        paymentIntentId: intentId,
        redirectUrl,
        merchantTransactionId,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      wrapError(err);
    }
  },
);
