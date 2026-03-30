import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";
import type { Property } from "@swiftpms/shared";

function getTenantId(): string {
  return usePropertyStore.getState().tenantId!;
}

export async function getProperties(): Promise<Property[]> {
  const tenantId = getTenantId();
  const snap = await getDocs(collection(db, `tenants/${tenantId}/properties`));
  return snap.docs.map((d) => ({ id: d.id, tenantId, ...d.data() }) as Property);
}
