import { FieldValue } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

import {
  dailyAggregatesRef,
  propertyRef,
  roomsRef,
} from "../lib/firestore.js";

/**
 * Format a Date as YYYY-MM-DD in the given IANA timezone. Bucketing daily
 * aggregates in the property's local timezone — UTC would split a SAST
 * (UTC+2) day at 22:00, putting two hours of revenue into the wrong bucket.
 */
function isoDateInZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const onReservationUpdate = onDocumentUpdated(
  "tenants/{tenantId}/properties/{propertyId}/reservations/{reservationId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const { tenantId, propertyId } = event.params;

    // Resolve the property's timezone (default to SAST). Read is cheap +
    // the result feeds every aggregate write below.
    let timezone = "Africa/Johannesburg";
    try {
      const propSnap = await propertyRef(tenantId, propertyId).get();
      if (propSnap.exists) {
        const tz = propSnap.data()?.timezone as string | undefined;
        if (tz) timezone = tz;
      }
    } catch {
      // Fall back to default — never block the trigger on a config read.
    }

    const today = isoDateInZone(new Date(), timezone);
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
