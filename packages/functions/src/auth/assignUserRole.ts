import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { badRequest, forbidden, notFound, unauthorized, wrapError } from "../lib/errors.js";
import { auth, userRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";

// Despite the name, this callable is the general staff-user UPDATE endpoint
// (the client's updateUser and deleteUser/deactivate both route through it).
// Every field except userId is optional so a caller can update any subset —
// role, profile, active state, or property assignment.
const assignRoleSchema = z.object({
  userId: z.string().min(1),
  role: z
    .enum(["super_admin", "property_manager", "front_desk", "housekeeping", "auditor", "scanner"])
    .optional(),
  email: z.string().email().optional(),
  fullName: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  propertyIds: z.array(z.string()).min(1).optional(),
});

export const assignUserRole = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const callerRole = request.auth.token.role as string;
    if (callerRole !== "super_admin") {
      throw forbidden("Only admins can manage users");
    }

    const tenantId = request.auth.token.tenantId as string;
    const data = validateRequest(assignRoleSchema, request.data);

    if (
      data.role === undefined &&
      data.email === undefined &&
      data.fullName === undefined &&
      data.isActive === undefined &&
      data.propertyIds === undefined
    ) {
      throw badRequest("No changes supplied");
    }

    // Self-lockout guards: an admin must not be able to strip their OWN admin
    // role or deactivate their OWN account, which would leave them (and
    // possibly the whole tenant) with no way back in.
    if (data.userId === request.auth.uid) {
      if (data.role && data.role !== "super_admin") {
        throw forbidden("You cannot change your own admin role.");
      }
      if (data.isActive === false) {
        throw forbidden("You cannot deactivate your own account.");
      }
    }

    const userDocRef = userRef(tenantId, data.userId);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
      throw notFound("User not found");
    }

    // 1) Firebase Auth record: profile + enabled state.
    const authUpdate: { email?: string; displayName?: string; disabled?: boolean } = {};
    if (data.email !== undefined) authUpdate.email = data.email;
    if (data.fullName !== undefined) authUpdate.displayName = data.fullName;
    if (data.isActive !== undefined) authUpdate.disabled = !data.isActive;
    if (Object.keys(authUpdate).length > 0) {
      await auth.updateUser(data.userId, authUpdate);
    }

    // 2) Custom claims — only touch when role or property scope changes.
    if (data.role !== undefined || data.propertyIds !== undefined) {
      const existingClaims = (await auth.getUser(data.userId)).customClaims ?? {};
      const newClaims = {
        ...existingClaims,
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.propertyIds !== undefined ? { propertyIds: data.propertyIds } : {}),
      };
      await auth.setCustomUserClaims(data.userId, newClaims);
    }

    // 3) Firestore user document — mirror every supplied field.
    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (data.role !== undefined) updateData.role = data.role;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.propertyIds !== undefined) updateData.propertyIds = data.propertyIds;
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
        isActive: data.isActive,
        propertyIds: data.propertyIds,
      },
    }).catch(() => {});

    const fresh = (await userDocRef.get()).data() ?? {};
    return {
      id: data.userId,
      tenantId,
      email: (fresh.email as string) ?? data.email ?? "",
      fullName: (fresh.fullName as string) ?? data.fullName ?? "",
      role: (fresh.role as string) ?? data.role,
      isActive: (fresh.isActive as boolean) ?? true,
      propertyIds: (fresh.propertyIds as string[]) ?? data.propertyIds ?? [],
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
