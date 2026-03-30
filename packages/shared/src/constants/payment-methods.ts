export const PaymentMethod = {
  CASH: "cash",
  CARD: "card",
  BANK_TRANSFER: "bank_transfer",
  ONLINE: "online",
  MOBILE_MONEY: "mobile_money",
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
