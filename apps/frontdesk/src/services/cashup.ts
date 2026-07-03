import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";

/**
 * Per-shift cash-up state + helpers.
 *
 * The frontdesk shows one active shift (if any) at a time and lets staff
 * open a new one / close the current one. All aggregation happens
 * server-side in the closeShift Cloud Function; the client only shows the
 * current window's running totals (computed live from folios for UX,
 * server re-computes authoritatively on close).
 */

export interface Shift {
  id: string;
  propertyId: string;
  status: "open" | "closed";
  openedBy: string;
  openedByName: string;
  openedByEmail?: string;
  openedAt: string;
  openingFloat: number;
  closedBy: string | null;
  closedByName: string | null;
  closedByEmail?: string | null;
  closedAt: string | null;
  cashCounted: number | null;
  cashDiscrepancy: number | null;
  expectedByMethod: Record<string, number> | null;
  expectedCashInDrawer?: number | null;
  totalPayments: number | null;
  paymentCount?: number | null;
  notes: string | null;
  payments?: Array<{
    folioId: string;
    paymentId: string;
    method: string;
    amount: number;
    reference: string | null;
    processedBy: string;
    processedAt: string;
  }>;
}

function getPath() {
  const { tenantId, propertyId } = usePropertyStore.getState();
  return { tenantId: tenantId!, propertyId: propertyId! };
}

export async function getOpenShift(): Promise<Shift | null> {
  const { tenantId, propertyId } = getPath();
  const snap = await getDocs(
    query(
      collection(db, `tenants/${tenantId}/properties/${propertyId}/shifts`),
      where("status", "==", "open"),
      limit(1),
    ),
  );
  if (snap.empty) return null;
  const d = snap.docs[0]!;
  return { id: d.id, ...d.data() } as Shift;
}

export async function getRecentShifts(max = 20): Promise<Shift[]> {
  const { tenantId, propertyId } = getPath();
  const snap = await getDocs(
    query(
      collection(db, `tenants/${tenantId}/properties/${propertyId}/shifts`),
      orderBy("openedAt", "desc"),
      limit(max),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Shift);
}

export async function openShift(openingFloat: number): Promise<{ shiftId: string; openedAt: string }> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "openShift");
  const result = await fn({ propertyId, openingFloat });
  return result.data as { shiftId: string; openedAt: string };
}

export interface CloseShiftResult {
  shiftId: string;
  closedAt: string;
  totalPayments: number;
  expectedByMethod: Record<string, number>;
  expectedCashInDrawer: number;
  cashCounted: number;
  cashDiscrepancy: number;
  paymentCount: number;
}

export async function closeShift(
  shiftId: string,
  cashCounted: number,
  notes: string | undefined,
): Promise<CloseShiftResult> {
  const { propertyId } = getPath();
  const fn = httpsCallable(functions, "closeShift");
  const result = await fn({ propertyId, shiftId, cashCounted, notes });
  return result.data as CloseShiftResult;
}

/**
 * Live running-total for the open shift — computed client-side by scanning
 * all folios' payments arrays for entries in [shift.openedAt, now). The
 * server re-computes authoritatively when the shift is closed; this is
 * only for the "what will I be closing" preview.
 */
export interface LiveShiftTotals {
  totalPayments: number;
  expectedByMethod: Record<string, number>;
  paymentCount: number;
}

export async function getLiveShiftTotals(
  openedAtIso: string,
): Promise<LiveShiftTotals> {
  const { tenantId, propertyId } = getPath();
  const snap = await getDocs(
    collection(db, `tenants/${tenantId}/properties/${propertyId}/folios`),
  );
  const nowIso = new Date().toISOString();
  const totals: Record<string, number> = {};
  let total = 0;
  let count = 0;
  for (const folioDoc of snap.docs) {
    const payments =
      ((folioDoc.data().payments as Array<Record<string, unknown>>) ??
        []) as Array<Record<string, unknown>>;
    for (const p of payments) {
      const processedAt = p.processedAt as string | undefined;
      if (!processedAt) continue;
      if (processedAt >= openedAtIso && processedAt < nowIso) {
        const method = ((p.method as string) ?? "other") || "other";
        const amount = (p.amount as number) ?? 0;
        totals[method] = (totals[method] ?? 0) + amount;
        total += amount;
        count += 1;
      }
    }
  }
  return { totalPayments: total, expectedByMethod: totals, paymentCount: count };
}
