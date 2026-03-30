import { collection, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";
import type { Guest } from "@swiftpms/shared";

function getTenantId(): string {
  return usePropertyStore.getState().tenantId!;
}

export async function getGuests(searchTerm?: string): Promise<Guest[]> {
  const tenantId = getTenantId();
  const snap = await getDocs(collection(db, `tenants/${tenantId}/guests`));
  let guests = snap.docs.map((d) => ({
    id: d.id,
    tenantId,
    companions: [],
    ...d.data(),
  }) as unknown as Guest);
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    guests = guests.filter((g) =>
      g.firstName.toLowerCase().includes(term) ||
      g.lastName.toLowerCase().includes(term) ||
      (g.email?.toLowerCase().includes(term) ?? false),
    );
  }
  return guests;
}

export async function createGuest(data: Record<string, unknown>): Promise<Guest> {
  const tenantId = getTenantId();
  const ref = doc(collection(db, `tenants/${tenantId}/guests`));
  const now = new Date().toISOString();
  const guestDoc = {
    ...data,
    companions: data.companions ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, guestDoc);
  return { id: ref.id, tenantId, ...guestDoc } as Guest;
}

export async function updateGuest(id: string, data: Record<string, unknown>): Promise<void> {
  const tenantId = getTenantId();
  await updateDoc(doc(db, `tenants/${tenantId}/guests/${id}`), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}
