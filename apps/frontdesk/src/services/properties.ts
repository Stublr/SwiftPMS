import { collection, doc, getDocs, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";
import type { Property, CreatePropertyRequest, UpdatePropertyRequest } from "@swiftpms/shared";

function getTenantId(): string {
  return usePropertyStore.getState().tenantId!;
}

export async function getProperties(): Promise<Property[]> {
  const tenantId = getTenantId();
  const snap = await getDocs(collection(db, `tenants/${tenantId}/properties`));
  return snap.docs.map((d) => ({ id: d.id, tenantId, ...d.data() }) as Property);
}

export async function createProperty(data: CreatePropertyRequest): Promise<string> {
  const tenantId = getTenantId();
  const ref = doc(collection(db, `tenants/${tenantId}/properties`));
  await setDoc(ref, {
    name: data.name,
    address: data.address ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    description: data.description ?? null,
    imageUrls: (data as Record<string, unknown>).imageUrls ?? [],
    amenities: data.amenities ?? [],
    checkInTime: data.checkInTime ?? "14:00",
    checkOutTime: data.checkOutTime ?? "11:00",
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProperty(propertyId: string, data: UpdatePropertyRequest): Promise<void> {
  const tenantId = getTenantId();
  const ref = doc(db, `tenants/${tenantId}/properties/${propertyId}`);
  // Strip undefined values — Firestore rejects them
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) clean[k] = v;
  }
  clean.updatedAt = serverTimestamp();
  await updateDoc(ref, clean);
}
