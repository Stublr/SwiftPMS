import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { MANAGER_ROLES } from "@swiftpms/shared";

import { preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { tenantRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

const setTourOperatorDiscountSchema = z.object({
  percent: z.number().min(0).max(100),
});

export const setTourOperatorDiscount = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const role = request.auth.token.role as string;
    if (!MANAGER_ROLES.includes(role as (typeof MANAGER_ROLES)[number])) {
      throw preconditionFailed("Only managers can set the tour operator discount");
    }

    const data = validateRequest(setTourOperatorDiscountSchema, request.data);

    await tenantRef(tenantId).set(
      { settings: { tourOperatorDiscountPercent: data.percent } },
      { merge: true },
    );

    return { ok: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
