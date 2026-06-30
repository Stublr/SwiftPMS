import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { createGuestSchema } from "@swiftpms/shared";

import { writeAuditLog } from "../lib/audit.js";
import { forbidden, unauthorized, wrapError } from "../lib/errors.js";
import { guestsRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

/**
 * Staff-side guest creation (used by the front desk walk-in flow). Replaces
 * the previous direct Firestore write that bypassed Zod validation, omitted
 * the tenantId field on the doc, and left no audit trail.
 *
 * Distinct from `createGuestAccount` (which creates a Firebase Auth user for
 * the guest portal). This one creates a Guest record only — staff are
 * recording who walked up to the desk, no Auth account.
 */
export const createGuest = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const role = request.auth.token.role as string;
    if (role === "guest") {
      throw forbidden("Guests cannot create guest records via this endpoint");
    }

    const tenantId = request.auth.token.tenantId as string;
    const data = validateRequest(createGuestSchema, request.data);

    const ref = guestsRef(tenantId).doc();
    const now = new Date().toISOString();
    const guestDoc = {
      tenantId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      nationality: data.nationality ?? null,
      idType: data.idType ?? null,
      idNumber: data.idNumber ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      companions: data.companions ?? [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await ref.set(guestDoc);

    await writeAuditLog({
      action: "guest.created",
      resource: "guest",
      resourceId: ref.id,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      details: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        source: "front_desk",
      },
    }).catch(() => {});

    return {
      id: ref.id,
      tenantId,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
