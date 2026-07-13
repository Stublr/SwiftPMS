import bcrypt from "bcryptjs";
const { hash } = bcrypt;
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { forbidden, notFound, unauthorized, wrapError } from "../lib/errors.js";
import { userRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";

const resetUserPinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/),
});

/**
 * Admin-only: set (or replace) a staff user's PIN-login hash. The frontdesk
 * "Reset PIN" action calls this. The client only ever sends the raw PIN; the
 * bcrypt hash is computed here and stored on the user doc (never exposed to
 * clients — see pinLogin, which reads it server-side). Resetting also clears
 * the lockout counters so a locked-out user is immediately usable again.
 */
export const resetUserPin = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const callerRole = request.auth.token.role as string;
    if (callerRole !== "super_admin") {
      throw forbidden("Only admins can reset PINs");
    }

    const tenantId = request.auth.token.tenantId as string;
    const data = validateRequest(resetUserPinSchema, request.data);

    const userDocRef = userRef(tenantId, data.userId);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
      throw notFound("User not found");
    }

    const pinHash = await hash(data.pin, 10);
    await userDocRef.update({
      pinHash,
      pinFailedAttempts: 0,
      pinLastFailedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      action: "update",
      resource: "user",
      resourceId: data.userId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      details: { pinReset: true },
    }).catch(() => {});

    return { success: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
