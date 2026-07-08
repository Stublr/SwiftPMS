import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { forbidden, notFound, unauthorized, wrapError } from "../lib/errors.js";
import { auth, userRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";

const assignRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["super_admin", "property_manager", "front_desk", "housekeeping", "auditor", "scanner"]),
  propertyIds: z.array(z.string()).min(1).optional(),
});

export const assignUserRole = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const callerRole = request.auth.token.role as string;
    if (callerRole !== "super_admin") {
      throw forbidden("Only admins can assign roles");
    }

    const tenantId = request.auth.token.tenantId as string;
    const data = validateRequest(assignRoleSchema, request.data);

    const userDocRef = userRef(tenantId, data.userId);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
      throw notFound("User not found");
    }

    const existingClaims = (await auth.getUser(data.userId)).customClaims ?? {};
    const newClaims = {
      ...existingClaims,
      role: data.role,
      ...(data.propertyIds ? { propertyIds: data.propertyIds } : {}),
    };
    await auth.setCustomUserClaims(data.userId, newClaims);

    const updateData: Record<string, unknown> = {
      role: data.role,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (data.propertyIds) {
      updateData.propertyIds = data.propertyIds;
    }
    await userDocRef.update(updateData);

    await writeAuditLog({
      action: "update",
      resource: "user",
      resourceId: data.userId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      details: { role: data.role, propertyIds: data.propertyIds },
    });

    return { success: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
