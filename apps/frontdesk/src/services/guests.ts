import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";
import type { Guest } from "@swiftpms/shared";

function getPath() {
  const { tenantId, propertyId } = usePropertyStore.getState();
  return { tenantId: tenantId!, propertyId: propertyId! };
}

export async function getGuests(searchTerm?: string): Promise<Guest[]> {
  const { tenantId, propertyId } = getPath();

  // Get guest IDs that have reservations at the current property
  const resSnap = await getDocs(
    collection(db, `tenants/${tenantId}/properties/${propertyId}/reservations`),
  );
  const propertyGuestIds = new Set(resSnap.docs.map((d) => d.data().guestId as string));

  // Get all guests for the tenant
  const snap = await getDocs(collection(db, `tenants/${tenantId}/guests`));
  let guests = snap.docs
    .filter((d) => propertyGuestIds.has(d.id))
    .map((d) => ({
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

export async function getAllGuests(): Promise<Guest[]> {
  const { tenantId } = getPath();
  const snap = await getDocs(collection(db, `tenants/${tenantId}/guests`));
  return snap.docs.map((d) => ({
    id: d.id,
    tenantId,
    companions: [],
    ...d.data(),
  }) as unknown as Guest);
}

/**
 * Create a guest record via the createGuest Cloud Function. Validated with
 * Zod, persists the tenantId field, writes an audit log entry. Replaces the
 * previous direct setDoc which bypassed all of the above.
 */
/**
 * Server-validated guest create. Accepts a loose payload (the GuestForm and
 * other callers build a Record), strips empty/null fields so the server-side
 * Zod schema (which uses `.optional()`) doesn't reject them, then calls the
 * createGuest Cloud Function which validates + writes audit log + sets
 * tenantId. Returns the persisted Guest record.
 */
export async function createGuest(
  data: Record<string, unknown>,
): Promise<Guest> {
  const fn = httpsCallable(functions, "createGuest");
  const payload = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v != null && v !== ""),
  );
  const res = await fn(payload);
  return res.data as Guest;
}

export async function updateGuest(id: string, data: Record<string, unknown>): Promise<void> {
  const { tenantId } = getPath();
  await updateDoc(doc(db, `tenants/${tenantId}/guests/${id}`), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}
