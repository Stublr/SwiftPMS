import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { MANAGER_ROLES } from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, tourOperatorApplicationsRef, tourOperatorsRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

const reviewSchema = z.object({
  applicationId: z.string().min(1),
  approve: z.boolean(),
  note: z.string().max(500).nullish().transform((v) => v ?? undefined),
});

/**
 * Manager+ reviews a tour-operator application. Approving marks the
 * application approved AND registers the applicant's email in the
 * tourOperators collection (active), so the discount applies on their
 * next booking — no re-login needed.
 */
export const reviewTourOperatorApplication = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const role = request.auth.token.role as string;
    if (!MANAGER_ROLES.includes(role as (typeof MANAGER_ROLES)[number])) {
      throw preconditionFailed("Only managers can review tour operator applications");
    }

    const data = validateRequest(reviewSchema, request.data);
    const appRef = tourOperatorApplicationsRef(tenantId).doc(data.applicationId);

    await db.runTransaction(async (tx) => {
      const appSnap = await tx.get(appRef);
      if (!appSnap.exists) throw notFound("Application not found");
      const application = appSnap.data()!;
      if (application.status !== "pending") {
        throw preconditionFailed("This application has already been reviewed");
      }

      const email = (application.email as string).toLowerCase();
      const operatorQuery = await tx.get(
        tourOperatorsRef(tenantId).where("email", "==", email).limit(1),
      );

      const now = new Date().toISOString();
      tx.update(appRef, {
        status: data.approve ? "approved" : "rejected",
        reviewedAt: now,
        reviewedBy: request.auth!.uid,
        reviewNote: data.note ?? null,
        updatedAt: now,
      });

      if (data.approve) {
        if (operatorQuery.empty) {
          tx.set(tourOperatorsRef(tenantId).doc(), {
            email,
            label: application.companyName ?? null,
            active: true,
            createdAt: now,
          });
        } else {
          tx.update(operatorQuery.docs[0]!.ref, { active: true });
        }
      }
    });

    return { ok: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
