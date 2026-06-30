import crypto from "node:crypto";

import { defineSecret } from "firebase-functions/params";

// Use `any` for the return type to dodge the un-exported SecretParam class.
// Runtime contract is what matters: each has a .value() string accessor.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PEACH_ENTITY_ID: any = defineSecret("PEACH_ENTITY_ID");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PEACH_SECRET: any = defineSecret("PEACH_SECRET");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PEACH_ENV: any = defineSecret("PEACH_ENV");

const TEST_BASE = "https://testsecure.peachpayments.com/";
const LIVE_BASE = "https://secure.peachpayments.com/";

export function peachBase(): string {
  return PEACH_ENV.value() === "live" ? LIVE_BASE : TEST_BASE;
}

/**
 * Generate the Peach Payments HMAC-SHA256 signature over sorted form params.
 * Matches the proven sp_payments implementation.
 */
export function generatePeachSignature(
  params: Record<string, string>,
  secret: string,
): string {
  const keys = Object.keys(params).sort();
  const concatenated = keys.map((k) => `${k}${params[k]}`).join("");
  return crypto
    .createHmac("sha256", secret)
    .update(concatenated, "utf8")
    .digest("hex");
}

/**
 * Verifies a Peach webhook callback signature.
 */
export function verifyPeachSignature(
  params: Record<string, string>,
  receivedSignature: string,
  secret: string,
): boolean {
  const { signature: _omit, ...rest } = params;
  const expected = generatePeachSignature(rest, secret);
  // Constant-time comparison
  if (expected.length !== receivedSignature.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(receivedSignature, "utf8"),
  );
}

/**
 * POST to Peach's checkout/initiate endpoint with form-encoded body + signature.
 * Returns the redirectUrl on success, throws on failure.
 */
export async function initiateCheckoutAtPeach(params: {
  entityId: string;
  secret: string;
  amount: string; // major-unit string e.g. "100.00"
  currency: string;
  paymentType: "DB" | "PA";
  merchantTransactionId: string;
  nonce: string;
  customerEmail?: string;
  customerGivenName?: string;
  customerSurname?: string;
  customerMobile?: string;
  shopperResultUrl: string;
  cancelUrl: string;
  notificationUrl: string;
  customParameters?: Record<string, string>;
}): Promise<{ redirectUrl: string; checkoutId?: string }> {
  // Field names mirror the proven sp_payments implementation
  // (lib/src/models/payments/peachPayments/peach_pay_model.dart::toMap).
  // Peach SA expects 'authentication.entityId' (dotted), not 'entityID'.
  const body: Record<string, string> = {
    "authentication.entityId": params.entityId,
    merchantTransactionId: params.merchantTransactionId,
    amount: params.amount,
    paymentType: params.paymentType,
    currency: params.currency,
    nonce: params.nonce,
    shopperResultUrl: params.shopperResultUrl,
    defaultPaymentMethod: "",
    forceDefaultMethod: "false",
    cancelUrl: params.cancelUrl,
    notificationUrl: params.notificationUrl,
    createRegistration: "false",
    allowStoredCards: "true",
  };
  if (params.customerEmail)
    body["customer.email"] = params.customerEmail;
  if (params.customerGivenName)
    body["customer.givenName"] = params.customerGivenName;
  if (params.customerSurname)
    body["customer.surname"] = params.customerSurname;
  if (params.customerMobile)
    body["customer.mobile"] = params.customerMobile;
  if (params.customParameters) {
    for (const [k, v] of Object.entries(params.customParameters)) {
      body[`customParameters[${k}]`] = v;
    }
  }

  const signature = generatePeachSignature(body, params.secret);
  body.signature = signature;

  const encoded = Object.entries(body)
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
    )
    .join("&");

  const res = await fetch(`${peachBase()}checkout/initiate`, {
    method: "POST",
    headers: {
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encoded,
  });

  if (res.status !== 201 && res.status !== 200) {
    const text = await res.text();
    throw new Error(`Peach checkout/initiate failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    redirectUrl?: string;
    id?: string;
    [k: string]: unknown;
  };
  if (!json.redirectUrl) {
    throw new Error(
      `Peach response missing redirectUrl: ${JSON.stringify(json)}`,
    );
  }
  return { redirectUrl: json.redirectUrl, checkoutId: json.id };
}
