import { httpsCallable } from "firebase/functions";
import { doc, onSnapshot } from "firebase/firestore";

import { PaymentIntentStatus, type PaymentIntent } from "@swiftpms/shared";

import { db, functions } from "@/lib/firebase";

export interface InitiatePeachCheckoutInput {
  purpose: "guest_booking" | "folio_settlement" | "card_on_arrival_preauth";
  amount: number; // cents
  propertyId: string;
  reservationId?: string;
  folioId?: string;
  paymentType?: "DB" | "PA";
  shopperResultUrl: string;
}

export interface InitiatePeachCheckoutResult {
  paymentIntentId: string;
  redirectUrl: string;
  merchantTransactionId: string;
  planktonPaymentId?: string;
}

export interface SyncPaymentStatusInput {
  propertyId: string;
  paymentIntentId: string;
  forceSync?: boolean;
}

export interface SyncPaymentStatusResult {
  paymentIntentId: string;
  status: PaymentIntentStatus;
  planktonStatus?: string;
  terminal: boolean;
}

export async function syncPaymentStatus(
  input: SyncPaymentStatusInput,
): Promise<SyncPaymentStatusResult> {
  const fn = httpsCallable<SyncPaymentStatusInput, SyncPaymentStatusResult>(
    functions,
    "syncPaymentStatus",
  );
  const result = await fn(input);
  return result.data;
}

export async function initiatePeachCheckout(
  input: InitiatePeachCheckoutInput,
): Promise<InitiatePeachCheckoutResult> {
  const fn = httpsCallable<
    InitiatePeachCheckoutInput,
    InitiatePeachCheckoutResult
  >(functions, "initiatePeachCheckout");
  const result = await fn(input);
  return result.data;
}

/**
 * Subscribes to a PaymentIntent document and invokes the callback on each
 * status change. Returns an unsubscribe function.
 */
export function watchPaymentIntent(
  tenantId: string,
  propertyId: string,
  paymentIntentId: string,
  cb: (intent: PaymentIntent | null) => void,
): () => void {
  const ref = doc(
    db,
    `tenants/${tenantId}/properties/${propertyId}/paymentIntents/${paymentIntentId}`,
  );
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb({ id: snap.id, ...snap.data() } as PaymentIntent);
    },
    () => cb(null),
  );
}

export const TERMINAL_INTENT_STATUSES: PaymentIntentStatus[] = [
  PaymentIntentStatus.SUCCEEDED,
  PaymentIntentStatus.FAILED,
  PaymentIntentStatus.CANCELLED,
  PaymentIntentStatus.EXPIRED,
];
