import { httpsCallable } from "firebase/functions";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { functions, db } from "@/lib/firebase";
import { useGuestAuthStore } from "@/stores/auth.store";
import type { Reservation } from "@swiftpms/shared";

const PROPERTY_ID = import.meta.env.VITE_PROPERTY_ID || "demo-property";

export async function createBooking(data: {
  guestId: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  specialRequests?: string;
}): Promise<{ id: string }> {
  const fn = httpsCallable(functions, "createGuestReservation");
  const result = await fn({ ...data, propertyId: PROPERTY_ID });
  return result.data as { id: string };
}

export async function getMyBookings(): Promise<Reservation[]> {
  const { guestId, tenantId } = useGuestAuthStore.getState();
  if (!guestId || !tenantId) return [];
  const colRef = collection(
    db,
    `tenants/${tenantId}/properties/${PROPERTY_ID}/reservations`,
  );
  const q = query(
    colRef,
    where("guestId", "==", guestId),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map(
    (d) =>
      ({ id: d.id, propertyId: PROPERTY_ID, ...d.data() }) as Reservation,
  );
}
