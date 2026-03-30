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

export async function addCharge(data: Omit<AddChargeRequest, "folioId"> & { folioId: string }): Promise<void> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "addCharge");
  await fn({ ...data, propertyId });
}

export async function processPayment(data: Omit<ProcessPaymentRequest, "folioId"> & { folioId: string }): Promise<void> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "processPayment");
  await fn({ ...data, propertyId });
}
