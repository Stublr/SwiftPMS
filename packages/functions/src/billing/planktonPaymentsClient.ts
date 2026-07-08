import { defineSecret, defineString } from "firebase-functions/params";

// Plankton Payments platform (railways) — replaces direct Peach HMAC signing.
// We POST payment-create requests to the platform; it handles Peach (sandbox
// or live, decided by `sandbox: true/false` per request) and returns a
// requiresAction.url we redirect the customer to. After the customer pays,
// the platform is the authoritative system-of-record; we poll
// GET /payments/:id (or POST /payments/:id/sync) to settle the folio.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLANKTON_API_KEY: any = defineSecret("PLANKTON_API_KEY");

// Non-secret config. Defaults are intentionally the staging URL so a fresh
// deploy still works against sandbox. Override per-deploy with the
// PLANKTON_BASE_URL env var to switch to production.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLANKTON_BASE_URL: any = defineString("PLANKTON_BASE_URL", {
  default: "https://apiza-kd26l422ja-bq.a.run.app/api",
});

// "true" or "false". Determines whether Peach charges sandbox cards (no real
// money) or live cards. Pinned to staging-default; flip to "false" alongside
// PLANKTON_BASE_URL when going live.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLANKTON_SANDBOX: any = defineString("PLANKTON_SANDBOX", {
  default: "true",
});

// Return URL template sent to Peach via Plankton's POST /payments — where the
// shopper's browser lands after paying. Peach validates the domain against the
// merchant allowlist. This is the DEFAULT / FRONTDESK return URL, used for
// frontdesk purposes (folio_settlement, card_on_arrival_preauth). The guest
// booking website uses PLANKTON_GUEST_RETURN_URL_TEMPLATE (below) instead, so
// this value/behaviour is unchanged. The literal "{paymentId}" is substituted
// by the Plankton platform.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLANKTON_RETURN_URL_TEMPLATE: any = defineString(
  "PLANKTON_RETURN_URL_TEMPLATE",
  {
    default: "https://lite.plnktn.io/confirmation?paymentId={paymentId}",
  },
);

// Return URL for the GUEST booking website only (purpose === "guest_booking").
// Peach allowlists swiftpms-guest.web.app, so the guest returnUrl points there;
// the guest confirmation page then client-side redirects the shopper on to the
// bookings.algafusion.com custom domain (where the booking's localStorage
// snapshot lives). Kept separate from PLANKTON_RETURN_URL_TEMPLATE so the
// frontdesk flow is unaffected. The literal "{paymentId}" is substituted by
// the Plankton platform.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLANKTON_GUEST_RETURN_URL_TEMPLATE: any = defineString(
  "PLANKTON_GUEST_RETURN_URL_TEMPLATE",
  {
    default: "https://swiftpms-guest.web.app/confirmation?paymentId={paymentId}",
  },
);

export const PLANKTON_TENANT_ID = "swiftpms";

export interface CreatePaymentInput {
  idempotencyKey: string;
  amount: number; // minor units (cents)
  currency: string; // "ZAR"
  paymentMethod: "card" | "eft" | "capitec_pay";
  channel: "online";
  captureMode: "automatic" | "manual";
  orderReference: string;
  /** Where Plankton redirects the shopper's browser after payment. */
  returnUrl: string;
  /** Peach → Plankton hook. Must be Plankton's own /checkout/result URL. */
  shopperResultUrl?: string;
  customer: {
    givenName: string;
    surname: string;
    email?: string;
    mobile?: string;
  };
}

export interface PaymentResponse {
  paymentId: string;
  status: PlanktonStatus;
  amount?: number;
  currency?: string;
  orderReference?: string;
  failureReason?: string;
  failureMessage?: string;
  providerName?: string;
  providerReference?: string;
  requiresAction?: {
    type?: "redirect";
    actionType?: string;
    url: string;
    httpMethod?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export type PlanktonStatus =
  | "created"
  | "authorizing"
  | "requires_action"
  | "authorized"
  | "captured"
  | "declined"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "refunded"
  | "partially_refunded"
  | "disputed"
  | "chargeback_received"
  | "chargeback_resolved";

const TERMINAL_FAIL: PlanktonStatus[] = [
  "declined",
  "failed",
  "cancelled",
  "timed_out",
];

/**
 * `captured` = funds settled by the gateway. This is the only Plankton status
 * we treat as a successful settlement in automatic-capture mode (guest
 * booking flow).
 */
export function isCaptured(s: PlanktonStatus): boolean {
  return s === "captured";
}

/**
 * `authorized` = funds held but NOT captured. Per Aidan's spec:
 * "Only if we ever use manual capture; otherwise treat as pending."
 * Callers must decide based on their captureMode whether to settle.
 */
export function isAuthorized(s: PlanktonStatus): boolean {
  return s === "authorized";
}

export function isRefunded(s: PlanktonStatus): boolean {
  return s === "refunded" || s === "partially_refunded";
}

export function isTerminalFailure(s: PlanktonStatus): boolean {
  return TERMINAL_FAIL.includes(s);
}

/** Any state that ends the polling loop. */
export function isTerminal(s: PlanktonStatus): boolean {
  return isCaptured(s) || isRefunded(s) || isTerminalFailure(s);
}

function baseUrl(): string {
  const v = PLANKTON_BASE_URL.value();
  return v.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${PLANKTON_API_KEY.value()}`,
    "Content-Type": "application/json",
  };
}

export async function createPlanktonPayment(
  input: CreatePaymentInput,
): Promise<PaymentResponse> {
  const body = {
    ...input,
    tenantId: PLANKTON_TENANT_ID,
    sandbox: PLANKTON_SANDBOX.value() === "true",
  };
  // Log the outbound request (minus PII / secrets) so we can trace what
  // shape we sent when things go wrong. Never log the Authorization header
  // or the full customer object; the fields below are safe.
  console.log("Plankton POST /payments", {
    idempotencyKey: input.idempotencyKey,
    amount: input.amount,
    currency: input.currency,
    paymentMethod: input.paymentMethod,
    channel: input.channel,
    captureMode: input.captureMode,
    orderReference: input.orderReference,
    tenantId: PLANKTON_TENANT_ID,
    sandbox: body.sandbox,
    returnUrl: input.returnUrl,
    shopperResultUrl: input.shopperResultUrl,
    customerEmail: input.customer.email ? "<set>" : "<absent>",
  });
  const res = await fetch(`${baseUrl()}/payments`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Plankton POST /payments HTTP ${res.status}`, text.slice(0, 500));
    throw new Error(
      `Plankton POST /payments failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  const parsed = JSON.parse(text) as PaymentResponse;
  // Always log the terminal-signal fields so debugging doesn't require a
  // repro via curl.
  console.log("Plankton POST /payments response", {
    paymentId: parsed.paymentId,
    status: parsed.status,
    failureReason: parsed.failureReason ?? null,
    failureMessage: parsed.failureMessage ?? null,
    providerName: parsed.providerName ?? null,
    hasRequiresAction: Boolean(parsed.requiresAction?.url),
  });
  return parsed;
}

export async function getPlanktonPayment(
  paymentId: string,
): Promise<PaymentResponse> {
  const res = await fetch(
    `${baseUrl()}/payments/${encodeURIComponent(paymentId)}`,
    { headers: authHeaders() },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Plankton GET /payments/${paymentId} failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  return JSON.parse(text) as PaymentResponse;
}

/**
 * Force-resync a payment with the gateway when the customer's browser
 * never returned with the result. Cheap to call; safe to call repeatedly.
 */
export async function syncPlanktonPayment(
  paymentId: string,
): Promise<PaymentResponse> {
  const res = await fetch(
    `${baseUrl()}/payments/${encodeURIComponent(paymentId)}/sync`,
    { method: "POST", headers: authHeaders() },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Plankton POST /payments/${paymentId}/sync failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  return JSON.parse(text) as PaymentResponse;
}
