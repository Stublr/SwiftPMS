import { collection, doc, getDoc, getDocs, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";

export interface TourOperator {
  id: string;
  email: string;
  label?: string | null;
  active: boolean;
}

export interface TourOperatorApplication {
  id: string;
  email: string;
  companyName: string;
  contactName: string;
  phone: string;
  registrationNumber: string | null;
  website: string | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
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

export async function listTourOperatorApplications(): Promise<TourOperatorApplication[]> {
  const { tenantId } = getPath();
  const snap = await getDocs(collection(db, `tenants/${tenantId}/tourOperatorApplications`));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as TourOperatorApplication)
    .sort((a, b) => {
      // Pending first, then newest first.
      if ((a.status === "pending") !== (b.status === "pending")) {
        return a.status === "pending" ? -1 : 1;
      }
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
}

export async function reviewApplication(
  applicationId: string,
  approve: boolean,
  note?: string,
): Promise<void> {
  const fn = httpsCallable(functions, "reviewTourOperatorApplication");
  await fn({ applicationId, approve, note: note || undefined });
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
