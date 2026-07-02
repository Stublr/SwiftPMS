import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  PaymentIntentStatus,
  addCents,
  subtractCents,
  formatCents,
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
  folioRef,
  guestRef,
  paymentIntentRef,
  paymentIntentsRef,
  propertyRef,
  reservationRef,
  roomRef,
  roomTypeRef,
} from "../lib/firestore.js";
import { SENDGRID_API_KEY, sendBookingConfirmation } from "../lib/email.js";
import {
  PLANKTON_API_KEY,
  getPlanktonPayment,
  isAuthorized,
  isCaptured,
  isTerminalFailure,
  syncPlanktonPayment,
  type PaymentResponse,
  type PlanktonStatus,
} from "./planktonPaymentsClient.js";

/**
 * Map a Plankton status → our internal PaymentIntent status.
 *
 * `captureMode` controls how `authorized` is treated: in automatic-capture
 * mode (guest booking flow) `authorized` is pending — we only settle on
 * `captured`. In manual-capture mode `authorized` means funds are held
 * successfully and callers may treat it as terminal for the auth step.
 */
function mapStatus(
  s: PlanktonStatus,
  captureMode: "automatic" | "manual",
): PaymentIntentStatus {
  if (isCaptured(s)) return PaymentIntentStatus.SUCCEEDED;
  if (isAuthorized(s)) {
    return captureMode === "manual"
      ? PaymentIntentStatus.SUCCEEDED
      : PaymentIntentStatus.REDIRECTED;
  }
  if (s === "refunded") return PaymentIntentStatus.REFUNDED;
  if (s === "partially_refunded") return PaymentIntentStatus.PARTIALLY_REFUNDED;
  if (s === "cancelled") return PaymentIntentStatus.CANCELLED;
  if (s === "timed_out") return PaymentIntentStatus.EXPIRED;
  if (isTerminalFailure(s)) return PaymentIntentStatus.FAILED;
  // requires_action / created / authorizing → still in flight
  return PaymentIntentStatus.REDIRECTED;
}

/**
 * Resolve the PaymentIntent doc for a sync call. Callers may pass either
 * our internal `paymentIntentId` (fast, direct doc lookup — same-browser
 * return case) or the Plankton platform's `planktonPaymentId` (the URL
 * param — cross-device return case). The Plankton-id path uses a field
 * query which requires Firestore's default single-field auto-index.
 */
async function resolveIntent(
  tenantId: string,
  propertyId: string,
  paymentIntentId: string | undefined,
  planktonPaymentId: string | undefined,
): Promise<{
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
}> {
  if (paymentIntentId) {
    const ref = paymentIntentRef(tenantId, propertyId, paymentIntentId);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("PaymentIntent not found");
    return { ref, data: snap.data()! };
  }
  if (planktonPaymentId) {
    const q = await paymentIntentsRef(tenantId, propertyId)
      .where("planktonPaymentId", "==", planktonPaymentId)
      .limit(1)
      .get();
    if (q.empty) throw notFound("PaymentIntent not found for this paymentId");
    const doc = q.docs[0]!;
    return { ref: doc.ref, data: doc.data() };
  }
  throw preconditionFailed(
    "paymentIntentId or planktonPaymentId is required",
  );
}

/**
 * Aidan's spec: "Verify it's really our order: confirm the returned
 * orderReference (and amount) match the order we expect for this session.
 * Don't settle based on the URL alone." Throws HttpsError on mismatch —
 * we never settle a folio against an unverified gateway response.
 */
function verifyGatewayMatchesIntent(
  planktonRes: PaymentResponse,
  intent: FirebaseFirestore.DocumentData,
): void {
  const expectedRef =
    (intent.reservationId as string | null) ??
    (intent.folioId as string | null) ??
    (intent.id as string);

  if (planktonRes.orderReference && planktonRes.orderReference !== expectedRef) {
    console.error("Plankton orderReference mismatch", {
      expected: expectedRef,
      got: planktonRes.orderReference,
      planktonPaymentId: planktonRes.paymentId,
    });
    throw preconditionFailed(
      `orderReference mismatch (expected ${expectedRef}, got ${planktonRes.orderReference})`,
    );
  }
  const expectedAmount = intent.amount as number;
  if (
    typeof planktonRes.amount === "number" &&
    planktonRes.amount !== expectedAmount
  ) {
    console.error("Plankton amount mismatch", {
      expected: expectedAmount,
      got: planktonRes.amount,
      planktonPaymentId: planktonRes.paymentId,
    });
    throw preconditionFailed(
      `amount mismatch (expected ${expectedAmount}, got ${planktonRes.amount})`,
    );
  }
}

/**
 * Poll the Plankton platform for a payment's authoritative status, update
 * our PaymentIntent doc, and on success apply the payment to the folio +
 * promote a held room to reserved.
 *
 * Designed to be called repeatedly from the client until the status is
 * terminal. Idempotent: doesn't double-apply if the intent is already
 * SUCCEEDED/FAILED/CANCELLED/EXPIRED/REFUNDED.
 */
export const syncPaymentStatus = onCall(
  { cors: true, secrets: [PLANKTON_API_KEY, SENDGRID_API_KEY] },
  async (request) => {
    try {
      if (!request.auth) throw unauthorized();

      const tenantId = request.auth.token.tenantId as string | undefined;
      if (!tenantId) throw preconditionFailed("tenantId missing on token");

      const propertyId = request.data.propertyId as string;
      const paymentIntentId = request.data.paymentIntentId as
        | string
        | undefined;
      const planktonPaymentIdInput = request.data.planktonPaymentId as
        | string
        | undefined;
      if (!propertyId) throw preconditionFailed("propertyId is required");
      const forceSync = request.data.forceSync === true;

      const { ref: intentDoc, data: intent } = await resolveIntent(
        tenantId,
        propertyId,
        paymentIntentId,
        planktonPaymentIdInput,
      );
      const resolvedPaymentIntentId = intentDoc.id;

      // Idempotency — if already terminal, just return current state.
      const currentStatus = intent.status as PaymentIntentStatus;
      const TERMINAL: PaymentIntentStatus[] = [
        PaymentIntentStatus.SUCCEEDED,
        PaymentIntentStatus.FAILED,
        PaymentIntentStatus.CANCELLED,
        PaymentIntentStatus.EXPIRED,
        PaymentIntentStatus.REFUNDED,
        PaymentIntentStatus.PARTIALLY_REFUNDED,
      ];
      if (TERMINAL.includes(currentStatus)) {
        return {
          paymentIntentId: resolvedPaymentIntentId,
          status: currentStatus,
          terminal: true,
        };
      }

      const planktonPaymentId = intent.planktonPaymentId as string | null;
      if (!planktonPaymentId) {
        throw preconditionFailed(
          "PaymentIntent has no planktonPaymentId — was it initiated via the railways platform?",
        );
      }

      // Guard: if caller supplied a Plankton paymentId via URL, it MUST match
      // the id we stored on the intent. This prevents URL-tampered ids from
      // being applied to another session's intent.
      if (
        planktonPaymentIdInput &&
        planktonPaymentIdInput !== planktonPaymentId
      ) {
        throw preconditionFailed(
          "URL paymentId does not match stored planktonPaymentId for this intent",
        );
      }

      // Fetch from Plankton platform. forceSync nudges the gateway if the
      // client thinks the customer paid but our status is stale.
      const planktonRes = forceSync
        ? await syncPlanktonPayment(planktonPaymentId)
        : await getPlanktonPayment(planktonPaymentId);

      // Aidan's spec: verify orderReference + amount from the gateway match
      // what we expect for this intent BEFORE settling anything.
      verifyGatewayMatchesIntent(planktonRes, intent);

      const captureMode: "automatic" | "manual" =
        (intent.paymentType as string) === "PA" ? "manual" : "automatic";
      const newStatus = mapStatus(planktonRes.status, captureMode);

      // Still in flight — don't touch folio.
      if (newStatus === PaymentIntentStatus.REDIRECTED) {
        return {
          paymentIntentId: resolvedPaymentIntentId,
          status: PaymentIntentStatus.REDIRECTED,
          planktonStatus: planktonRes.status,
          terminal: false,
        };
      }

      const isSuccess = newStatus === PaymentIntentStatus.SUCCEEDED;

      // Track whether THIS invocation is the one that actually applied the
      // payment (vs a no-op re-entry). Only send the confirmation email on
      // the applying invocation to keep it idempotent.
      let didApply = false;

      await db.runTransaction(async (tx) => {
        // Firestore transactions require ALL reads before ANY writes.
        // 1) Read the intent (idempotency + amounts + linked IDs)
        const fresh = await tx.get(intentDoc);
        if (!fresh.exists) return;
        const freshIntent = fresh.data()!;

        if (TERMINAL.includes(freshIntent.status as PaymentIntentStatus)) {
          return;
        }

        const folioId = freshIntent.folioId as string | null;
        const legacyReservationId = freshIntent.reservationId as string | null;
        const paymentType = freshIntent.paymentType as string;
        const amount = freshIntent.amount as number;

        // 2) Pre-fetch folio + ALL reservations + their rooms BEFORE any
        //    writes. For group bookings the folio's `reservationIds` covers
        //    every campsite; for legacy solo bookings we fall back to the
        //    intent's single reservationId.
        let folioSnap: FirebaseFirestore.DocumentSnapshot | null = null;
        let fRef: FirebaseFirestore.DocumentReference | null = null;
        // Per-reservation prefetch, one entry per site in the group.
        const resPrefetch: {
          resRef: FirebaseFirestore.DocumentReference;
          resSnap: FirebaseFirestore.DocumentSnapshot;
          roomRef: FirebaseFirestore.DocumentReference | null;
          roomSnap: FirebaseFirestore.DocumentSnapshot | null;
        }[] = [];

        if (isSuccess && paymentType === "DB" && folioId) {
          fRef = folioRef(tenantId, propertyId, folioId);
          folioSnap = await tx.get(fRef);

          // Prefer folio.reservationIds (group) over intent.reservationId (solo).
          const folioReservationIds = folioSnap.exists
            ? ((folioSnap.data()!.reservationIds as string[] | undefined) ?? null)
            : null;
          const reservationIdsToLoad =
            folioReservationIds && folioReservationIds.length > 0
              ? folioReservationIds
              : legacyReservationId
                ? [legacyReservationId]
                : [];

          for (const rid of reservationIdsToLoad) {
            const resR = reservationRef(tenantId, propertyId, rid);
            const resSnap = await tx.get(resR);
            let roomR: FirebaseFirestore.DocumentReference | null = null;
            let roomSnap: FirebaseFirestore.DocumentSnapshot | null = null;
            const roomIdOnRes = resSnap.exists
              ? (resSnap.data()!.roomId as string | null)
              : null;
            if (roomIdOnRes) {
              roomR = roomRef(tenantId, propertyId, roomIdOnRes);
              roomSnap = await tx.get(roomR);
            }
            resPrefetch.push({ resRef: resR, resSnap, roomRef: roomR, roomSnap });
          }
        }

        // --- All reads complete. Begin writes. ---

        tx.update(intentDoc, {
          status: newStatus,
          planktonStatus: planktonRes.status,
          planktonFailureReason: planktonRes.failureReason ?? null,
          planktonFailureMessage: planktonRes.failureMessage ?? null,
          completedAt: new Date().toISOString(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (!isSuccess) return;
        if (paymentType !== "DB" || !folioId || !fRef || !folioSnap) return;
        if (!folioSnap.exists) return;
        const folio = folioSnap.data()!;
        if (folio.status !== "open") return;

        const payment = {
          id: `pmt_${Date.now()}_plankton`,
          method: "card",
          amount,
          reference: planktonPaymentId,
          processedBy: "system:plankton-sync",
          processedAt: new Date().toISOString(),
        };

        const newTotalPayments = addCents(
          folio.totalPayments as number,
          amount,
        );
        const newBalance = subtractCents(
          folio.totalCharges as number,
          newTotalPayments,
        );
        const newFolioStatus = newBalance <= 0 ? "settled" : "open";

        tx.update(fRef, {
          payments: FieldValue.arrayUnion(payment),
          totalPayments: newTotalPayments,
          balance: Math.max(0, newBalance),
          status: newFolioStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // On settle: promote every held room in the group to "reserved" and
        // clear the hold on each reservation. Loop over all sites (group
        // booking) or the single site (legacy solo booking).
        if (newFolioStatus === "settled") {
          for (const pf of resPrefetch) {
            if (!pf.resSnap.exists) continue;
            if (
              pf.roomRef &&
              pf.roomSnap?.exists &&
              pf.roomSnap.data()?.status === "held"
            ) {
              tx.update(pf.roomRef, {
                status: "reserved",
                holdExpiresAt: null,
                currentReservationId: pf.resSnap.id,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
            tx.update(pf.resRef, {
              holdExpiresAt: null,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
        didApply = true;
      });

      // Fire the confirmation email OUTSIDE the transaction, only when this
      // invocation actually applied the payment. Non-blocking: email failure
      // must not fail the settlement. Aidan's spec: "run our normal order
      // settlement / fulfilment: mark the order paid, record the paymentId,
      // and complete the booking (send confirmation, release the
      // reservation, etc.)."
      if (didApply && isSuccess) {
        sendConfirmationEmailForIntent(tenantId, propertyId, intent).catch(
          (err) => {
            console.error("[sync] Confirmation email failed", err);
          },
        );
      }

      await writeAuditLog({
        action: isSuccess
          ? "payment.intent.succeeded"
          : newStatus === PaymentIntentStatus.REFUNDED ||
              newStatus === PaymentIntentStatus.PARTIALLY_REFUNDED
            ? "payment.intent.refunded"
            : "payment.intent.failed",
        resource: "paymentIntent",
        resourceId: resolvedPaymentIntentId,
        userId: request.auth.uid,
        userEmail: request.auth.token.email ?? "",
        tenantId,
        propertyId,
        details: {
          planktonStatus: planktonRes.status,
          planktonFailureReason: planktonRes.failureReason ?? null,
          planktonFailureMessage: planktonRes.failureMessage ?? null,
        },
      }).catch(() => {});

      return {
        paymentIntentId: resolvedPaymentIntentId,
        status: newStatus,
        planktonStatus: planktonRes.status,
        terminal: true,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      wrapError(err);
    }
  },
);

/**
 * Load reservation + guest + property + room type for a settled intent and
 * send the booking-confirmation email. Best-effort; errors are logged but
 * do not fail the sync call.
 *
 * Group bookings: sends ONE email using the primary reservation's context,
 * with the site breakdown encoded into `specialRequests` (the SendGrid
 * template renders that field verbatim). Longer-term, the template should
 * grow a dedicated `groupSites` block, but that needs Aidan to update it.
 */
async function sendConfirmationEmailForIntent(
  tenantId: string,
  propertyId: string,
  intent: FirebaseFirestore.DocumentData,
): Promise<void> {
  const primaryReservationId = intent.reservationId as string | null;
  const folioId = intent.folioId as string | null;
  if (!primaryReservationId) return;

  // If this is a group booking, load the folio to find all sibling reservations.
  let reservationIdsToLoad: string[] = [primaryReservationId];
  if (folioId) {
    try {
      const folioSnap = await folioRef(tenantId, propertyId, folioId).get();
      const folioReservationIds =
        (folioSnap.data()?.reservationIds as string[] | undefined) ?? null;
      if (folioReservationIds && folioReservationIds.length > 1) {
        reservationIdsToLoad = folioReservationIds;
      }
    } catch (folioErr) {
      console.warn("[sync] Could not load folio for email; falling back to primary", folioErr);
    }
  }

  const resSnaps = await Promise.all(
    reservationIdsToLoad.map((id) => reservationRef(tenantId, propertyId, id).get()),
  );
  type LoadedRes = { id: string } & Record<string, unknown>;
  const reservations: LoadedRes[] = resSnaps
    .filter((s) => s.exists)
    .map((s) => ({ id: s.id, ...(s.data() as FirebaseFirestore.DocumentData) }) as LoadedRes);
  if (reservations.length === 0) return;

  // Primary = the one the intent points to (fall back to first if missing).
  const primary =
    reservations.find((r) => r.id === primaryReservationId) ?? reservations[0]!;

  const guestId = primary.guestId as string | null;
  const roomTypeId = primary.roomTypeId as string | null;
  if (!guestId || !roomTypeId) return;

  // Collect distinct room type ids across the group (usually just one but
  // don't assume — mixed groups are allowed by the schema).
  const roomTypeIds = Array.from(
    new Set(reservations.map((r) => r.roomTypeId as string).filter(Boolean)),
  );

  const [guestSnap, propSnap, rtSnaps] = await Promise.all([
    guestRef(tenantId, guestId).get(),
    propertyRef(tenantId, propertyId).get(),
    Promise.all(roomTypeIds.map((id) => roomTypeRef(tenantId, id).get())),
  ]);
  const guest = guestSnap.data();
  const prop = propSnap.data();
  const roomTypeById = new Map<string, string>();
  for (const s of rtSnaps) {
    if (s.exists) roomTypeById.set(s.id, (s.data()!.name as string) ?? "Room");
  }
  const to = guest?.email as string | undefined;
  if (!to) {
    console.log("[sync] No guest email — skipping confirmation");
    return;
  }

  const isGroup = reservations.length > 1;
  const totalAcrossGroup = reservations.reduce(
    (sum, r) => sum + ((r.totalRoomCharges as number) ?? 0),
    0,
  );
  const totalAdults = reservations.reduce(
    (sum, r) => sum + ((r.adults as number) ?? 0),
    0,
  );
  const totalChildren = reservations.reduce(
    (sum, r) => sum + ((r.children as number) ?? 0),
    0,
  );

  // Compose the roomTypeName + specialRequests for group bookings so the
  // existing template renders the group breakdown without needing template
  // changes.
  let roomTypeNameOut: string;
  let specialRequestsOut: string | null;
  if (isGroup) {
    roomTypeNameOut = `${reservations.length}-site group booking`;
    const lines = reservations.map((r, i) => {
      const rtName = roomTypeById.get(r.roomTypeId as string) ?? "Room";
      const a = (r.adults as number) ?? 0;
      const c = (r.children as number) ?? 0;
      const guestsStr = `${a} adult${a !== 1 ? "s" : ""}${c > 0 ? `, ${c} child${c !== 1 ? "ren" : ""}` : ""}`;
      const refShort = (r.id as string).slice(0, 8).toUpperCase();
      return `Site ${i + 1}: ${rtName} — ${guestsStr} — Ref #${refShort} — ${formatCents((r.totalRoomCharges as number) ?? 0)}`;
    });
    const existing = (primary.specialRequests as string | null) ?? null;
    specialRequestsOut = `Group booking — ${reservations.length} sites\n${lines.join("\n")}${existing ? `\n\nSpecial requests: ${existing}` : ""}`;
  } else {
    roomTypeNameOut =
      roomTypeById.get(primary.roomTypeId as string) ?? "Room";
    specialRequestsOut = (primary.specialRequests as string | null) ?? null;
  }

  await sendBookingConfirmation({
    to,
    guestName:
      `${guest?.firstName ?? ""} ${guest?.lastName ?? ""}`.trim() || "Guest",
    propertyName: (prop?.name as string) ?? "Our Lodge",
    propertyEmail: (prop?.email as string) ?? undefined,
    propertyPhone: (prop?.phone as string) ?? undefined,
    // Absolute URL — email clients fetch this from off-server, so relative
    // paths can't resolve. The property doc stores an absolute URL.
    propertyLogoUrl: (prop?.logoUrl as string | undefined) ?? undefined,
    roomTypeName: roomTypeNameOut,
    roomName: null,
    checkInDate: primary.checkInDate as string,
    checkOutDate: primary.checkOutDate as string,
    nightCount: primary.nightCount as number,
    adults: isGroup ? totalAdults : (primary.adults as number),
    children: isGroup ? totalChildren : ((primary.children as number | undefined) ?? 0),
    totalAmount: formatCents(isGroup ? totalAcrossGroup : (primary.totalRoomCharges as number)),
    ratePerNight: isGroup ? undefined : formatCents(primary.roomRate as number),
    reservationId: primary.id,
    specialRequests: specialRequestsOut,
    checkInTime: (prop?.checkInTime as string) ?? "14:00",
    checkOutTime: (prop?.checkOutTime as string) ?? "11:00",
  });
}
