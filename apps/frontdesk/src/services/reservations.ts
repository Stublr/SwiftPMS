import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";
import type { Reservation, CreateReservationRequest } from "@swiftpms/shared";

function getPath() {
  const { tenantId, propertyId } = usePropertyStore.getState();
  return { tenantId: tenantId!, propertyId: propertyId! };
}

export async function getReservations(status?: string): Promise<Reservation[]> {
  const { tenantId, propertyId } = getPath();
  const colRef = collection(db, `tenants/${tenantId}/properties/${propertyId}/reservations`);
  const constraints: unknown[] = [orderBy("createdAt", "desc"), limit(100)];
  if (status) constraints.unshift(where("status", "==", status));
  const snap = await getDocs(query(colRef, ...(constraints as Parameters<typeof query>[1][])));
  return snap.docs.map((d) => ({ id: d.id, propertyId, ...d.data() }) as Reservation);
}

export async function createReservation(data: CreateReservationRequest): Promise<{ id: string }> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "createReservation");
  const result = await fn({ ...data, propertyId });
  return result.data as { id: string };
}

export async function checkInReservation(reservationId: string, roomId?: string): Promise<void> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "checkIn");
  await fn({ reservationId, roomId, propertyId });
}

export async function checkOutReservation(reservationId: string): Promise<void> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "checkOut");
  await fn({ reservationId, propertyId });
}

export async function cancelReservation(reservationId: string, reason?: string): Promise<void> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "cancelReservation");
  await fn({ reservationId, reason, propertyId });
}
