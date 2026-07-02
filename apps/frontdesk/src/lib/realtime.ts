import { collection, doc, onSnapshot, query, where, orderBy, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";
import type { Room, Reservation } from "@swiftpms/shared";

function getPath() {
  const { tenantId, propertyId } = usePropertyStore.getState();
  return { tenantId: tenantId!, propertyId: propertyId! };
}

export function onRooms(callback: (rooms: Room[]) => void): Unsubscribe {
  const { tenantId, propertyId } = getPath();
  const colRef = collection(db, `tenants/${tenantId}/properties/${propertyId}/rooms`);
  // Only stream ACTIVE rooms — inactive rooms (e.g. hidden Eden Park sites)
  // should not appear in dashboard occupancy, room board grids, or any other
  // client view. Admin pages that need to see deactivated inventory query
  // rooms directly without this helper.
  const q = query(colRef, where("isActive", "==", true));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, propertyId, ...d.data() }) as Room));
  }, () => callback([]));
}

export function onTodayReservations(callback: (reservations: Reservation[]) => void): Unsubscribe {
  const { tenantId, propertyId } = getPath();
  const today = new Date().toISOString().split("T")[0]!;
  const colRef = collection(db, `tenants/${tenantId}/properties/${propertyId}/reservations`);
  const q = query(colRef, where("checkInDate", "==", today), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, propertyId, ...d.data() }) as Reservation));
  }, () => callback([]));
}

export function onTodayDepartures(callback: (reservations: Reservation[]) => void): Unsubscribe {
  const { tenantId, propertyId } = getPath();
  const today = new Date().toISOString().split("T")[0]!;
  const colRef = collection(db, `tenants/${tenantId}/properties/${propertyId}/reservations`);
  const q = query(colRef, where("checkOutDate", "==", today), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, propertyId, ...d.data() }) as Reservation));
  }, () => callback([]));
}

export function onDailyAggregates(callback: (data: Record<string, number> | null) => void): Unsubscribe {
  const { tenantId, propertyId } = getPath();
  const today = new Date().toISOString().split("T")[0]!;
  const ref = doc(db, `tenants/${tenantId}/properties/${propertyId}/dailyAggregates/${today}`);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? (snap.data() as Record<string, number>) : null);
  }, () => callback(null));
}
