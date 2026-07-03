import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../lib/firestore.js";

/**
 * Runs every 5 minutes to release rooms whose 30-minute hold has expired.
 *
 * Race-safe variant: each room is processed inside its own transaction. We
 * re-read the room INSIDE the transaction and abort if its status is no
 * longer `held` or its holdExpiresAt is no longer in the past — that means
 * a payment landed between our scan and the write, and we must NOT clobber
 * a paid room back to `available`.
 */
export const releaseExpiredHolds = onSchedule("every 5 minutes", async () => {
  const now = new Date().toISOString();
  const propsSnap = await db.collectionGroup("properties").get();

  for (const propDoc of propsSnap.docs) {
    const propPath = propDoc.ref.path; // tenants/{tid}/properties/{pid}
    const roomsSnap = await db
      .collection(`${propPath}/rooms`)
      .where("status", "==", "held")
      .get();

    for (const roomDoc of roomsSnap.docs) {
      const roomId = roomDoc.id;
      const holdAtCandidate = roomDoc.data().holdExpiresAt as string | null;
      if (!holdAtCandidate || holdAtCandidate > now) continue;

      try {
        await db.runTransaction(async (tx) => {
          // Fresh read inside the transaction — payment may have landed
          // and promoted the room to `reserved` between the scan above and
          // this txn opening.
          const freshRoomSnap = await tx.get(roomDoc.ref);
          if (!freshRoomSnap.exists) return;
          const freshRoom = freshRoomSnap.data()!;

          if (freshRoom.status !== "held") {
            // Was paid + promoted, or already released by another run.
            return;
          }
          const freshHoldExp = freshRoom.holdExpiresAt as string | null;
          if (!freshHoldExp || freshHoldExp > now) {
            // Hold was extended (or cleared) since the scan — skip.
            return;
          }

          // Find linked reservation (direct doc lookup via the room's
          // currentReservationId is cheaper than a query; fall back to
          // query if not set).
          let resRef: FirebaseFirestore.DocumentReference | null = null;
          let resSnap: FirebaseFirestore.DocumentSnapshot | null = null;
          const currentResId =
            freshRoom.currentReservationId as string | null;
          if (currentResId) {
            resRef = db.doc(`${propPath}/reservations/${currentResId}`);
            resSnap = await tx.get(resRef);
            if (!resSnap.exists) {
              resRef = null;
              resSnap = null;
            }
          }
          if (!resRef) {
            const fallback = await tx.get(
              db
                .collection(`${propPath}/reservations`)
                .where("roomId", "==", roomId)
                .where("status", "==", "confirmed")
                .limit(1),
            );
            if (!fallback.empty) {
              resRef = fallback.docs[0]!.ref;
              resSnap = fallback.docs[0]!;
            }
          }

          // Re-check reservation hold expired too — defends against the
          // case where a payment cleared but the room status missed an
          // update (defensive). If the linked reservation isn't expired,
          // skip room release as well.
          if (resSnap && resSnap.exists) {
            const r = resSnap.data()!;
            if (r.status !== "confirmed") return;
            const rHold = r.holdExpiresAt as string | null;
            if (!rHold || rHold > now) return;
          }

          // Also pre-read the folio so we can void it in the SAME txn as
          // the reservation cancel — otherwise a late-arriving payment
          // (e.g. sweepPendingPayments sees Plankton captured a few
          // minutes after we release) would apply to an "open" folio for
          // a cancelled reservation, silently accruing paid money against
          // a booking that no longer exists.
          let folioRef: FirebaseFirestore.DocumentReference | null = null;
          let folioSnap: FirebaseFirestore.DocumentSnapshot | null = null;
          if (resSnap && resSnap.exists) {
            const resData = resSnap.data()!;
            const folioIdOnRes = resData.folioId as string | undefined;
            const groupId = resData.groupId as string | undefined;
            if (folioIdOnRes) {
              folioRef = db.doc(`${propPath}/folios/${folioIdOnRes}`);
              folioSnap = await tx.get(folioRef);
              // For group bookings the folio is shared with sibling
              // reservations. Don't void it if a sibling is still active
              // (that would clobber their booking's balance state). We
              // check siblings by folio.reservationIds — if any sibling
              // status is still confirmed/checked_in, keep the folio open.
              if (folioSnap.exists && groupId) {
                const folioData = folioSnap.data()!;
                const sibIds =
                  (folioData.reservationIds as string[] | undefined) ?? [];
                // Read siblings inside the same txn to keep the decision
                // atomic. Slightly expensive but group bookings are the
                // exception, not the rule.
                let hasActiveSibling = false;
                for (const sibId of sibIds) {
                  if (sibId === resSnap.id) continue;
                  const sibSnap = await tx.get(
                    db.doc(`${propPath}/reservations/${sibId}`),
                  );
                  if (!sibSnap.exists) continue;
                  const sibStatus = sibSnap.data()!.status as string;
                  if (sibStatus === "confirmed" || sibStatus === "checked_in") {
                    hasActiveSibling = true;
                    break;
                  }
                }
                if (hasActiveSibling) {
                  // Keep folio open for the sibling; still release this
                  // reservation's room + cancel this reservation below.
                  folioRef = null;
                  folioSnap = null;
                }
              }
            }
          }

          // --- All reads done, safe to write. ---
          tx.update(roomDoc.ref, {
            status: "available",
            holdExpiresAt: null,
            currentReservationId: null,
            updatedAt: now,
          });
          if (resRef) {
            tx.update(resRef, {
              status: "cancelled",
              cancelReason: "Payment not received within hold period",
              cancelledAt: now,
              cancelledBy: "system",
              holdExpiresAt: null,
              updatedAt: now,
            });
          }
          // Void the folio so any late-arriving payment settles into a
          // clearly-void state, not into a live "open" folio. The sync
          // path checks folio.status === "open" before applying, so a
          // voided folio makes the intent → SUCCEEDED (audit visible) but
          // no phantom credit accumulates against a dead booking.
          if (folioRef && folioSnap?.exists) {
            const folioData = folioSnap.data()!;
            if (folioData.status === "open") {
              tx.update(folioRef, {
                status: "void",
                voidedAt: now,
                voidReason: "Hold expired without payment",
                updatedAt: now,
              });
            }
          }
        });
        console.log(
          `Released held room ${roomId} (hold expired at ${holdAtCandidate})`,
        );
      } catch (err) {
        console.error(`Failed to release room ${roomId}`, err);
      }
    }
  }
});
