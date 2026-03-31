import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../lib/firestore.js";

/**
 * Runs every 5 minutes to release rooms whose 30-minute hold has expired.
 * If a hold expires, the room goes back to "available" and the reservation
 * is cancelled with reason "hold_expired".
 */
export const releaseExpiredHolds = onSchedule("every 5 minutes", async () => {
  const now = new Date().toISOString();

  // Find all properties
  const tenantsSnap = await db.collectionGroup("properties").get();

  for (const propDoc of tenantsSnap.docs) {
    const propPath = propDoc.ref.path; // tenants/{tid}/properties/{pid}
    const roomsSnap = await db
      .collection(`${propPath}/rooms`)
      .where("status", "==", "held")
      .get();

    for (const roomDoc of roomsSnap.docs) {
      const room = roomDoc.data();
      const holdExpiresAt = room.holdExpiresAt as string | null;

      if (!holdExpiresAt || holdExpiresAt > now) continue;

      // Hold expired — release the room
      const batch = db.batch();

      batch.update(roomDoc.ref, {
        status: "available",
        holdExpiresAt: null,
        currentReservationId: null,
        updatedAt: now,
      });

      // Find and cancel the associated reservation
      const resSnap = await db
        .collection(`${propPath}/reservations`)
        .where("roomId", "==", roomDoc.id)
        .where("status", "==", "confirmed")
        .where("holdExpiresAt", "<=", now)
        .get();

      for (const resDoc of resSnap.docs) {
        batch.update(resDoc.ref, {
          status: "cancelled",
          cancelReason: "Payment not received within hold period",
          cancelledAt: now,
          cancelledBy: "system",
          holdExpiresAt: null,
          roomId: null,
          updatedAt: now,
        });
      }

      await batch.commit();
      console.log(`Released held room ${roomDoc.id} (hold expired at ${holdExpiresAt})`);
    }
  }
});
