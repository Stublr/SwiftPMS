import bcrypt from "bcryptjs";
const { hash } = bcrypt;
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { forbidden, notFound, unauthorized, wrapError } from "../lib/errors.js";
import { userRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";

const resetPinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});

/**
 * Rotate a staff member's PIN. Mirrors the PIN hashing in createUser so a
 * leaked/forgotten PIN can be changed — previously the client called a
 * function that didn't exist, so the Reset PIN button always failed.
 */
export const resetUserPin = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const callerRole = request.auth.token.role as string;
    if (callerRole !== "super_admin") {
      throw forbidden("Only admins can reset PINs");
    }

    const tenantId = request.auth.token.tenantId as string;
    const data = validateRequest(resetPinSchema, request.data);

    const userDocRef = userRef(tenantId, data.userId);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
      throw notFound("User not found");
    }

    const pinHash = await hash(data.pin, 10);
    await userDocRef.update({
      pinHash,
      // Clear any active lockout so the new PIN works immediately.
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
    });

    return { success: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
