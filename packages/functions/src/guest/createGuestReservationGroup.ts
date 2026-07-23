import crypto from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  calculateNights,
  resolveStayPricing,
  createReservationGroupSchema,
} from "@swiftpms/shared";

import {
  notFound,
  preconditionFailed,
  unauthorized,
  wrapError,
} from "../lib/errors.js";
import {
  db,
  foliosRef,
  guestRef,
  propertyRef,
  reservationsRef,
  roomTypeRef,
  roomsRef,
  tenantRef,
  tourOperatorsRef,
} from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

/**
 * Group booking: create N reservations (one per campsite) tied to a single
 * folio + single payment. Atomic — if ANY site can't be held, no reservations
 * are created and the client gets a precise "not enough of X available" error.
 *
 * Guest count is applied per item so tiered per-person pricing works for
 * mixed groups (e.g. 4 adults on site A, 6 on site B).
 */
export const createGuestReservationGroup = onCall(
  { cors: true },
  async (request) => {
    try {
      if (!request.auth) throw unauthorized();

      const tenantId = request.auth.token.tenantId as string;
      const role = request.auth.token.role as string;
      // Same relaxation as createGuestReservation — guests plus super_admin.
      if (role !== "guest" && role !== "super_admin") {
        throw preconditionFailed("Only guest accounts can use this endpoint");
      }

      const propertyId = request.data.propertyId as string;
      if (!propertyId) throw preconditionFailed("propertyId is required");

      const data = validateRequest(createReservationGroupSchema, request.data);

      // Idempotency — if this clientRequestId already produced a group, return
      // the existing group instead of creating duplicates.
      if (data.clientRequestId) {
        const existing = await reservationsRef(tenantId, propertyId)
          .where("clientRequestId", "==", data.clientRequestId)
          .get();
        if (!existing.empty) {
          // Group all reservations sharing this clientRequestId.
          type ExistingRes = {
            id: string;
            data: FirebaseFirestore.DocumentData;
          };
          const reservations: ExistingRes[] = existing.docs.map((d) => ({
            id: d.id,
            data: d.data(),
          }));
          const first = reservations[0]!;
          return {
            groupId: (first.data.groupId as string | undefined) ?? null,
            reservationIds: reservations.map((r) => r.id),
            folioId: (first.data.folioId as string | undefined) ?? null,
            nightCount: first.data.nightCount as number,
            totalRoomCharges: reservations.reduce(
              (sum, r) => sum + (r.data.totalRoomCharges as number),
              0,
            ),
          };
        }
      }

      const propSnap = await propertyRef(tenantId, propertyId).get();
      if (!propSnap.exists || !(propSnap.data()?.isActive)) {
        throw preconditionFailed("This property is currently unavailable for bookings.");
      }

      // Tour operator discount — authoritative check at booking time.
      const operatorEmail = (request.auth.token.email as string | undefined ?? "").toLowerCase();
      const operatorSnap = await tourOperatorsRef(tenantId)
        .where("email", "==", operatorEmail)
        .where("active", "==", true)
        .limit(1)
        .get();
      const tenantSnap = await tenantRef(tenantId).get();
      const discountPercent = !operatorSnap.empty
        ? ((tenantSnap.data()?.settings?.tourOperatorDiscountPercent as number | undefined) ?? 0)
        : 0;

      if (data.guestId !== request.auth.uid) {
        throw preconditionFailed("guestId must match authenticated user");
      }

      // Booking on behalf of a client is a tour-operator-only capability.
      if (data.bookedFor && operatorSnap.empty) {
        throw preconditionFailed("Only registered tour operators can book on behalf of a client");
      }
      const bookedFor = data.bookedFor
        ? {
            name: data.bookedFor.name,
            email: data.bookedFor.email.toLowerCase(),
            phone: data.bookedFor.phone ?? null,
          }
        : null;

      const groupId = `grp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
      const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const nightCount = calculateNights(data.checkInDate, data.checkOutDate);

      const result = await db.runTransaction(async (tx) => {
        // Verify guest doc exists.
        const guestSnap = await tx.get(guestRef(tenantId, data.guestId));
        if (!guestSnap.exists) throw notFound("Guest not found");

        // Preload all room types referenced in items (dedupe first).
        const uniqueRoomTypeIds = Array.from(
          new Set(data.items.map((i) => i.roomTypeId)),
        );
        const roomTypeMap = new Map<string, FirebaseFirestore.DocumentData>();
        for (const rtId of uniqueRoomTypeIds) {
          const rtSnap = await tx.get(roomTypeRef(tenantId, rtId));
          if (!rtSnap.exists) throw notFound(`Room type ${rtId} not found`);
          roomTypeMap.set(rtId, rtSnap.data()!);
        }

        // Preload rooms per room type + existing reservations for overlap.
        // We assign rooms to items in order — first-item-first-served.
        const roomsByType = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
        for (const rtId of uniqueRoomTypeIds) {
          const roomsSnap = await tx.get(
            roomsRef(tenantId, propertyId)
              .where("roomTypeId", "==", rtId)
              .where("isActive", "==", true),
          );
          roomsByType.set(rtId, roomsSnap.docs);
        }
        const overlapSnap = await tx.get(
          reservationsRef(tenantId, propertyId)
            .where("status", "in", ["confirmed", "checked_in"]),
        );
        const bookedRoomIds = new Set<string>();
        for (const rd of overlapSnap.docs) {
          const r = rd.data();
          if (
            r.roomId &&
            (r.checkInDate as string) < data.checkOutDate &&
            (r.checkOutDate as string) > data.checkInDate
          ) {
            bookedRoomIds.add(r.roomId as string);
          }
        }

        // Build per-item allocation: pick a room, price it.
        const assignments: {
          roomId: string;
          roomRef: FirebaseFirestore.DocumentReference;
          roomTypeId: string;
          roomTypeName: string;
          roomRate: number;
          totalRoomCharges: number;
          grossRoomCharges: number;
          discountAmount: number;
          childLabel: string;
          segments: ReturnType<typeof resolveStayPricing>["segments"];
          adults: number;
          children: number;
        }[] = [];
        // Track which room ids we've assigned within this transaction so
        // two items of the same room type don't both grab the same room.
        const usedInThisGroup = new Set<string>();

        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i]!;
          const roomType = roomTypeMap.get(item.roomTypeId)!;
          const candidates = roomsByType.get(item.roomTypeId)!;
          const available = candidates.find((d) => {
            if (bookedRoomIds.has(d.id) || usedInThisGroup.has(d.id)) return false;
            const s = d.data().status as string;
            return s === "available";
          });
          if (!available) {
            throw preconditionFailed(
              `Only ${assignments.filter((a) => a.roomTypeId === item.roomTypeId).length} ${roomType.name}(s) available for the selected dates.`,
            );
          }
          usedInThisGroup.add(available.id);

          const adults = item.adults;
          const children = item.children ?? 0;
          const calc = resolveStayPricing(
            roomType as Parameters<typeof resolveStayPricing>[0],
            data.checkInDate,
            data.checkOutDate,
            adults,
            children,
            0,
            discountPercent,
          );
          const roomRate = calc.nightlyRate;
          const totalRoomCharges = calc.total;
          const tiered = roomType.tieredPricing as { childAgeMax: number } | undefined;
          const childLabel = tiered && children > 0
            ? `, ${children} child(ren) under ${tiered.childAgeMax + 1}`
            : "";

          assignments.push({
            roomId: available.id,
            roomRef: available.ref,
            roomTypeId: item.roomTypeId,
            roomTypeName: roomType.name as string,
            roomRate,
            totalRoomCharges,
            grossRoomCharges: calc.grossTotal,
            discountAmount: calc.discountAmount,
            childLabel,
            segments: calc.segments,
            adults,
            children,
          });
        }

        // --- reads complete. writes begin. ---

        // Create N reservations.
        const reservationRefs = assignments.map(() =>
          reservationsRef(tenantId, propertyId).doc(),
        );
        const folioDocRef = foliosRef(tenantId, propertyId).doc();

        // Sum for folio totals.
        const totalRoomCharges = assignments.reduce(
          (sum, a) => sum + a.totalRoomCharges,
          0,
        );

        for (let i = 0; i < assignments.length; i++) {
          const a = assignments[i]!;
          const resRef = reservationRefs[i]!;
          tx.update(a.roomRef, {
            status: "held",
            holdExpiresAt,
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(resRef, {
            guestId: data.guestId,
            groupId,
            folioId: folioDocRef.id,
            roomId: a.roomId,
            roomTypeId: a.roomTypeId,
            checkInDate: data.checkInDate,
            checkOutDate: data.checkOutDate,
            nightCount,
            adults: a.adults,
            children: a.children,
            status: "confirmed",
            holdExpiresAt,
            roomRate: a.roomRate,
            totalRoomCharges: a.totalRoomCharges,
            specialRequests: data.specialRequests ?? null,
            bookedFor,
            source: "guest_portal",
            createdBy: `guest:${request.auth!.uid}`,
            clientRequestId: data.clientRequestId ?? null,
            checkedInAt: null,
            checkedInBy: null,
            checkedOutAt: null,
            checkedOutBy: null,
            cancelledAt: null,
            cancelledBy: null,
            cancelReason: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // Single folio with a charge per site.
        // One line per (site × pricing segment). A site whose stay straddles a
        // season boundary contributes multiple lines so each line's
        // amount × quantity === total.
        const seasonName = (t: string) => (t === "high" ? "peak" : t);
        const charges: {
          id: string;
          category: string;
          description: string;
          amount: number;
          quantity: number;
          total: number;
          date: string;
          reservationId?: string;
          addedBy: string;
          addedAt: string;
        }[] = assignments.flatMap((a, i) =>
          a.segments.map((seg, j) => ({
            id: `chg_${Date.now()}_${i}_${j}`,
            category: "room",
            description:
              a.segments.length === 1 && seg.tier === "standard"
                ? `${a.roomTypeName} #${i + 1} — ${seg.nights} night(s) (${a.adults} adult(s), ${a.children} child(ren))`
                : `${a.roomTypeName} #${i + 1} — ${seg.nights} night(s) (${seasonName(seg.tier)}, ${a.adults} adult(s)${a.childLabel})`,
            amount: seg.nightlyRate,
            quantity: seg.nights,
            total: seg.subtotal,
            date: seg.start,
            reservationId: reservationRefs[i]!.id,
            addedBy: `guest:${request.auth!.uid}`,
            addedAt: new Date().toISOString(),
          })),
        );

        const totalDiscount = assignments.reduce((sum, a) => sum + a.discountAmount, 0);
        if (totalDiscount > 0) {
          charges.push({
            id: `chg_${Date.now()}_disc`,
            category: "discount",
            description: "Tour operator discount",
            amount: -totalDiscount,
            quantity: 1,
            total: -totalDiscount,
            date: data.checkInDate,
            addedBy: `guest:${request.auth!.uid}`,
            addedAt: new Date().toISOString(),
          });
        }

        tx.set(folioDocRef, {
          reservationId: reservationRefs[0]!.id, // legacy field — first reservation
          reservationIds: reservationRefs.map((r) => r.id),
          groupId,
          guestId: data.guestId,
          charges,
          payments: [],
          totalCharges: totalRoomCharges,
          totalPayments: 0,
          balance: totalRoomCharges,
          status: "open",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          groupId,
          reservationIds: reservationRefs.map((r) => r.id),
          folioId: folioDocRef.id,
          nightCount,
          totalRoomCharges,
        };
      });

      return result;
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      wrapError(err);
    }
  },
);
