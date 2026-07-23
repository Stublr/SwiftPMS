import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { tourOperatorApplicationsRef, tourOperatorsRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

const applyTourOperatorSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(120),
  phone: z.string().min(4).max(40),
  registrationNumber: z.string().max(80).nullish().transform((v) => v ?? undefined),
  website: z.string().max(200).nullish().transform((v) => v ?? undefined),
  message: z.string().max(1000).nullish().transform((v) => v ?? undefined),
});

/**
 * A signed-in guest applies to become a tour operator. One application per
 * account (doc id = auth uid); a rejected applicant may re-apply, which puts
 * the application back into review. Approval happens via the manager-gated
 * reviewTourOperatorApplication callable.
 */
export const applyTourOperator = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const email = (request.auth.token.email as string | undefined ?? "").toLowerCase();
    if (!email) throw preconditionFailed("Your account has no email address");

    const data = validateRequest(applyTourOperatorSchema, request.data);

    // Already an active operator — nothing to apply for.
    const operatorSnap = await tourOperatorsRef(tenantId)
      .where("email", "==", email)
      .where("active", "==", true)
      .limit(1)
      .get();
    if (!operatorSnap.empty) {
      return { status: "approved", alreadyOperator: true };
    }

    const appRef = tourOperatorApplicationsRef(tenantId).doc(request.auth.uid);
    const existing = await appRef.get();
    if (existing.exists && existing.data()?.status === "pending") {
      throw preconditionFailed("Your application is already under review");
    }

    const now = new Date().toISOString();
    await appRef.set({
      email,
      companyName: data.companyName,
      contactName: data.contactName,
      phone: data.phone,
      registrationNumber: data.registrationNumber ?? null,
      website: data.website ?? null,
      message: data.message ?? null,
      status: "pending",
      createdAt: existing.exists ? (existing.data()?.createdAt ?? now) : now,
      updatedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
    });

    return { status: "pending" };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
