import bcrypt from "bcryptjs";
const { compare } = bcrypt;
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { badRequest, notFound, wrapError } from "../lib/errors.js";
import { auth, db, usersRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 15;

const pinLoginSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/),
  propertyId: z.string().min(1),
  tenantId: z.string().min(1),
});

interface PinAttemptOutcome {
  matched: boolean;
  user?: FirebaseFirestore.DocumentData;
  userId?: string;
  lockedOut?: boolean;
}

export const pinLogin = onCall({ cors: true }, async (request) => {
  try {
    const data = validateRequest(pinLoginSchema, request.data);
    const { tenantId } = data;

    const usersSnapshot = await usersRef(tenantId)
      .where("propertyIds", "array-contains", data.propertyId)
      .where("isActive", "==", true)
      .get();

    if (usersSnapshot.empty) {
      throw notFound("No users found for this property");
    }

    // For each candidate, atomically (a) check lockout, (b) compare PIN,
    // (c) increment-on-fail / reset-on-success — all in one transaction so
    // bursts at the lockout boundary can't race the counter back to 0.
    let matched: PinAttemptOutcome | null = null;
    for (const userDoc of usersSnapshot.docs) {
      if (!userDoc.data().pinHash) continue;

      const outcome = await db.runTransaction<PinAttemptOutcome>(async (tx) => {
        const fresh = await tx.get(userDoc.ref);
        if (!fresh.exists) return { matched: false };
        const userData = fresh.data()!;
        const hash = userData.pinHash as string | undefined;
        if (!hash) return { matched: false };

        const failedAttempts = (userData.pinFailedAttempts as number) || 0;
        const lastFailedAt =
          (userData.pinLastFailedAt as FirebaseFirestore.Timestamp | undefined)
            ?.toDate?.() ?? null;

        // Currently locked out?
        if (failedAttempts >= PIN_MAX_ATTEMPTS && lastFailedAt) {
          const lockoutUntil = new Date(
            lastFailedAt.getTime() + PIN_LOCKOUT_MINUTES * 60 * 1000,
          );
          if (new Date() < lockoutUntil) {
            return { matched: false, lockedOut: true };
          }
          // Lockout expired — counter reset happens below as part of either
          // the success-write or the mismatch-write so it stays atomic.
        }

        // Hash compare happens here (CPU work, but inside the transaction —
        // bcrypt is fast enough that the txn retry budget is fine).
        const isMatch = await compare(data.pin, hash);

        if (isMatch) {
          tx.update(userDoc.ref, {
            pinFailedAttempts: 0,
            pinLastFailedAt: null,
          });
          return {
            matched: true,
            user: userData,
            userId: userDoc.id,
          };
        }

        // Mismatch — increment counter, stamp lastFailedAt. If the lockout
        // window was open, count starts fresh at 1; otherwise +1 on top.
        const lockoutExpired =
          failedAttempts >= PIN_MAX_ATTEMPTS &&
          lastFailedAt &&
          new Date() >=
            new Date(lastFailedAt.getTime() + PIN_LOCKOUT_MINUTES * 60 * 1000);
        tx.update(userDoc.ref, {
          pinFailedAttempts: lockoutExpired ? 1 : failedAttempts + 1,
          pinLastFailedAt: FieldValue.serverTimestamp(),
        });
        return { matched: false };
      });

      if (outcome.matched) {
        matched = outcome;
        break;
      }
    }

    if (matched && matched.user && matched.userId) {
      const userData = matched.user;
      const claims = {
        tenantId,
        role: userData.role as string,
        propertyIds: userData.propertyIds as string[],
      };
      const customToken = await auth.createCustomToken(matched.userId, claims);
      return {
        customToken,
        user: {
          id: matched.userId,
          tenantId,
          email: userData.email as string,
          fullName: userData.fullName as string,
          role: userData.role as string,
          propertyIds: userData.propertyIds as string[],
        },
      };
    }

    throw badRequest("Invalid PIN");
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
