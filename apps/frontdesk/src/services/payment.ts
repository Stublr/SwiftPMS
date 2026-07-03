import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { type PaymentIntent } from "@swiftpms/shared";

import { db, functions } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";

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

export interface SyncPaymentStatusInput {
  propertyId: string;
  paymentIntentId: string;
  forceSync?: boolean;
}

export interface SyncPaymentStatusResult {
  paymentIntentId: string;
  status:
    | "initiated"
    | "redirected"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "expired";
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

/**
 * Every payment attempt (successful, failed, in-flight) for a reservation.
 * Feeds the "Payment attempts" section on mobile-folio so cashiers can see
 * exactly what happened when a guest says "I paid but it says I owe R720"
 * — the intent history shows every attempt with its terminal status +
 * failure reason from Peach (via Plankton).
 */
export async function getPaymentIntentsForReservation(
  reservationId: string,
): Promise<PaymentIntent[]> {
  const { tenantId, propertyId } = usePropertyStore.getState();
  if (!tenantId || !propertyId) return [];
  const snap = await getDocs(
    query(
      collection(
        db,
        `tenants/${tenantId}/properties/${propertyId}/paymentIntents`,
      ),
      where("reservationId", "==", reservationId),
      orderBy("initiatedAt", "desc"),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentIntent);
}

/**
 * Subscribes to a PaymentIntent document. Returns an unsubscribe function.
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
