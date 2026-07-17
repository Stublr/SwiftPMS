import { collection, doc, getDoc, getDocs, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";

export interface TourOperator {
  id: string;
  email: string;
  active: boolean;
}

function getPath() {
  const { tenantId } = usePropertyStore.getState();
  return { tenantId: tenantId! };
}

export async function listTourOperators(): Promise<TourOperator[]> {
  const { tenantId } = getPath();
  const snap = await getDocs(collection(db, `tenants/${tenantId}/tourOperators`));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TourOperator);
}

export async function addTourOperator(email: string): Promise<void> {
  const { tenantId } = getPath();
  await addDoc(collection(db, `tenants/${tenantId}/tourOperators`), {
    email: email.toLowerCase(),
    active: true,
    createdAt: serverTimestamp(),
  });
}

export async function setTourOperatorActive(id: string, active: boolean): Promise<void> {
  const { tenantId } = getPath();
  await updateDoc(doc(db, `tenants/${tenantId}/tourOperators/${id}`), { active });
}

export async function setDiscount(percent: number): Promise<void> {
  const fn = httpsCallable(functions, "setTourOperatorDiscount");
  await fn({ percent });
}

export async function getDiscount(): Promise<number> {
  const { tenantId } = getPath();
  const snap = await getDoc(doc(db, `tenants/${tenantId}`));
  const data = snap.data() as { settings?: { tourOperatorDiscountPercent?: number | null } } | undefined;
  return data?.settings?.tourOperatorDiscountPercent ?? 0;
}
