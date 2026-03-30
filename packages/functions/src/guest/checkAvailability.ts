import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { wrapError } from "../lib/errors.js";
import { roomsRef, roomTypesRef, reservationsRef } from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

const checkAvailabilitySchema = z.object({
  tenantId: z.string().min(1),
  propertyId: z.string().min(1),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  roomTypeId: z.string().min(1).nullish().transform((v) => v ?? undefined),
});

export const checkAvailability = onCall({ cors: true }, async (request) => {
  try {
    const data = validateRequest(checkAvailabilitySchema, request.data);

    // Get all active room types
    let rtQuery = roomTypesRef(data.tenantId).where("isActive", "==", true);
    const rtSnap = await rtQuery.get();

    // Get all rooms
    const roomsSnap = await roomsRef(data.tenantId, data.propertyId)
      .where("isActive", "==", true)
      .get();

    // Get overlapping reservations (not cancelled/no_show/checked_out)
    const resSnap = await reservationsRef(data.tenantId, data.propertyId)
      .where("status", "in", ["confirmed", "checked_in"])
      .get();

    // Find rooms that are booked for the requested dates
    const bookedRoomIds = new Set<string>();
    for (const doc of resSnap.docs) {
      const res = doc.data();
      // A reservation overlaps if: resCheckIn < requestedCheckOut AND resCheckOut > requestedCheckIn
      if (
        (res.checkInDate as string) < data.checkOutDate &&
        (res.checkOutDate as string) > data.checkInDate
      ) {
        if (res.roomId) {
          bookedRoomIds.add(res.roomId as string);
        }
      }
    }

    // Count truly available rooms per type (room status is available/reserved AND not date-booked)
    const availableByType = new Map<string, number>();
    for (const doc of roomsSnap.docs) {
      const room = doc.data();
      const status = room.status as string;
      // Room must be physically available (not occupied, maintenance, dirty)
      // OR reserved (will be free by then) — and not date-conflicting
      if ((status === "available" || status === "reserved") && !bookedRoomIds.has(doc.id)) {
        const typeId = room.roomTypeId as string;
        availableByType.set(typeId, (availableByType.get(typeId) ?? 0) + 1);
      }
    }

    // Also count rooms with no assigned reservation that overlap
    // For room types without specific room assignment, count by type capacity
    const roomsByType = new Map<string, number>();
    for (const doc of roomsSnap.docs) {
      const room = doc.data();
      const typeId = room.roomTypeId as string;
      roomsByType.set(typeId, (roomsByType.get(typeId) ?? 0) + 1);
    }

    // Count reservations without room assignment per type (they'll need a room too)
    const unassignedByType = new Map<string, number>();
    for (const doc of resSnap.docs) {
      const res = doc.data();
      if (
        !res.roomId &&
        (res.checkInDate as string) < data.checkOutDate &&
        (res.checkOutDate as string) > data.checkInDate
      ) {
        const typeId = res.roomTypeId as string;
        unassignedByType.set(typeId, (unassignedByType.get(typeId) ?? 0) + 1);
      }
    }

    // Adjust available counts for unassigned reservations
    for (const [typeId, count] of unassignedByType) {
      const current = availableByType.get(typeId) ?? 0;
      availableByType.set(typeId, Math.max(0, current - count));
    }

    const results = rtSnap.docs
      .filter((doc) => !data.roomTypeId || doc.id === data.roomTypeId)
      .map((doc) => {
        const rt = doc.data();
        return {
          id: doc.id,
          name: rt.name as string,
          code: rt.code as string,
          description: rt.description as string | null,
          baseRate: rt.baseRate as number,
          maxOccupancy: rt.maxOccupancy as number,
          bedConfiguration: rt.bedConfiguration as string,
          amenities: (rt.amenities as string[]) ?? [],
          imageUrls: (rt.imageUrls as string[]) ?? [],
          available: availableByType.get(doc.id) ?? 0,
        };
      });

    return { roomTypes: results };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
