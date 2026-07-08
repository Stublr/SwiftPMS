import bcrypt from "bcryptjs";
const { hash } = bcrypt;
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import type { UserRole } from "@swiftpms/shared";

import { forbidden, unauthorized, wrapError } from "../lib/errors.js";
import { auth, usersRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  role: z.enum(["super_admin", "property_manager", "front_desk", "housekeeping", "auditor", "scanner"]),
  pin: z.string().regex(/^\d{4,6}$/).optional(),
  propertyIds: z.array(z.string()).min(1),
});

export const createUser = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const callerRole = request.auth.token.role as string;
    if (callerRole !== "super_admin") {
      throw forbidden("Only admins can create users");
    }

    const tenantId = request.auth.token.tenantId as string;
    const data = validateRequest(createUserSchema, request.data);

    const userRecord = await auth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.fullName,
    });

    const claims = {
      tenantId,
      role: data.role,
      propertyIds: data.propertyIds,
    };
    await auth.setCustomUserClaims(userRecord.uid, claims);

    const pinHash = data.pin ? await hash(data.pin, 10) : null;

    const userDoc = {
      email: data.email,
      fullName: data.fullName,
      role: data.role as UserRole,
      pinHash,
      propertyIds: data.propertyIds,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await usersRef(tenantId).doc(userRecord.uid).set(userDoc);

    await writeAuditLog({
      action: "create",
      resource: "user",
      resourceId: userRecord.uid,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      details: { email: data.email, role: data.role },
    });

    return {
      id: userRecord.uid,
      tenantId,
      email: data.email,
      fullName: data.fullName,
      role: data.role,
      propertyIds: data.propertyIds,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
