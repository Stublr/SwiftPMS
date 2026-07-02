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

/**
 * Cancel a reservation the guest just created. Used to roll back the
 * reservation + folio + room hold when the subsequent payment-init call
 * fails (otherwise we leave orphan held rooms blocking inventory).
 */
export async function cancelOwnReservation(
  reservationId: string,
  propertyId: string,
  reason = "payment_init_failed",
): Promise<void> {
  const fn = httpsCallable(functions, "cancelReservation");
  await fn({ reservationId, propertyId, reason });
}

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

/**
 * Group booking: create N reservations (one per campsite) tied to a single
 * folio. All items share dates + specialRequests; each has its own guest
 * count so tiered per-person pricing calculates correctly.
 */
export async function createBookingGroup(data: {
  guestId: string;
  propertyId: string;
  checkInDate: string;
  checkOutDate: string;
  items: { roomTypeId: string; adults: number; children: number }[];
  specialRequests?: string;
  clientRequestId?: string;
}): Promise<{
  groupId: string;
  reservationIds: string[];
  folioId: string;
  nightCount: number;
  totalRoomCharges: number;
}> {
  const fn = httpsCallable(functions, "createGuestReservationGroup");
  const result = await fn(data);
  return result.data as {
    groupId: string;
    reservationIds: string[];
    folioId: string;
    nightCount: number;
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
