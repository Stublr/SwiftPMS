import { collection, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";
import type { Room, RoomType } from "@swiftpms/shared";

function getPath() {
  const { tenantId, propertyId } = usePropertyStore.getState();
  return { tenantId: tenantId!, propertyId: propertyId! };
}

export async function getRooms(): Promise<Room[]> {
  const { tenantId, propertyId } = getPath();
  const snap = await getDocs(collection(db, `tenants/${tenantId}/properties/${propertyId}/rooms`));
  return snap.docs.map((d) => ({ id: d.id, propertyId, ...d.data() }) as Room);
}

export async function getRoomTypes(): Promise<RoomType[]> {
  const { tenantId } = getPath();
  const snap = await getDocs(collection(db, `tenants/${tenantId}/roomTypes`));
  return snap.docs.map((d) => ({ id: d.id, tenantId, ...d.data() }) as RoomType);
}

export async function createRoom(data: Record<string, unknown>): Promise<Room> {
  const { tenantId, propertyId } = getPath();
  const ref = doc(collection(db, `tenants/${tenantId}/properties/${propertyId}/rooms`));
  const now = new Date().toISOString();
  const roomDoc = { ...data, imageUrls: data.imageUrls ?? [], rateOverride: data.rateOverride ?? null, status: "available", currentReservationId: null, isActive: true, updatedAt: now };
  await setDoc(ref, roomDoc);
  return { id: ref.id, propertyId, ...roomDoc } as Room;
}

export async function updateRoom(roomId: string, data: Record<string, unknown>): Promise<void> {
  const { tenantId, propertyId } = getPath();
  await updateDoc(doc(db, `tenants/${tenantId}/properties/${propertyId}/rooms/${roomId}`), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateRoomStatus(roomId: string, status: string): Promise<void> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "updateRoomStatus");
  await fn({ propertyId, roomId, status });
}

export async function createRoomType(data: Record<string, unknown>): Promise<RoomType> {
  const { tenantId } = getPath();
  const ref = doc(collection(db, `tenants/${tenantId}/roomTypes`));
  const now = new Date().toISOString();
  const typeDoc = { ...data, isActive: true, imageUrls: [], createdAt: now, updatedAt: now };
  await setDoc(ref, typeDoc);
  return { id: ref.id, tenantId, ...typeDoc } as unknown as RoomType;
}

export async function updateRoomType(id: string, data: Record<string, unknown>): Promise<void> {
  const { tenantId } = getPath();
  await updateDoc(doc(db, `tenants/${tenantId}/roomTypes/${id}`), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}
