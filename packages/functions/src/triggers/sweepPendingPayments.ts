import { FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

import {
  PaymentIntentStatus,
  addCents,
  formatCents,
  subtractCents,
} from "@swiftpms/shared";

import {
  PLANKTON_API_KEY,
  getPlanktonPayment,
  isAuthorized,
  isCaptured,
  isTerminalFailure,
  type PlanktonStatus,
} from "../billing/planktonPaymentsClient.js";
import {
  db,
  folioRef,
  guestRef,
  propertyRef,
  reservationRef,
  roomRef,
  roomTypeRef,
} from "../lib/firestore.js";
import { sendBookingConfirmation, SENDGRID_API_KEY } from "../lib/email.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * Safety-net for the QR / redirect payment flow.
 *
 * Payment settlements normally happen when the client polls `syncPaymentStatus`
 * from the browser. But the customer or staff can close the QR modal / browser
 * tab before payment completes, in which case no client is polling and the
 * folio would sit unpaid even though the guest actually paid.
 *
 * This scheduled function runs every 2 minutes and does the poll from the
 * server side:
 *   1. Query every PaymentIntent whose status is still REDIRECTED and was
 *      initiated more than 60s ago (fresh ones let the client's poll cycle
 *      handle it — no double-work).
 *   2. Ask Plankton for the authoritative status.
 *   3. If Plankton says the payment landed (captured), apply the same
 *      settlement transaction syncPaymentStatus uses — folio updated, rooms
 *      promoted, confirmation email sent. Idempotent by intent.status.
 *
 * Consequence: even if staff closes the tab or the guest's phone dies mid-flow,
 * the payment gets applied on the next sweep. No manual "record payment"
 * step needed — shortages avoided.
 */

// Only touch intents that have been in flight for at least this long. Younger
// intents are still in the client's fast-poll window; running the sweeper
// there would race with the browser poll and produce redundant Plankton calls.
// Reduced from 60s to 15s (2026-07-03) so guest-facing reconciliation lag drops
// below 30s on average.
const MIN_INTENT_AGE_MS = 15 * 1000;

/**
 * Give up on an intent after this many consecutive failed sweep attempts.
 * Guards against a permanently-broken planktonPaymentId being polled forever
 * (deleted on Plankton side, auth revoked, etc.) — after cap, we flip the
 * intent to FAILED with a needs-manual-review marker so cashiers see it in
 * the UI and can chase the missing money.
 */
const MAX_SWEEP_ATTEMPTS = 20;

/** Sleep helper for the internal second pass. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  return PaymentIntentStatus.REDIRECTED;
}

async function sendConfirmationEmail(
  tenantId: string,
  propertyId: string,
  intentData: FirebaseFirestore.DocumentData,
): Promise<void> {
  const primaryId = intentData.reservationId as string | null;
  const folioId = intentData.folioId as string | null;
  if (!primaryId) return;

  // Group booking: use folio.reservationIds to include all sites.
  let idsToLoad: string[] = [primaryId];
  if (folioId) {
    try {
      const folioSnap = await folioRef(tenantId, propertyId, folioId).get();
      const rIds = (folioSnap.data()?.reservationIds as string[] | undefined) ?? null;
      if (rIds && rIds.length > 1) idsToLoad = rIds;
    } catch {
      // fall through
    }
  }

  const resSnaps = await Promise.all(
    idsToLoad.map((id) => reservationRef(tenantId, propertyId, id).get()),
  );
  type LoadedRes = { id: string } & Record<string, unknown>;
  const reservations: LoadedRes[] = resSnaps
    .filter((s) => s.exists)
    .map((s) => ({ id: s.id, ...(s.data() as FirebaseFirestore.DocumentData) }) as LoadedRes);
  if (reservations.length === 0) return;

  const primary = reservations.find((r) => r.id === primaryId) ?? reservations[0]!;
  const guestId = primary.guestId as string | null;
  const roomTypeId = primary.roomTypeId as string | null;
  if (!guestId || !roomTypeId) return;

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
  const roomTypeByIdMap = new Map<string, string>();
  for (const s of rtSnaps) {
    if (s.exists) roomTypeByIdMap.set(s.id, (s.data()!.name as string) ?? "Room");
  }
  const to = guest?.email as string | undefined;
  if (!to) return;

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

  let roomTypeNameOut: string;
  let specialRequestsOut: string | null;
  if (isGroup) {
    roomTypeNameOut = `${reservations.length}-site group booking`;
    const lines = reservations.map((r, i) => {
      const rtName = roomTypeByIdMap.get(r.roomTypeId as string) ?? "Room";
      const a = (r.adults as number) ?? 0;
      const c = (r.children as number) ?? 0;
      const guestsStr = `${a} adult${a !== 1 ? "s" : ""}${c > 0 ? `, ${c} child${c !== 1 ? "ren" : ""}` : ""}`;
      const refShort = (r.id as string).slice(0, 8).toUpperCase();
      return `Site ${i + 1}: ${rtName} — ${guestsStr} — Ref #${refShort} — ${formatCents((r.totalRoomCharges as number) ?? 0)}`;
    });
    const existing = (primary.specialRequests as string | null) ?? null;
    specialRequestsOut = `Group booking — ${reservations.length} sites\n${lines.join("\n")}${existing ? `\n\nSpecial requests: ${existing}` : ""}`;
  } else {
    roomTypeNameOut = roomTypeByIdMap.get(primary.roomTypeId as string) ?? "Room";
    specialRequestsOut = (primary.specialRequests as string | null) ?? null;
  }

  await sendBookingConfirmation({
    to,
    guestName:
      `${guest?.firstName ?? ""} ${guest?.lastName ?? ""}`.trim() || "Guest",
    propertyName: (prop?.name as string) ?? "Our Lodge",
    propertyEmail: (prop?.email as string) ?? undefined,
    propertyPhone: (prop?.phone as string) ?? undefined,
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

async function settleOneIntent(
  intentDocRef: FirebaseFirestore.DocumentReference,
  intent: FirebaseFirestore.DocumentData,
): Promise<{ applied: boolean; newStatus: PaymentIntentStatus }> {
  const tenantId = intent.tenantId as string;
  const propertyId = intent.propertyId as string;
  const planktonPaymentId = intent.planktonPaymentId as string | null;
  if (!planktonPaymentId) {
    return { applied: false, newStatus: PaymentIntentStatus.REDIRECTED };
  }

  // Ask Plankton for the authoritative status.
  const planktonRes = await getPlanktonPayment(planktonPaymentId);
  const captureMode: "automatic" | "manual" =
    (intent.paymentType as string) === "PA" ? "manual" : "automatic";
  const newStatus = mapStatus(planktonRes.status, captureMode);

  if (newStatus === PaymentIntentStatus.REDIRECTED) {
    // Still in flight — nothing to do.
    return { applied: false, newStatus };
  }

  const isSuccess = newStatus === PaymentIntentStatus.SUCCEEDED;
  let didApply = false;

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(intentDocRef);
    if (!fresh.exists) return;
    const freshIntent = fresh.data()!;
    const TERMINAL: PaymentIntentStatus[] = [
      PaymentIntentStatus.SUCCEEDED,
      PaymentIntentStatus.FAILED,
      PaymentIntentStatus.CANCELLED,
      PaymentIntentStatus.EXPIRED,
      PaymentIntentStatus.REFUNDED,
      PaymentIntentStatus.PARTIALLY_REFUNDED,
    ];
    if (TERMINAL.includes(freshIntent.status as PaymentIntentStatus)) return;

    const folioId = freshIntent.folioId as string | null;
    const legacyReservationId = freshIntent.reservationId as string | null;
    const paymentType = freshIntent.paymentType as string;
    const amount = freshIntent.amount as number;

    let folioSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    let fRef: FirebaseFirestore.DocumentReference | null = null;
    const resPrefetch: {
      resRef: FirebaseFirestore.DocumentReference;
      resSnap: FirebaseFirestore.DocumentSnapshot;
      roomRef: FirebaseFirestore.DocumentReference | null;
      roomSnap: FirebaseFirestore.DocumentSnapshot | null;
    }[] = [];

    if (isSuccess && paymentType === "DB" && folioId) {
      fRef = folioRef(tenantId, propertyId, folioId);
      folioSnap = await tx.get(fRef);
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

    // Writes below.
    tx.update(intentDocRef, {
      status: newStatus,
      planktonStatus: planktonRes.status,
      planktonFailureReason: planktonRes.failureReason ?? null,
      planktonFailureMessage: planktonRes.failureMessage ?? null,
      completedAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
      settledBy: "system:sweep",
    });

    if (!isSuccess) return;
    if (paymentType !== "DB" || !folioId || !fRef || !folioSnap) return;
    if (!folioSnap.exists) return;
    const folio = folioSnap.data()!;
    if (folio.status !== "open") return;

    // Money-safety gate: only apply the payment if AT LEAST ONE of the
    // linked reservations is still confirmed / checked_in / checked_out.
    // If all siblings are cancelled or the folio has NO reservations
    // linked (shouldn't happen), we don't apply — the intent is still
    // marked SUCCEEDED above (audit visible) but the folio stays open.
    // Cashiers see the intent in Payment Attempts with "Captured" and
    // can process a refund via Peach.
    const hasActiveReservation = resPrefetch.some((pf) => {
      if (!pf.resSnap.exists) return false;
      const s = pf.resSnap.data()!.status as string;
      return s === "confirmed" || s === "checked_in" || s === "checked_out";
    });
    if (!hasActiveReservation) {
      // Flag the intent so cashiers know why the payment didn't hit the folio.
      tx.update(intentDocRef, {
        needsRefund: true,
        needsRefundReason:
          "Peach captured but linked reservation was already cancelled",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const payment = {
      id: `pmt_${Date.now()}_sweep`,
      method: "card",
      amount,
      reference: planktonPaymentId,
      processedBy: "system:sweep",
      processedAt: new Date().toISOString(),
    };
    const newTotalPayments = addCents(folio.totalPayments as number, amount);
    const newBalance = subtractCents(folio.totalCharges as number, newTotalPayments);
    const newFolioStatus = newBalance <= 0 ? "settled" : "open";

    tx.update(fRef, {
      payments: FieldValue.arrayUnion(payment),
      totalPayments: newTotalPayments,
      balance: Math.max(0, newBalance),
      status: newFolioStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (newFolioStatus === "settled") {
      for (const pf of resPrefetch) {
        if (!pf.resSnap.exists) continue;
        if (pf.roomRef && pf.roomSnap?.exists && pf.roomSnap.data()?.status === "held") {
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

  if (didApply && isSuccess) {
    sendConfirmationEmail(tenantId, propertyId, intent).catch((err) => {
      console.error("[sweep] Confirmation email failed", err);
    });
  }

  writeAuditLog({
    action: isSuccess ? "payment.intent.succeeded" : "payment.intent.failed",
    resource: "paymentIntent",
    resourceId: intentDocRef.id,
    userId: "system:sweep",
    userEmail: "",
    tenantId,
    propertyId,
    details: {
      planktonStatus: planktonRes.status,
      source: "sweepPendingPayments",
      planktonFailureReason: planktonRes.failureReason ?? null,
      planktonFailureMessage: planktonRes.failureMessage ?? null,
    },
  }).catch(() => {});

  return { applied: didApply, newStatus };
}

/**
 * One sweep pass. Extracted so the scheduled entry point can run TWO passes
 * per minute (kick immediately + sleep 30s + kick again), giving effective
 * sub-30s reconciliation lag despite Cloud Scheduler's 1-minute minimum.
 */
async function runOneSweep(passLabel: string): Promise<void> {
  const cutoffIso = new Date(Date.now() - MIN_INTENT_AGE_MS).toISOString();
  const snap = await db
    .collectionGroup("paymentIntents")
    .where("status", "==", PaymentIntentStatus.REDIRECTED)
    .get();

  let checked = 0;
  let applied = 0;
  let skippedYoung = 0;
  let skippedMissingTs = 0;
  let abandoned = 0;

  for (const doc of snap.docs) {
    const intent = doc.data();
    const initiatedAt = intent.initiatedAt as string | undefined;
    // Missing initiatedAt was previously fall-through-processed, racing the
    // client's own poll on brand-new intents. Now: skip until the field
    // exists AND is older than the eligibility gate.
    if (!initiatedAt) {
      skippedMissingTs += 1;
      continue;
    }
    if (initiatedAt > cutoffIso) {
      skippedYoung += 1;
      continue;
    }

    // Bail out on intents that have failed to sync too many times — Plankton
    // may have lost / deleted this paymentId; keep polling forever wastes
    // budget and clutters logs. Flip to FAILED with a clear reason so it
    // shows up in the folio's Payment Attempts section for cashiers.
    const attempts = (intent.sweepAttempts as number | undefined) ?? 0;
    if (attempts >= MAX_SWEEP_ATTEMPTS) {
      try {
        await doc.ref.update({
          status: PaymentIntentStatus.FAILED,
          planktonFailureReason: "sweep_abandoned",
          planktonFailureMessage: `Plankton never confirmed after ${attempts} sweep attempts. Check the Plankton dashboard manually.`,
          completedAt: new Date().toISOString(),
          updatedAt: FieldValue.serverTimestamp(),
          settledBy: "system:sweep-abandon",
        });
      } catch (e) {
        console.error(`[sweep:${passLabel}] failed to mark abandoned intent ${doc.id}`, e);
      }
      abandoned += 1;
      continue;
    }

    checked += 1;
    try {
      const res = await settleOneIntent(doc.ref, intent);
      if (res.applied) applied += 1;
    } catch (err) {
      console.error(`[sweep:${passLabel}] settleOneIntent failed for ${doc.id}`, err);
      // Increment the failure counter so we eventually abandon a
      // permanently-broken intent instead of hammering Plankton forever.
      try {
        await doc.ref.update({
          sweepAttempts: FieldValue.increment(1),
          lastSweepError:
            err instanceof Error ? err.message.slice(0, 500) : "unknown error",
          lastSweepAt: new Date().toISOString(),
        });
      } catch {
        // ignore — best-effort counter bump
      }
    }
  }

  if (checked > 0 || applied > 0 || abandoned > 0 || skippedYoung > 0 || skippedMissingTs > 0) {
    console.log(
      `[sweep:${passLabel}] checked=${checked} applied=${applied} abandoned=${abandoned} skipped_young=${skippedYoung} skipped_no_ts=${skippedMissingTs}`,
    );
  }
}

export const sweepPendingPayments = onSchedule(
  {
    schedule: "every 1 minutes",
    // Give ourselves headroom for the two-pass sleep + Plankton calls.
    timeoutSeconds: 120,
    secrets: [PLANKTON_API_KEY, SENDGRID_API_KEY],
  },
  async () => {
    // Two passes per invocation, 30s apart. Cloud Scheduler's minimum
    // interval is 1 minute — combining that with an internal 30s delay
    // gives ~30s effective reconciliation lag: a payment landing 5s after
    // Pass A finishes is picked up 25s later by Pass B, well inside the
    // "guest walks from tent to reception" window.
    await runOneSweep("A");
    await sleep(30_000);
    await runOneSweep("B");
  },
);
