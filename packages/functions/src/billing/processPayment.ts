import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { addCents, subtractCents } from "@swiftpms/shared";
import { processPaymentSchema } from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { db, folioRef, reservationRef, roomRef } from "../lib/firestore.js";
import { writeAuditLog } from "../lib/audit.js";
import { validateRequest } from "../lib/validation.js";

export const processPayment = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string;
    const propertyId = request.data.propertyId as string;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(processPaymentSchema, request.data);

    const result = await db.runTransaction(async (tx) => {
      // Firestore transactions require ALL reads before ANY writes.
      // 1) Read folio
      const fRef = folioRef(tenantId, propertyId, data.folioId);
      const fSnap = await tx.get(fRef);
      if (!fSnap.exists) throw notFound("Folio not found");
      const folio = fSnap.data()!;
      // Reject payments on already-settled or refunded folios (would
      // create a credit balance we don't track); but allow payment on
      // void folios so a cashier can still recover money that hit the
      // bank after a hold expiry. The reinstate logic below handles the
      // reservation state.
      if (folio.status === "settled" || folio.status === "refunded") {
        throw preconditionFailed(`Folio is already ${folio.status}`);
      }

      // Idempotency — bail if we've already processed this clientRequestId.
      if (data.clientRequestId) {
        const dupe = (folio.payments as Array<{ clientRequestId?: string }>)?.find(
          (p) => p?.clientRequestId === data.clientRequestId,
        );
        if (dupe) {
          return {
            balance: folio.balance as number,
            status: folio.status as string,
          };
        }
      }

      const newTotalPayments = addCents(folio.totalPayments as number, data.amount);
      const newBalance = subtractCents(folio.totalCharges as number, newTotalPayments);
      // Un-void: if a hold-expired folio (status = "void") now takes a
      // payment, it needs to transition back to "open" or "settled" so
      // the money is properly reflected. Balance drives the choice.
      const newStatus = newBalance <= 0 ? "settled" : "open";

      // 2) Pre-read the linked reservation + its room. Needed even when
      //    the folio doesn't settle in full (partial payment) because we
      //    may still need to reinstate a cancelled reservation whose
      //    guest is paying now.
      let resR: FirebaseFirestore.DocumentReference | null = null;
      let resSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let rRef: FirebaseFirestore.DocumentReference | null = null;
      let rSnap: FirebaseFirestore.DocumentSnapshot | null = null;

      if (folio.reservationId) {
        resR = reservationRef(tenantId, propertyId, folio.reservationId as string);
        resSnap = await tx.get(resR);
        if (resSnap.exists) {
          const rid = resSnap.data()!.roomId as string | null;
          if (rid) {
            rRef = roomRef(tenantId, propertyId, rid);
            rSnap = await tx.get(rRef);
          }
        }
      }

      // --- All reads complete. Begin writes. ---
      const payment = {
        id: `pmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        method: data.method,
        amount: data.amount,
        reference: data.reference ?? null,
        processedBy: request.auth!.uid,
        processedAt: new Date().toISOString(),
        clientRequestId: data.clientRequestId ?? null,
      };

      // Folio update — always. Money is real; settle the folio to whatever
      // balance the payment produces. If someone paid on a cancelled
      // reservation's folio, the folio still updates — and we then decide
      // whether to reinstate the reservation below.
      tx.update(fRef, {
        payments: FieldValue.arrayUnion(payment),
        totalPayments: newTotalPayments,
        balance: Math.max(0, newBalance),
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Reservation handling — three branches based on current status:
      //   1) confirmed / checked_in / checked_out: normal path. On settle,
      //      promote held room → reserved (if held) and clear holdExpiresAt.
      //   2) cancelled + room still available: REINSTATE the reservation
      //      and re-hold the room. Payment lands after hold expired but
      //      before someone else took the room — auto-recover.
      //   3) cancelled + room already taken by someone else: leave
      //      reservation cancelled, folio has a settled credit. Flag
      //      needsRefund on the folio so cashier sees it and can refund.
      let reinstateOutcome: "ok" | "reinstated" | "refund_due" | "no_reservation" = "ok";
      if (resR && resSnap?.exists) {
        const resData = resSnap.data()!;
        const resStatus = resData.status as string;
        if (resStatus === "cancelled") {
          // Can we reinstate? The room must still be free (available OR
          // pointing at this reservation as its current, which shouldn't
          // happen post-release but is a defensive OK).
          const roomStatus = rSnap?.data()?.status as string | undefined;
          const roomCurrentRes = rSnap?.data()?.currentReservationId as
            | string
            | undefined;
          const canReinstate =
            !rRef ||
            !rSnap?.exists ||
            roomStatus === "available" ||
            roomCurrentRes === folio.reservationId;
          if (canReinstate) {
            tx.update(resR, {
              status: "confirmed",
              cancelReason: null,
              cancelledAt: null,
              cancelledBy: null,
              holdExpiresAt: null,
              reinstatedAt: new Date().toISOString(),
              reinstatedReason: `Auto-reinstated by processPayment (payment ${payment.id})`,
              updatedAt: FieldValue.serverTimestamp(),
            });
            if (rRef && rSnap?.exists) {
              tx.update(rRef, {
                status: "reserved",
                holdExpiresAt: null,
                currentReservationId: folio.reservationId,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
            reinstateOutcome = "reinstated";
          } else {
            // Room is taken by another booking. Money's real but we can't
            // give the guest their room back. Cashier must refund.
            tx.update(fRef, {
              needsRefund: true,
              needsRefundReason: `Room ${resData.roomId ?? "?"} was reallocated after reservation cancellation; guest payment of R${(data.amount / 100).toFixed(2)} must be refunded`,
              updatedAt: FieldValue.serverTimestamp(),
            });
            reinstateOutcome = "refund_due";
          }
        } else {
          // Normal path — promote held room + clear hold on settle.
          if (newStatus === "settled") {
            if (rRef && rSnap?.exists && rSnap.data()?.status === "held") {
              tx.update(rRef, {
                status: "reserved",
                holdExpiresAt: null,
                currentReservationId: folio.reservationId,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
            tx.update(resR, {
              holdExpiresAt: null,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      } else {
        reinstateOutcome = "no_reservation";
      }

      return {
        balance: Math.max(0, newBalance),
        status: newStatus,
        reinstateOutcome,
      };
    });

    await writeAuditLog({
      action: "folio.payment",
      resource: "folio",
      resourceId: data.folioId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? "",
      tenantId,
      propertyId,
      details: { method: data.method, amount: data.amount },
    }).catch(() => {});

    return { success: true, ...result };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
