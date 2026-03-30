import bcrypt from "bcryptjs";
const { compare } = bcrypt;
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { badRequest, notFound, wrapError } from "../lib/errors.js";
import { auth, usersRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 15;

const pinLoginSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/),
  propertyId: z.string().min(1),
  tenantId: z.string().min(1),
});

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

    let matchedUser: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      if (!userData.pinHash) continue;

      const failedAttempts = (userData.pinFailedAttempts as number) || 0;
      const lastFailedAt = userData.pinLastFailedAt?.toDate?.() as Date | undefined;

      if (failedAttempts >= PIN_MAX_ATTEMPTS && lastFailedAt) {
        const lockoutUntil = new Date(lastFailedAt.getTime() + PIN_LOCKOUT_MINUTES * 60 * 1000);
        if (new Date() < lockoutUntil) {
          continue;
        }
        await userDoc.ref.update({
          pinFailedAttempts: 0,
          pinLastFailedAt: null,
        });
      }

      const pinMatch = await compare(data.pin, userData.pinHash as string);
      if (pinMatch) {
        matchedUser = userDoc;
        break;
      }
    }

    if (matchedUser) {
      const userData = matchedUser.data();
      const failedAttempts = (userData.pinFailedAttempts as number) || 0;

      if (failedAttempts > 0) {
        await matchedUser.ref.update({
          pinFailedAttempts: 0,
          pinLastFailedAt: null,
        });
      }

      const claims = {
        tenantId,
        role: userData.role as string,
        propertyIds: userData.propertyIds as string[],
      };

      const customToken = await auth.createCustomToken(matchedUser.id, claims);

      return {
        customToken,
        user: {
          id: matchedUser.id,
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
