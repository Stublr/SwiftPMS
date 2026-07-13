import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { writeAuditLog } from "../lib/audit.js";
import {
  notFound,
  preconditionFailed,
  unauthorized,
  wrapError,
} from "../lib/errors.js";
import { db, foliosRef, shiftRef } from "../lib/firestore.js";

/**
 * Close the given open shift and record the cash-up result.
 *
 * Aggregation approach:
 *   - Query every folio in the property.
 *   - Iterate each folio's `payments[]` array.
 *   - Include any payment whose `processedAt` falls within [openedAt, now).
 *   - Group by `method` (cash / card / eft / other) → totals.
 *   - Cash discrepancy = cashCounted - (expected cash + opening float).
 *
 * Card / EFT don't have a discrepancy field in MVP — those settle via
 * external systems (bank, Peach) and are reconciled T+1 against statements.
 * The recorded expected totals for card/EFT let the client compare them
 * later.
 *
 * A payment is only counted ONCE — Firestore rules prevent the same
 * payment being duplicated across folios and our own writes are
 * idempotent by structure.
 */
export const closeShift = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string | undefined;
    if (!tenantId) throw preconditionFailed("tenantId missing on token");

    const propertyId = request.data.propertyId as string | undefined;
    const shiftId = request.data.shiftId as string | undefined;
    if (!propertyId || !shiftId) {
      throw preconditionFailed("propertyId and shiftId are required");
    }

    const cashCounted = Number(request.data.cashCounted);
    if (!Number.isFinite(cashCounted) || cashCounted < 0) {
      throw preconditionFailed("cashCounted must be a non-negative integer (cents)");
    }
    const notes = ((request.data.notes as string | undefined) ?? "").slice(0, 1000);

    const ref = shiftRef(tenantId, propertyId, shiftId);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Shift not found");
    const shift = snap.data()!;
    if (shift.status !== "open") {
      throw preconditionFailed(`Shift is not open (status: ${shift.status})`);
    }
    const openedAtIso = shift.openedAt as string;
    const openingFloat = (shift.openingFloat as number) ?? 0;
    const nowIso = new Date().toISOString();

    // Fetch every folio in the property and scan its payments array for
    // this shift's window. A folio has payments as an inline array so
    // we can't query directly — must scan client-side. Fine at demo scale
    // (dozens of folios per property).
    const foliosSnap = await foliosRef(tenantId, propertyId).get();

    interface CountedPayment {
      folioId: string;
      paymentId: string;
      method: string;
      amount: number;
      reference: string | null;
      processedBy: string;
      processedAt: string;
    }
    const counted: CountedPayment[] = [];
    for (const folioDoc of foliosSnap.docs) {
      const folio = folioDoc.data();
      const payments = (folio.payments as Array<Record<string, unknown>> | undefined) ?? [];
      for (const p of payments) {
        // Legacy-imported payments (money collected by the PREVIOUS operator
        // before takeover) carry `legacy: true`. They must never count toward
        // this till's expected cash, or importing a paid legacy booking mid-
        // shift reports a false drawer shortage.
        if (p.legacy === true) continue;
        const processedAt = p.processedAt as string | undefined;
        if (!processedAt) continue;
        if (processedAt >= openedAtIso && processedAt < nowIso) {
          counted.push({
            folioId: folioDoc.id,
            paymentId: (p.id as string) ?? "",
            method: (p.method as string) ?? "other",
            amount: (p.amount as number) ?? 0,
            reference: (p.reference as string | null) ?? null,
            processedBy: (p.processedBy as string) ?? "",
            processedAt,
          });
        }
      }
    }

    // Group totals.
    const expectedByMethod: Record<string, number> = {};
    let totalPayments = 0;
    for (const p of counted) {
      const key = p.method || "other";
      expectedByMethod[key] = (expectedByMethod[key] ?? 0) + p.amount;
      totalPayments += p.amount;
    }
    const expectedCash = expectedByMethod.cash ?? 0;
    // Cash in the drawer at close = opening float + cash payments taken.
    const expectedCashInDrawer = openingFloat + expectedCash;
    const cashDiscrepancy = Math.round(cashCounted) - expectedCashInDrawer;

    // Persist. Single write — the counted-payments list is stored on the
    // shift doc so the cashup is fully self-contained for later audit.
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) throw notFound("Shift not found");
      if ((fresh.data()!.status as string) !== "open") {
        throw preconditionFailed("Shift already closed");
      }
      tx.update(ref, {
        status: "closed",
        closedBy: request.auth!.uid,
        closedByName:
          (request.auth!.token.name as string | undefined) ||
          (request.auth!.token.email as string | undefined) ||
          request.auth!.uid,
        closedByEmail:
          (request.auth!.token.email as string | undefined) ?? "",
        closedAt: nowIso,
        cashCounted: Math.round(cashCounted),
        cashDiscrepancy,
        expectedByMethod,
        expectedCashInDrawer,
        totalPayments,
        paymentCount: counted.length,
        payments: counted,
        notes: notes || null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await writeAuditLog({
      action: "shift.close",
      resource: "shift",
      resourceId: shiftId,
      userId: request.auth.uid,
      userEmail: (request.auth.token.email as string | undefined) ?? "",
      tenantId,
      propertyId,
      details: {
        totalPayments,
        expectedByMethod,
        cashCounted: Math.round(cashCounted),
        cashDiscrepancy,
        paymentCount: counted.length,
      },
    }).catch(() => {});

    return {
      shiftId,
      closedAt: nowIso,
      totalPayments,
      expectedByMethod,
      expectedCashInDrawer,
      cashCounted: Math.round(cashCounted),
      cashDiscrepancy,
      paymentCount: counted.length,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
