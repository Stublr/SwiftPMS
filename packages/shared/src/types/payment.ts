import type {
  PaymentIntentPurpose,
  PaymentIntentStatus,
} from "../constants/payment-intent-status.js";

export interface PaymentIntent {
  id: string;
  tenantId: string;
  propertyId: string;
  reservationId: string | null;
  folioId: string | null;
  purpose: PaymentIntentPurpose;
  amount: number; // cents
  currency: string; // ISO 4217, e.g. "ZAR"
  status: PaymentIntentStatus;
  peachCheckoutId: string | null;
  peachPaymentId: string | null;
  peachResultCode: string | null;
  peachResultDescription: string | null;
  paymentType: "DB" | "PA"; // DB = debit/charge, PA = pre-auth
  merchantTransactionId: string;
  redirectUrl: string | null;
  shopperResultUrl: string;
  initiatedBy: string;
  initiatedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface InitiatePeachCheckoutRequest {
  purpose: PaymentIntentPurpose;
  amount: number; // cents
  reservationId?: string;
  folioId?: string;
  paymentType?: "DB" | "PA";
  shopperResultUrl: string;
}

export interface InitiatePeachCheckoutResponse {
  paymentIntentId: string;
  redirectUrl: string;
  merchantTransactionId: string;
}
