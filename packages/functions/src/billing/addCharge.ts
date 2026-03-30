import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { addCents, multiplyCents } from "@swiftpms/shared";
import { addChargeSchema } from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, folioRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";

export const addCharge = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(addChargeSchema, request.data);
    const chargeTotal = multiplyCents(data.amount, data.quantity);

    await db.runTransaction(async (tx) => {
      const fRef = folioRef(tenantId, propertyId, data.folioId);
      const fSnap = await tx.get(fRef);
      if (!fSnap.exists) throw notFound("Folio not found");

      const folio = fSnap.data()!;
      if (folio.status !== "open") {
        throw preconditionFailed("Folio is not open");
      }

      const charge = {
        id: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        category: data.category,
        description: data.description,
        amount: data.amount,
        quantity: data.quantity,
        total: chargeTotal,
        date: new Date().toISOString().split("T")[0],
        addedBy: request.auth!.uid,
        addedAt: new Date().toISOString(),
      };

      const newTotalCharges = addCents(folio.totalCharges as number, chargeTotal);
      const newBalance = newTotalCharges - (folio.totalPayments as number);

      tx.update(fRef, {
        charges: FieldValue.arrayUnion(charge),
        totalCharges: newTotalCharges,
        balance: newBalance,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await writeAuditLog({
      action: "folio.charge",
      resource: "folio",
      resourceId: data.folioId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      propertyId,
      details: { category: data.category, amount: chargeTotal },
    }).catch(() => {});

    return { success: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
