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
  requiresAction?: {
    type?: "redirect";
    url: string;
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

export function isTerminalSuccess(s: PlanktonStatus): boolean {
  return s === "captured" || s === "authorized";
}

export function isTerminalFailure(s: PlanktonStatus): boolean {
  return TERMINAL_FAIL.includes(s);
}

export function isTerminal(s: PlanktonStatus): boolean {
  return isTerminalSuccess(s) || isTerminalFailure(s);
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
  const res = await fetch(`${baseUrl()}/payments`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Plankton POST /payments failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  return JSON.parse(text) as PaymentResponse;
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
