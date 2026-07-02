import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";
import type { Reservation, CreateReservationRequest } from "@swiftpms/shared";

function getPath() {
  const { tenantId, propertyId } = usePropertyStore.getState();
  return { tenantId: tenantId!, propertyId: propertyId! };
}

export async function getReservation(reservationId: string): Promise<Reservation | null> {
  const { tenantId, propertyId } = getPath();
  const snap = await getDoc(
    doc(db, `tenants/${tenantId}/properties/${propertyId}/reservations/${reservationId}`),
  );
  if (!snap.exists()) return null;
  return { id: snap.id, propertyId, ...snap.data() } as Reservation;
}

export async function getReservations(status?: string): Promise<Reservation[]> {
  const { tenantId, propertyId } = getPath();
  const colRef = collection(db, `tenants/${tenantId}/properties/${propertyId}/reservations`);
  const constraints: unknown[] = [orderBy("createdAt", "desc"), limit(100)];
  if (status) constraints.unshift(where("status", "==", status));
  const snap = await getDocs(query(colRef, ...(constraints as Parameters<typeof query>[1][])));
  return snap.docs.map((d) => ({ id: d.id, propertyId, ...d.data() }) as Reservation);
}

/**
 * Targeted query for "today's arrivals" — confirmed reservations whose
 * checkInDate equals today. Bypasses the 100-row cap of getReservations()
 * which orders by createdAt desc and would miss bookings made months ago.
 */
export async function getArrivalsForDate(date: string): Promise<Reservation[]> {
  const { tenantId, propertyId } = getPath();
  const colRef = collection(db, `tenants/${tenantId}/properties/${propertyId}/reservations`);
  const snap = await getDocs(
    query(
      colRef,
      where("status", "==", "confirmed"),
      where("checkInDate", "==", date),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, propertyId, ...d.data() }) as Reservation);
}

/**
 * Targeted query for "today's departures" — checked-in reservations whose
 * checkOutDate equals today.
 */
export async function getDeparturesForDate(date: string): Promise<Reservation[]> {
  const { tenantId, propertyId } = getPath();
  const colRef = collection(db, `tenants/${tenantId}/properties/${propertyId}/reservations`);
  const snap = await getDocs(
    query(
      colRef,
      where("status", "==", "checked_in"),
      where("checkOutDate", "==", date),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, propertyId, ...d.data() }) as Reservation);
}

/**
 * In-house — checked-in reservations spanning today (checkInDate <= today < checkOutDate).
 * Firestore can only range-query on a single field, so we fetch on checkOutDate
 * (must be > today) then filter checkInDate <= today client-side.
 */
export async function getInHouseForDate(date: string): Promise<Reservation[]> {
  const { tenantId, propertyId } = getPath();
  const colRef = collection(db, `tenants/${tenantId}/properties/${propertyId}/reservations`);
  const snap = await getDocs(
    query(
      colRef,
      where("status", "==", "checked_in"),
      where("checkOutDate", ">", date),
    ),
  );
  return snap.docs
    .map((d) => ({ id: d.id, propertyId, ...d.data() }) as Reservation)
    .filter((r) => r.checkInDate <= date);
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
