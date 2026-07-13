import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";

function getPath() {
  const { tenantId, propertyId } = usePropertyStore.getState();
  return { tenantId: tenantId!, propertyId: propertyId! };
}

/**
 * Day-by-day report rows for the Reports page.
 *
 * Historically this read from a `dailyAggregates` collection populated by
 * the onReservationUpdate trigger — but that trigger ONLY writes on
 * status transitions (check-in / check-out / cancel). For a live view where
 * bookings are made for future dates and haven't checked out yet, the
 * aggregates collection is empty and the page shows nothing.
 *
 * This client-side computation covers that gap: query every reservation
 * whose stay overlaps the requested window, plus the active-rooms count,
 * then bucket by day. Occupancy = (reservations occupying a room that day)
 * / (active rooms). Revenue = per-night share of each reservation's
 * totalRoomCharges (distributed evenly across each night of the stay).
 *
 * Cancelled / no-show reservations are excluded. Room revenue only —
 * services (add-charge lines on folios) are not counted here yet.
 */
export interface ReportRow {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number;
  roomRevenue: number;
  serviceRevenue: number;
  totalRevenue: number;
}

export async function getDailyAggregates(
  startDate: string,
  endDate: string,
): Promise<ReportRow[]> {
  const { tenantId, propertyId } = getPath();
  // Fetch reservations by status only — a compound (status, checkInDate)
  // range query would need a Firestore composite index we don't have yet.
  // Dataset is small (single property, dozens to low hundreds of active
  // reservations); the date overlap filter runs client-side.
  const resSnap = await getDocs(
    query(
      collection(db, `tenants/${tenantId}/properties/${propertyId}/reservations`),
      where("status", "in", ["confirmed", "checked_in", "checked_out"]),
    ),
  );

  interface Res {
    checkInDate: string;
    checkOutDate: string;
    nightCount: number;
    totalRoomCharges: number;
  }
  const endExclusive = addDays(endDate, 1);
  const overlapping: Res[] = [];
  for (const doc of resSnap.docs) {
    const d = doc.data() as Res;
    // Overlap: reservation's stay intersects the report window.
    if (d.checkInDate < endExclusive && d.checkOutDate > startDate) {
      overlapping.push(d);
    }
  }

  // Active rooms count for the occupancy denominator.
  const roomsSnap = await getDocs(
    query(
      collection(db, `tenants/${tenantId}/properties/${propertyId}/rooms`),
      where("isActive", "==", true),
    ),
  );
  const totalRooms = roomsSnap.size;

  // Build one row per day in the window.
  const rows: ReportRow[] = [];
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    let occupiedRooms = 0;
    let roomRevenue = 0;
    for (const r of overlapping) {
      // A reservation "occupies" `day` when checkInDate <= day < checkOutDate.
      if (r.checkInDate <= day && day < r.checkOutDate) {
        occupiedRooms += 1;
        const nightly =
          r.nightCount > 0 ? Math.round(r.totalRoomCharges / r.nightCount) : 0;
        roomRevenue += nightly;
      }
    }
    // Cap at 100%: historical rooms use the CURRENT active-room count as the
    // denominator, and an over-booked day (two reservations, one room) can
    // push occupiedRooms above totalRooms — which would otherwise report a
    // nonsensical >100% rate and skew the average/peak occupancy figures.
    const occupancyRate =
      totalRooms > 0
        ? Math.min(100, Math.round((occupiedRooms / totalRooms) * 100))
        : 0;
    rows.push({
      date: day,
      totalRooms,
      occupiedRooms,
      occupancyRate,
      roomRevenue,
      // Service revenue (F&B / add-charges) isn't sourced yet — kept as 0
      // so the Reports UI columns still render without a schema change.
      serviceRevenue: 0,
      totalRevenue: roomRevenue,
    });
  }
  return rows;
}

/** YYYY-MM-DD arithmetic. Adds `n` days to the given date string. */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0]!;
}
