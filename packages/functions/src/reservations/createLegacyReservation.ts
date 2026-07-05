import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  calculateNights,
  createLegacyReservationSchema,
} from "@swiftpms/shared";

import { writeAuditLog } from "../lib/audit.js";
import {
  notFound,
  preconditionFailed,
  unauthorized,
  wrapError,
} from "../lib/errors.js";
import {
  db,
  foliosRef,
  guestsRef,
  reservationsRef,
  roomTypeRef,
  roomsRef,
} from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

/**
 * Capture a reservation that was originally booked on a legacy system
 * (St Lucia SA, Ezemvelo KZN Wildlife, etc.) before the client took over.
 *
 * Different from createReservation in three important ways:
 *   1. The `totalRoomCharges` field comes from the invoice, NOT from our
 *      tiered pricing — the old operator's rate is what the guest paid,
 *      not what we'd charge today.
 *   2. `amountAlreadyPaid` is applied as a payment on the folio at
 *      creation time — so the balance reflects only what's still owing
 *      on arrival (or R0 if fully paid).
 *   3. The reservation is created as `confirmed` with no hold expiry —
 *      the guest has already committed; we're not holding a slot pending
 *      payment. If they paid in full → room goes straight to `reserved`.
 *      If there's a balance owing → still `reserved` (they'll pay on
 *      arrival) but the folio stays open.
 *
 * Both new fields `source: "legacy"`, `externalSource`, and
 * `externalReference` land on the reservation for the audit trail.
 */
export const createLegacyReservation = onCall({ cors: true }, async (request) => {
  try {
    if (!request.auth) throw unauthorized();

    const tenantId = request.auth.token.tenantId as string | undefined;
    const role = request.auth.token.role as string | undefined;
    if (!tenantId) throw preconditionFailed("tenantId missing on token");
    if (role === "guest") {
      throw preconditionFailed("Guests cannot import legacy reservations");
    }

    const propertyId = request.data.propertyId as string | undefined;
    if (!propertyId) throw preconditionFailed("propertyId is required");

    const data = validateRequest(createLegacyReservationSchema, request.data);

    // Idempotency — retry-safe.
    if (data.clientRequestId) {
      const existing = await reservationsRef(tenantId, propertyId)
        .where("clientRequestId", "==", data.clientRequestId)
        .limit(1)
        .get();
      if (!existing.empty) {
        const d = existing.docs[0]!;
        const r = d.data();
        return {
          id: d.id,
          folioId: (r.folioId as string) ?? null,
          nightCount: r.nightCount as number,
          totalRoomCharges: r.totalRoomCharges as number,
          balance:
            (r.totalRoomCharges as number) - (data.amountAlreadyPaidCents ?? 0),
        };
      }
    }

    const nightCount = calculateNights(data.checkInDate, data.checkOutDate);
    // "Rate per night" for the reservation is the invoice total ÷ nights;
    // rounded to whole cents to avoid awkward decimals downstream.
    const roomRate =
      nightCount > 0
        ? Math.round(data.totalRoomChargesCents / nightCount)
        : data.totalRoomChargesCents;

    const uid = request.auth.uid;
    const email = (request.auth.token.email as string | undefined) ?? "";

    const result = await db.runTransaction(async (tx) => {
      // ALL READS first.
      const rtSnap = await tx.get(roomTypeRef(tenantId, data.roomTypeId));
      if (!rtSnap.exists) throw notFound("Room type not found");

      // Find an available room of the requested type, avoiding
      // overlap with existing confirmed/checked_in reservations. Legacy
      // dates may be in the future or past — for past stays, room
      // status doesn't matter (nothing to reserve); for future stays,
      // do the same overlap check we do for regular bookings.
      const allRooms = await tx.get(
        roomsRef(tenantId, propertyId)
          .where("roomTypeId", "==", data.roomTypeId)
          .where("isActive", "==", true),
      );
      const allRes = await tx.get(
        reservationsRef(tenantId, propertyId).where("status", "in", [
          "confirmed",
          "checked_in",
        ]),
      );
      const bookedRoomIds = new Set<string>();
      for (const rd of allRes.docs) {
        const r = rd.data();
        if (
          r.roomId &&
          (r.checkInDate as string) < data.checkOutDate &&
          (r.checkOutDate as string) > data.checkInDate
        ) {
          bookedRoomIds.add(r.roomId as string);
        }
      }
      const availableRoom = allRooms.docs.find(
        (d) => !bookedRoomIds.has(d.id),
      );
      if (!availableRoom) {
        throw preconditionFailed(
          "No rooms of this type free for the requested dates",
        );
      }

      // --- Writes below. ---

      // Guest doc — always create fresh for legacy imports. No de-dup by
      // name (they may have booked again separately). If the client wants
      // to link to an existing guest, that's a future feature.
      const guestDocRef = guestsRef(tenantId).doc();
      tx.set(guestDocRef, {
        tenantId,
        firstName: data.guestFirstName,
        lastName: data.guestLastName,
        email: data.guestEmail ?? null,
        phone: data.guestPhone ?? null,
        nationality: null,
        idType: null,
        idNumber: null,
        address: null,
        notes: `Imported from ${data.externalSource}${data.externalReference ? ` (ref ${data.externalReference})` : ""}`,
        companions: [],
        source: "legacy_import",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Room stays "reserved" — the booking is guaranteed, not a hold.
      tx.update(availableRoom.ref, {
        status: "reserved",
        holdExpiresAt: null,
        currentReservationId: null, // set below after we know the res ID
        updatedAt: FieldValue.serverTimestamp(),
      });

      const resRef = reservationsRef(tenantId, propertyId).doc();
      const folioRef = foliosRef(tenantId, propertyId).doc();

      // Reservation. status = confirmed, no hold expiry (guaranteed).
      tx.set(resRef, {
        guestId: guestDocRef.id,
        folioId: folioRef.id,
        roomId: availableRoom.id,
        roomTypeId: data.roomTypeId,
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
        nightCount,
        adults: data.adults,
        children: data.children ?? 0,
        pensioners: data.pensioners ?? 0,
        status: "confirmed",
        holdExpiresAt: null,
        roomRate,
        totalRoomCharges: data.totalRoomChargesCents,
        specialRequests: null,
        source: "legacy",
        externalSource: data.externalSource,
        externalReference: data.externalReference ?? null,
        legacyNotes: data.notes ?? null,
        createdBy: `staff:${uid}`,
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

      // Point the room at this reservation now that we have its id.
      tx.update(availableRoom.ref, {
        currentReservationId: resRef.id,
      });

      // Folio. Room charge line + any pre-existing payment applied.
      const rt = rtSnap.data()!;
      const chargeDescription = `${rt.name as string} — ${nightCount} night(s) — ${data.externalSource}${data.externalReference ? ` #${data.externalReference}` : ""}`;
      const charges = [
        {
          id: `chg_${Date.now()}_legacy`,
          category: "room",
          description: chargeDescription,
          amount: roomRate,
          quantity: nightCount,
          total: data.totalRoomChargesCents,
          date: data.checkInDate,
          addedBy: `staff:${uid}`,
          addedAt: new Date().toISOString(),
        },
      ];

      const paidCents = data.amountAlreadyPaidCents ?? 0;
      const payments = paidCents > 0
        ? [
            {
              id: `pmt_${Date.now()}_legacy`,
              method: data.paymentMethodOriginal ?? "other",
              amount: paidCents,
              reference: data.paymentReference ?? null,
              paymentDate: data.paymentDateOriginal ?? null,
              source: data.externalSource,
              processedBy: `staff:${uid}`,
              processedAt: new Date().toISOString(),
              // Distinguishes from live-taken payments so cash-up can
              // exclude these (money was already collected by the old
              // operator, not by our till).
              legacy: true,
            },
          ]
        : [];

      const balance = data.totalRoomChargesCents - paidCents;
      const folioStatus = balance <= 0 ? "settled" : "open";

      tx.set(folioRef, {
        reservationId: resRef.id,
        guestId: guestDocRef.id,
        charges,
        payments,
        totalCharges: data.totalRoomChargesCents,
        totalPayments: paidCents,
        balance: Math.max(0, balance),
        status: folioStatus,
        source: "legacy",
        externalSource: data.externalSource,
        externalReference: data.externalReference ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        id: resRef.id,
        guestId: guestDocRef.id,
        folioId: folioRef.id,
        nightCount,
        totalRoomCharges: data.totalRoomChargesCents,
        amountPaid: paidCents,
        balance: Math.max(0, balance),
      };
    });

    await writeAuditLog({
      action: "reservation.legacy_import",
      resource: "reservation",
      resourceId: result.id,
      userId: uid,
      userEmail: email,
      tenantId,
      propertyId,
      details: {
        externalSource: data.externalSource,
        externalReference: data.externalReference ?? null,
        totalRoomCharges: data.totalRoomChargesCents,
        amountAlreadyPaid: data.amountAlreadyPaidCents ?? 0,
        balance: result.balance,
        guestName: `${data.guestFirstName} ${data.guestLastName}`,
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
      },
    }).catch(() => {});

    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    wrapError(err);
  }
});
