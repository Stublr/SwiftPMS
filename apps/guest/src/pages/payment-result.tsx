import { useEffect, useState } from "react";

import { PaymentIntentStatus, type PaymentIntent } from "@swiftpms/shared";

import { useBookingStore } from "@/stores/booking.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { useUIStore } from "@/stores/ui.store";
import {
  syncPaymentStatus,
  watchPaymentIntent,
} from "@/services/payment";

const PENDING_KEY = "swiftpms.pendingPayment";

interface PendingRef {
  paymentIntentId: string;
  tenantId: string;
  propertyId: string;
}

export function readPendingFromStorage(): PendingRef | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingRef;
  } catch {
    return null;
  }
}

export function writePendingToStorage(ref: PendingRef) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(ref));
}

export function clearPendingFromStorage() {
  localStorage.removeItem(PENDING_KEY);
}

export function PaymentResultPage() {
  const navigate = useUIStore((s) => s.navigate);
  const setPendingPayment = useBookingStore((s) => s.setPendingPayment);
  const result = useBookingStore((s) => s.result);
  const tenantId = useGuestAuthStore((s) => s.tenantId);

  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [missing, setMissing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const ref = readPendingFromStorage();
    if (!ref) {
      setMissing(true);
      return;
    }
    // Prefer tenantId from token if available (more trustworthy).
    const tid = tenantId ?? ref.tenantId;
    let cancelled = false;
    let pollTimer: number | null = null;
    let forceSyncCount = 0;

    // Firestore listener for fast local updates once sync flips the doc.
    const unsub = watchPaymentIntent(
      tid,
      ref.propertyId,
      ref.paymentIntentId,
      (updated) => {
        if (cancelled) return;
        setIntent(updated);
        if (updated?.status === PaymentIntentStatus.SUCCEEDED) {
          clearPendingFromStorage();
          setPendingPayment(null);
          setTimeout(() => navigate("/confirmation"), 1200);
        }
      },
    );

    // Authoritative poll against the Plankton platform via our callable.
    // Plankton is the system-of-record; this is what actually flips status.
    async function poll() {
      if (cancelled) return;
      try {
        // After a few normal polls, send forceSync to nudge the gateway in
        // case the webhook-to-platform was missed.
        const forceSync = forceSyncCount >= 3;
        const res = await syncPaymentStatus({
          propertyId: ref!.propertyId,
          paymentIntentId: ref!.paymentIntentId,
          forceSync,
        });
        if (forceSync) forceSyncCount = 0;
        else forceSyncCount += 1;

        if (cancelled) return;
        if (res.terminal) {
          if (res.status === PaymentIntentStatus.SUCCEEDED) {
            clearPendingFromStorage();
            setPendingPayment(null);
            setTimeout(() => navigate("/confirmation"), 1200);
          }
          return;
        }
        pollTimer = window.setTimeout(poll, 3000);
      } catch {
        // Transient — retry in a few seconds
        if (!cancelled) pollTimer = window.setTimeout(poll, 4000);
      }
    }
    poll();

    // Show a "still waiting" hint after 90s
    const t = window.setTimeout(() => setTimedOut(true), 90_000);

    return () => {
      cancelled = true;
      unsub();
      if (pollTimer) window.clearTimeout(pollTimer);
      window.clearTimeout(t);
    };
  }, [tenantId, navigate, setPendingPayment]);

  if (missing) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="mb-3 font-display text-2xl font-semibold text-foreground">
          No payment in progress
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          We couldn't find a pending payment for this session.
        </p>
        <button
          onClick={() => navigate("/")}
          className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const status = intent?.status;
  const isTerminalFail =
    status === PaymentIntentStatus.FAILED ||
    status === PaymentIntentStatus.CANCELLED ||
    status === PaymentIntentStatus.EXPIRED;

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      {!status || status === PaymentIntentStatus.REDIRECTED ? (
        <>
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          <h1 className="mb-3 font-display text-2xl font-semibold text-foreground">
            Confirming your payment…
          </h1>
          <p className="text-sm text-muted-foreground">
            Don't close this window — we're hearing back from the payment
            provider.
          </p>
          {timedOut && (
            <p className="mt-6 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              Still waiting after a minute and a half. Your card may already be
              charged. We've recorded the transaction; refresh in a moment or
              contact support if it doesn't update.
            </p>
          )}
        </>
      ) : status === PaymentIntentStatus.SUCCEEDED ? (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-leaf-soft">
            <svg
              className="h-9 w-9 text-leaf"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 className="mb-2 font-display text-2xl font-semibold text-foreground">
            Payment successful
          </h1>
          <p className="text-sm text-muted-foreground">
            Taking you to your booking confirmation…
          </p>
        </>
      ) : isTerminalFail ? (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <svg
              className="h-9 w-9 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="mb-3 font-display text-2xl font-semibold text-foreground">
            Payment {status === PaymentIntentStatus.CANCELLED ? "cancelled" : "failed"}
          </h1>
          <p className="mb-2 text-sm text-muted-foreground">
            {intent?.peachResultDescription ||
              "We couldn't complete the payment. Your room hold will be released shortly."}
          </p>
          {result?.reservationId && (
            <p className="mb-6 text-xs text-muted-foreground">
              Reference: {result.reservationId}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => {
                clearPendingFromStorage();
                setPendingPayment(null);
                navigate("/rooms");
              }}
              className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card"
            >
              Try a different room
            </button>
            <button
              onClick={() => {
                clearPendingFromStorage();
                setPendingPayment(null);
                navigate("/");
              }}
              className="rounded-xl border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Back to Home
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
