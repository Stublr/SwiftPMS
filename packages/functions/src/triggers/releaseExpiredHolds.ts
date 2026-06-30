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
