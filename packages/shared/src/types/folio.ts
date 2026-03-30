import type { ChargeCategory } from "../constants/charge-category.js";
import type { FolioStatus } from "../constants/folio-status.js";
import type { PaymentMethod } from "../constants/payment-methods.js";

export interface FolioCharge {
  id: string;
  category: ChargeCategory;
  description: string;
  amount: number; // cents
  quantity: number;
  total: number; // cents
  date: string; // YYYY-MM-DD
  addedBy: string;
  addedAt: string;
}

export interface FolioPayment {
  id: string;
  method: PaymentMethod;
  amount: number; // cents
  reference: string | null;
  processedBy: string;
  processedAt: string;
}

export interface Folio {
  id: string;
  propertyId: string;
  reservationId: string;
  guestId: string;
  charges: FolioCharge[];
  payments: FolioPayment[];
  totalCharges: number; // cents
  totalPayments: number; // cents
  balance: number; // cents (totalCharges - totalPayments)
  status: FolioStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AddChargeRequest {
  folioId: string;
  category: ChargeCategory;
  description: string;
  amount: number; // cents
  quantity: number;
}

export interface ProcessPaymentRequest {
  folioId: string;
  method: PaymentMethod;
  amount: number; // cents
  reference?: string;
}
