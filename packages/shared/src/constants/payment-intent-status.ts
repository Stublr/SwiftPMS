export const PaymentIntentStatus = {
  INITIATED: "initiated",
  REDIRECTED: "redirected",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
} as const;

export type PaymentIntentStatus =
  (typeof PaymentIntentStatus)[keyof typeof PaymentIntentStatus];

export const PaymentIntentPurpose = {
  GUEST_BOOKING: "guest_booking",
  FOLIO_SETTLEMENT: "folio_settlement",
  CARD_ON_ARRIVAL_PREAUTH: "card_on_arrival_preauth",
} as const;

export type PaymentIntentPurpose =
  (typeof PaymentIntentPurpose)[keyof typeof PaymentIntentPurpose];

export const PEACH_RESULT_CODE_SUCCESS = "000.000.000";
