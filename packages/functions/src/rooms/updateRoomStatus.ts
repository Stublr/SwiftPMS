import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { updateRoomStatusSchema } from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { roomRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";

export const updateRoomStatus = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(updateRoomStatusSchema, request.data);

    const ref = roomRef(tenantId, propertyId, data.roomId);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Room not found");

    await ref.update({
      status: data.status,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      action: "room.status",
      resource: "room",
      resourceId: data.roomId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      propertyId,
      details: { status: data.status },
    }).catch(() => {});

    return { success: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
