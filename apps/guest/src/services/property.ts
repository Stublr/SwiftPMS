import { doc, getDoc, collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

const TENANT_ID = import.meta.env.VITE_TENANT_ID || "demo-tenant";

export interface PropertyInfo {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  amenities: string[];
  imageUrls: string[];
  checkInTime: string;
  checkOutTime: string;
  isActive: boolean;
}

export async function getPropertyInfo(propertyId?: string): Promise<PropertyInfo> {
  const pid = propertyId ?? (import.meta.env.VITE_PROPERTY_ID || "demo-property");
  const snap = await getDoc(doc(db, `tenants/${TENANT_ID}/properties/${pid}`));
  if (!snap.exists()) throw new Error("Property not found");
  const data = snap.data();
  return mapProperty(pid, data);
}

export async function getAllProperties(): Promise<PropertyInfo[]> {
  const snap = await getDocs(
    query(
      collection(db, `tenants/${TENANT_ID}/properties`),
      where("isActive", "==", true),
    ),
  );
  return snap.docs
    .map((d) => mapProperty(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapProperty(id: string, data: Record<string, unknown>): PropertyInfo {
  return {
    id,
    name: data.name as string,
    address: (data.address as string) ?? null,
    description: (data.description as string) ?? null,
    phone: (data.phone as string) ?? null,
    email: (data.email as string) ?? null,
    amenities: (data.amenities as string[]) ?? [],
    imageUrls: (data.imageUrls as string[]) ?? [],
    checkInTime: (data.checkInTime as string) ?? "14:00",
    checkOutTime: (data.checkOutTime as string) ?? "11:00",
    isActive: data.isActive as boolean,
  };
}

export function getTenantId(): string {
  return TENANT_ID;
}
