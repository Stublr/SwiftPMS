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
  guestRef,
  paymentIntentRef,
  reservationRef,
} from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";
import {
  PLANKTON_API_KEY,
  PLANKTON_BASE_URL,
  PLANKTON_SANDBOX,
  PLANKTON_TENANT_ID,
  createPlanktonPayment,
} from "./planktonPaymentsClient.js";

// Plankton platform's checkout-result hook. Peach POSTs here first; the
// platform validates HMAC, updates the payment record, then redirects the
// shopper's browser to our `returnUrl`.
const PLANKTON_SHOPPER_RESULT_URL =
  "https://plankton-railways.web.app/api/checkout/result";

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Derive the customer-facing returnUrl from the origin the client provided.
 * We keep the `{paymentId}` literal — the Plankton platform substitutes it
 * with the real paymentId when redirecting the shopper.
 *
 * Accepts either an origin (`https://x.web.app`) or any full URL; strips
 * to origin then appends our confirmation path.
 */
function buildReturnUrl(originHint: string): string {
  let origin: string;
  try {
    origin = new URL(originHint).origin;
  } catch {
    origin = originHint.replace(/\/$/, "");
  }
  return `${origin}/confirmation?paymentId={paymentId}`;
}

/**
 * Initiate a payment through the Plankton Payments platform (railways).
 *
 * Replaces the previous direct Peach HMAC-signing call. The platform now
 * owns Peach interaction; we receive a paymentId + requiresAction.url. The
 * client redirects the customer to that URL; on return we poll
 * `syncPaymentStatus` (see syncPaymentStatus.ts) to settle the folio.
 *
 * The callable name is kept for backward-compatibility with the existing
 * React client. Consider renaming to `initiatePayment` in a future pass.
 */
export const initiatePeachCheckout = onCall(
  {
    cors: true,
    secrets: [PLANKTON_API_KEY],
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
      const paymentType = data.paymentType ?? "DB";
      const currency = (folioData?.currency as string | undefined) ?? "ZAR";

      // Customer info — best-effort. Plankton's API requires givenName +
      // surname. Pull from the linked Guest doc if present; otherwise use
      // the auth user's email and a generic fallback name.
      let givenName = "Guest";
      let surname = "User";
      let customerEmail = request.auth.token.email ?? undefined;
      let customerMobile: string | undefined;
      let guestIdForCustomer: string | null = null;
      try {
        // Get guestId from reservation
        if (data.reservationId) {
          const resSnap = await reservationRef(
            tenantId,
            propertyId,
            data.reservationId,
          ).get();
          guestIdForCustomer = (resSnap.data()?.guestId as string) ?? null;
        }
        if (guestIdForCustomer) {
          const gSnap = await guestRef(tenantId, guestIdForCustomer).get();
          if (gSnap.exists) {
            const g = gSnap.data()!;
            givenName = (g.firstName as string) || givenName;
            surname = (g.lastName as string) || surname;
            customerEmail = (g.email as string) || customerEmail;
            customerMobile = (g.phone as string) || undefined;
          }
        }
      } catch {
        // Best-effort; keep going with fallback values.
      }

      const planktonRes = await createPlanktonPayment({
        idempotencyKey: intentId,
        amount: data.amount,
        currency,
        paymentMethod: "card",
        channel: "online",
        captureMode: paymentType === "PA" ? "manual" : "automatic",
        orderReference: data.reservationId ?? data.folioId ?? intentId,
        // returnUrl = where the shopper's BROWSER lands. Our confirmation
        // page reads ?paymentId= and syncs status against the platform.
        returnUrl: buildReturnUrl(data.shopperResultUrl),
        // shopperResultUrl = Plankton's own hook. Peach POSTs here first.
        shopperResultUrl: PLANKTON_SHOPPER_RESULT_URL,
        customer: {
          givenName,
          surname,
          email: customerEmail,
          mobile: customerMobile,
        },
      });

      const redirectUrl = planktonRes.requiresAction?.url;
      if (!redirectUrl) {
        // Surface Plankton's failure details so the client + Cloud Functions
        // logs both show WHY. Common reasons observed live:
        //   - configuration_error: gateway auth broken on platform side
        //   - provider_error: Peach rejected (e.g. domain not allowlisted,
        //     merchantTransactionId too short)
        const details = {
          planktonPaymentId: planktonRes.paymentId,
          planktonStatus: planktonRes.status,
          failureReason: planktonRes.failureReason ?? null,
          failureMessage: planktonRes.failureMessage ?? null,
          providerName: (planktonRes as { providerName?: string }).providerName ?? null,
        };
        console.error("Plankton payment failed at initiate", details);
        const reasonText =
          planktonRes.failureMessage ||
          planktonRes.failureReason ||
          `status=${planktonRes.status}`;
        throw new Error(
          `Plankton payment failed: ${reasonText} (paymentId=${planktonRes.paymentId})`,
        );
      }

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
        // New Plankton-platform fields
        planktonPaymentId: planktonRes.paymentId,
        planktonTenantId: PLANKTON_TENANT_ID,
        planktonSandbox: PLANKTON_SANDBOX.value() === "true",
        planktonBaseUrl: PLANKTON_BASE_URL.value(),
        // Legacy Peach-direct fields kept null for shape compatibility
        peachCheckoutId: null,
        peachPaymentId: null,
        peachResultCode: null,
        peachResultDescription: null,
        paymentType,
        merchantTransactionId: intentId,
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
          planktonPaymentId: planktonRes.paymentId,
          reservationId: data.reservationId ?? null,
          folioId: data.folioId ?? null,
        },
      }).catch(() => {});

      return {
        paymentIntentId: intentId,
        redirectUrl,
        merchantTransactionId: intentId,
        planktonPaymentId: planktonRes.paymentId,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      wrapError(err);
    }
  },
);
