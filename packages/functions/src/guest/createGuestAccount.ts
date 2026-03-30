import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { guestRegisterSchema } from "@swiftpms/shared";
import { z } from "zod";

import { wrapError } from "../lib/errors.js";
import { auth, guestsRef, tenantRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

const createGuestAccountSchema = guestRegisterSchema.extend({
  tenantId: z.string().min(1, "tenantId is required"),
});

export const createGuestAccount = onCall({ cors: true }, async (request) => {
  try {
    const data = validateRequest(createGuestAccountSchema, request.data);
    const tenantId = data.tenantId;

    // Verify tenant exists
    const tenantSnap = await tenantRef(tenantId).get();
    if (!tenantSnap.exists) throw new HttpsError("not-found", "Property not found");

    // Create Firebase Auth user
    const userRecord = await auth.createUser({
      email: data.email,
      password: data.password,
      displayName: `${data.firstName} ${data.lastName}`,
    });

    // Set guest role in custom claims
    await auth.setCustomUserClaims(userRecord.uid, {
      tenantId,
      role: "guest",
      propertyIds: [],
    });

    // Create guest document
    const guestDoc = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone ?? null,
      idType: null,
      idNumber: null,
      nationality: null,
      address: null,
      notes: null,
      authUid: userRecord.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const guestDocRef = guestsRef(tenantId).doc(userRecord.uid);
    await guestDocRef.set(guestDoc);

    // Create custom token for immediate sign-in
    const customToken = await auth.createCustomToken(userRecord.uid, {
      tenantId,
      role: "guest",
      propertyIds: [],
    });

    return {
      customToken,
      guest: {
        id: guestDocRef.id,
        tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
