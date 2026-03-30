import { FieldValue } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

import { dailyAggregatesRef, roomsRef } from "../lib/firestore.js";

export const onReservationUpdate = onDocumentUpdated(
  "tenants/{tenantId}/properties/{propertyId}/reservations/{reservationId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const { tenantId, propertyId } = event.params;
    const today = new Date().toISOString().split("T")[0]!;
    const aggRef = dailyAggregatesRef(tenantId, propertyId).doc(today);

    // Track status transitions for daily aggregates
    if (before.status !== after.status) {
      const updates: Record<string, unknown> = {};

      if (after.status === "checked_in") {
        updates.arrivals = FieldValue.increment(1);
        updates.occupiedRooms = FieldValue.increment(1);
      }

      if (after.status === "checked_out") {
        updates.departures = FieldValue.increment(1);
        updates.occupiedRooms = FieldValue.increment(-1);
        updates.revenue = FieldValue.increment(after.totalRoomCharges as number);
        updates.roomRevenue = FieldValue.increment(after.totalRoomCharges as number);
      }

      if (after.status === "cancelled") {
        updates.cancellations = FieldValue.increment(1);
        if (before.status === "checked_in" && before.roomId) {
          updates.occupiedRooms = FieldValue.increment(-1);
        }
      }

      if (Object.keys(updates).length > 0) {
        // Count total rooms for occupancy rate
        const roomsSnap = await roomsRef(tenantId, propertyId)
          .where("isActive", "==", true)
          .count()
          .get();
        const totalRooms = roomsSnap.data().count;

        await aggRef.set(
          {
            ...updates,
            totalRooms,
            date: today,
          },
          { merge: true },
        );
      }
    }
  },
);
