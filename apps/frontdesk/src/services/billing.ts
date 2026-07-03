import { collection, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";
import type { Folio, AddChargeRequest, ProcessPaymentRequest } from "@swiftpms/shared";

function getPath() {
  const { tenantId, propertyId } = usePropertyStore.getState();
  return { tenantId: tenantId!, propertyId: propertyId! };
}

export async function getFolioByReservation(reservationId: string): Promise<Folio | null> {
  const { tenantId, propertyId } = getPath();
  const snap = await getDocs(
    query(collection(db, `tenants/${tenantId}/properties/${propertyId}/folios`), where("reservationId", "==", reservationId)),
  );
  if (snap.empty) return null;
  const d = snap.docs[0]!;
  return { id: d.id, propertyId, ...d.data() } as Folio;
}

/** Generate a client-side idempotency token. Prevents concurrent double-click from double-writing. */
function genClientRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function addCharge(
  data: Omit<AddChargeRequest, "folioId"> & { folioId: string; clientRequestId?: string },
): Promise<void> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "addCharge");
  await fn({
    ...data,
    propertyId,
    clientRequestId: data.clientRequestId ?? genClientRequestId("chg"),
  });
}

export async function processPayment(
  data: Omit<ProcessPaymentRequest, "folioId"> & { folioId: string; clientRequestId?: string },
): Promise<void> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "processPayment");
  // Client-generated idempotency key. Server dedupes on this — a double-click
  // (accidental, network-retry, browser stall) with the same key becomes a
  // no-op instead of a second payment row.
  await fn({
    ...data,
    propertyId,
    clientRequestId: data.clientRequestId ?? genClientRequestId("pmt"),
  });
}
