export const PaymentMethod = {
  CASH: "cash",
  CARD: "card",
  /** Physical card terminal at the desk — transaction captured manually by staff. */
  SPEEDPOINT: "speedpoint",
  BANK_TRANSFER: "bank_transfer",
  ONLINE: "online",
  MOBILE_MONEY: "mobile_money",
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/**
 * Methods staff may record MANUALLY on a folio. Excludes:
 *  - CARD — reserved for gateway-settled payments (Peach writes method
 *    "card" on settlement); manual terminal captures are SPEEDPOINT so the
 *    cash-up batch slip reconciles against exactly the terminal takings.
 *  - ONLINE — online payments always arrive via the gateway, never typed in.
 */
export const MANUAL_PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.SPEEDPOINT,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.MOBILE_MONEY,
];

/** Display labels for payment methods (fallback: prettified enum value). */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card (online)",
  speedpoint: "Card — Speedpoint",
  bank_transfer: "Bank Transfer / EFT",
  online: "Online",
  mobile_money: "Mobile Money",
};
