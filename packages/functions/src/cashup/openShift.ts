import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { writeAuditLog } from "../lib/audit.js";
import {
  conflict,
  preconditionFailed,
  unauthorized,
  wrapError,
} from "../lib/errors.js";
import { shiftsRef } from "../lib/firestore.js";

/**
 * Open a new cash-up shift for the given property.
 *
 * Constraints:
 *   - Only one shift may be OPEN per property at a time. Refuses with a
 *     conflict error if another shift is still open (staff must close it
 *     first — usually the previous shift's handover).
 *   - Any authenticated staff/admin in the tenant may open. Front desk
 *     workflow at Sugarloaf is a single desk; per-shift model just means
 *     one shift active at any moment, not one per staff member.
 *   - The opening float is optional (defaults to 0) — represents cash the
 *     staff member starts the shift with in the drawer.
 */
export const openShift = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string | undefined;
    if (!tenantId) throw preconditionFailed("tenantId missing on token");

    const propertyId = request.data.propertyId as string | undefined;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const openingFloat = Number(request.data.openingFloat ?? 0);
    if (!Number.isFinite(openingFloat) || openingFloat < 0) {
      throw preconditionFailed("openingFloat must be a non-negative integer (cents)");
    }

    // Refuse if a shift is already open for this property. Client should
    // show a "close current shift first" state, not silently open a second.
    const existing = await shiftsRef(tenantId, propertyId)
      .where("status", "==", "open")
      .limit(1)
      .get();
    if (!existing.empty) {
      const openShiftDoc = existing.docs[0]!;
      throw conflict(
        `A shift is already open (id=${openShiftDoc.id}). Close it before opening a new one.`,
      );
    }

    const ref = shiftsRef(tenantId, propertyId).doc();
    const nowIso = new Date().toISOString();
    const uid = request.auth.uid;
    const name = (request.auth.token.name as string | undefined) ?? "";
    const email = (request.auth.token.email as string | undefined) ?? "";

    await ref.set({
      propertyId,
      status: "open",
      openedBy: uid,
      openedByName: name || email || uid,
      openedByEmail: email,
      openedAt: nowIso,
      openingFloat: Math.round(openingFloat),
      closedAt: null,
      closedBy: null,
      closedByName: null,
      closedByEmail: null,
      cashCounted: null,
      cashDiscrepancy: null,
      expectedByMethod: null,
      totalPayments: null,
      notes: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      action: "shift.open",
      resource: "shift",
      resourceId: ref.id,
      userId: uid,
      userEmail: email,
      tenantId,
      propertyId,
      details: { openingFloat: Math.round(openingFloat) },
    }).catch(() => {});

    return { shiftId: ref.id, openedAt: nowIso };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
