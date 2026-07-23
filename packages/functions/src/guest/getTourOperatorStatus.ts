import { HttpsError, onCall } from "firebase-functions/v2/https";

import { unauthorized, wrapError } from "../lib/errors.js";
import { tenantRef, tourOperatorApplicationsRef, tourOperatorsRef } from "../lib/firestore.js";

export const getTourOperatorStatus = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const email = (request.auth.token.email as string | undefined ?? "").toLowerCase();

    const operatorSnap = await tourOperatorsRef(tenantId)
      .where("email", "==", email)
      .where("active", "==", true)
      .limit(1)
      .get();

    const isTourOperator = !operatorSnap.empty;

    const tenantSnap = await tenantRef(tenantId).get();
    const discountPercent = isTourOperator
      ? ((tenantSnap.data()?.settings?.tourOperatorDiscountPercent as number | undefined) ?? 0)
      : 0;

    // Application state for the guest-portal "become a tour operator" flow.
    const appSnap = await tourOperatorApplicationsRef(tenantId).doc(request.auth.uid).get();
    const applicationStatus = isTourOperator
      ? "approved"
      : ((appSnap.data()?.status as "pending" | "approved" | "rejected" | undefined) ?? "none");
    const reviewNote = (appSnap.data()?.reviewNote as string | null | undefined) ?? null;

    return { isTourOperator, discountPercent, applicationStatus, reviewNote };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
