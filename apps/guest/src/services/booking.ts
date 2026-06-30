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
import { getTenantId } from "@/services/property";
import type { Reservation } from "@swiftpms/shared";

export async function createBooking(data: {
  guestId: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  specialRequests?: string;
  propertyId: string;
}): Promise<{
  id: string;
  folioId: string;
  nightCount: number;
  roomRate: number;
  totalRoomCharges: number;
}> {
  const fn = httpsCallable(functions, "createGuestReservation");
  const result = await fn(data);
  return result.data as {
    id: string;
    folioId: string;
    nightCount: number;
    roomRate: number;
    totalRoomCharges: number;
  };
}

export async function getMyBookings(): Promise<Reservation[]> {
  const { guestId, tenantId } = useGuestAuthStore.getState();
  if (!guestId || !tenantId) return [];

  // Fetch bookings across all properties
  const tenantIdToUse = tenantId || getTenantId();
  const propsSnap = await getDocs(collection(db, `tenants/${tenantIdToUse}/properties`));

  const allBookings: Reservation[] = [];
  for (const propDoc of propsSnap.docs) {
    const colRef = collection(
      db,
      `tenants/${tenantIdToUse}/properties/${propDoc.id}/reservations`,
    );
    const q = query(
      colRef,
      where("guestId", "==", guestId),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      allBookings.push({
        id: d.id,
        propertyId: propDoc.id,
        ...d.data(),
      } as Reservation);
    }
  }

  return allBookings;
}
