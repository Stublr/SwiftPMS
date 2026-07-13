import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { forbidden, notFound, unauthorized, wrapError } from "../lib/errors.js";
import { auth, userRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";

const assignRoleSchema = z.object({
  userId: z.string().min(1),
  // All mutable fields are optional so this one callable backs the whole
  // "edit user" form as well as the deactivate action. At least one of them
  // must be present (enforced below).
  role: z
    .enum(["super_admin", "property_manager", "front_desk", "housekeeping", "auditor", "scanner"])
    .optional(),
  propertyIds: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
  fullName: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
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

    if (
      data.role === undefined &&
      data.propertyIds === undefined &&
      data.isActive === undefined &&
      data.fullName === undefined &&
      data.email === undefined
    ) {
      throw forbidden("No changes supplied");
    }

    const userDocRef = userRef(tenantId, data.userId);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
      throw notFound("User not found");
    }

    // Custom claims drive access control — only role/propertyIds live there.
    if (data.role !== undefined || data.propertyIds !== undefined) {
      const existingClaims = (await auth.getUser(data.userId)).customClaims ?? {};
      const newClaims = {
        ...existingClaims,
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.propertyIds ? { propertyIds: data.propertyIds } : {}),
      };
      await auth.setCustomUserClaims(data.userId, newClaims);
    }

    // Firebase Auth record — deactivation must disable the login (blocks
    // password sign-in immediately; PIN sign-in is separately gated on
    // isActive in the user doc). Email / display name are mirrored too.
    const authUpdate: Record<string, unknown> = {};
    if (data.isActive !== undefined) authUpdate.disabled = !data.isActive;
    if (data.email !== undefined) authUpdate.email = data.email;
    if (data.fullName !== undefined) authUpdate.displayName = data.fullName;
    if (Object.keys(authUpdate).length > 0) {
      await auth.updateUser(data.userId, authUpdate);
    }

    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (data.role !== undefined) updateData.role = data.role;
    if (data.propertyIds !== undefined) updateData.propertyIds = data.propertyIds;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.email !== undefined) updateData.email = data.email;
    await userDocRef.update(updateData);

    await writeAuditLog({
      action: "update",
      resource: "user",
      resourceId: data.userId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      details: {
        role: data.role,
        propertyIds: data.propertyIds,
        isActive: data.isActive,
        fullName: data.fullName,
        email: data.email,
      },
    });

    return { success: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
