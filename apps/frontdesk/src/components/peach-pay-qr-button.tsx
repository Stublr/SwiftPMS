import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import {
  PaymentIntentStatus,
  formatCents,
  type PaymentIntent,
} from "@swiftpms/shared";

import {
  initiatePeachCheckout,
  syncPaymentStatus,
  watchPaymentIntent,
} from "@/services/payment";
import { usePropertyStore } from "@/stores/property.store";

/**
 * Show a scannable QR that opens the Peach hosted checkout URL on the
 * guest's own phone — no signup, no app install, no card terminal.
 *
 * Flow:
 *   1. Staff hits the button → we call initiatePeachCheckout, get a
 *      redirectUrl for the Peach hosted checkout page.
 *   2. Fullscreen modal renders that URL as a QR + shows the amount.
 *   3. Guest scans with their phone camera (built-in on iOS/Android
 *      since 2018) → phone browser opens the Peach page → guest enters
 *      card details on Peach's PCI-compliant page → pays.
 *   4. Staff device polls syncPaymentStatus in the background. On
 *      SUCCEEDED, we close the modal and fire onSuccess (folio refresh
 *      etc). Same polling pattern PeachPayButton uses.
 *
 * The staff device never handles card data — only shows the QR + waits.
 * Peach is the merchant of record; the emailed confirmation from
 * SendGrid is the receipt (legally valid VAT invoice under SA law).
 */

type Purpose =
  | "folio_settlement"
  | "card_on_arrival_preauth"
  | "guest_booking";

interface Props {
  label: string;
  amountCents: number;
  purpose: Purpose;
  paymentType: "DB" | "PA";
  reservationId?: string;
  folioId?: string;
  className?: string;
  disabled?: boolean;
  onSuccess?: (intent: PaymentIntent) => void;
  onFailure?: (intent: PaymentIntent | null, message: string) => void;
}

export function PeachPayQrButton({
  label,
  amountCents,
  purpose,
  paymentType,
  reservationId,
  folioId,
  className,
  disabled,
  onSuccess,
  onFailure,
}: Props) {
  const tenantId = usePropertyStore((s) => s.tenantId);
  const propertyId = usePropertyStore((s) => s.propertyId);

  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terminalOutcome, setTerminalOutcome] = useState<
    "succeeded" | "failed" | null
  >(null);

  const unsubRef = useRef<(() => void) | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  // intentRef mirrors the Firestore listener's latest snapshot without racing
  // React state updates — the poll callback reads from here.
  const intentRef = useRef<PaymentIntent | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    return () => {
      unsubRef.current?.();
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
    };
  }, []);

  function cleanup() {
    unsubRef.current?.();
    unsubRef.current = null;
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function closeModal() {
    cleanup();
    setModalOpen(false);
    setQrDataUri(null);
    setRedirectUrl(null);
    setIntent(null);
    intentRef.current = null;
    setError(null);
    setTerminalOutcome(null);
    doneRef.current = false;
  }

  async function handleClick() {
    if (!tenantId || !propertyId) {
      setError("Property not selected");
      return;
    }
    if (amountCents <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    const propId: string = propertyId;
    const tenId: string = tenantId;

    setError(null);
    setSubmitting(true);
    doneRef.current = false;

    try {
      // Fixed prod domain (not window.location.origin): Peach validates the
      // return domain against the merchant allowlist, and localhost/dev
      // origins aren't on it. The QR flow completes via status polling, so
      // the shopper landing on the prod frontdesk is fine even in dev.
      const shopperResultUrl = "https://pms.algafusion.com/?payment_return=1";
      const result = await initiatePeachCheckout({
        purpose,
        amount: amountCents,
        propertyId: propId,
        reservationId,
        folioId,
        paymentType,
        shopperResultUrl,
      });

      // Encode the redirect URL as a QR at 512px source — renders sharp on
      // any staff device screen. Q level correction (25% recoverability)
      // handles glare/dirty screens without failing the scan.
      const dataUri = await QRCode.toDataURL(result.redirectUrl, {
        errorCorrectionLevel: "Q",
        margin: 2,
        width: 512,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      setQrDataUri(dataUri);
      setRedirectUrl(result.redirectUrl);
      setModalOpen(true);

      // Firestore listener — instant local updates when syncPaymentStatus
      // flips the intent doc.
      unsubRef.current = watchPaymentIntent(
        tenId,
        propId,
        result.paymentIntentId,
        (updated) => {
          intentRef.current = updated;
          setIntent(updated);
          if (!updated || doneRef.current) return;
          const terminal =
            updated.status === PaymentIntentStatus.SUCCEEDED ||
            updated.status === PaymentIntentStatus.FAILED ||
            updated.status === PaymentIntentStatus.CANCELLED ||
            updated.status === PaymentIntentStatus.EXPIRED;
          if (terminal) finish(updated);
        },
      );

      // Authoritative poll — Plankton is the system of record; the listener
      // only reflects Firestore updates after a poll flips the doc. Force
      // a Plankton sync every ~3 polls in case the checkout-result webhook
      // was slow.
      let forceSyncCount = 0;
      async function poll() {
        if (doneRef.current) return;
        try {
          const forceSync = forceSyncCount >= 3;
          const r = await syncPaymentStatus({
            propertyId: propId,
            paymentIntentId: result.paymentIntentId,
            forceSync,
          });
          if (forceSync) forceSyncCount = 0;
          else forceSyncCount += 1;
          if (doneRef.current) return;
          if (r.terminal) {
            // Prefer the listener's fully-populated intent — if it hasn't
            // arrived yet, wait ~500ms and poll again.
            if (intentRef.current) return;
            pollTimerRef.current = window.setTimeout(poll, 500);
            return;
          }
          pollTimerRef.current = window.setTimeout(poll, 3000);
        } catch {
          if (!doneRef.current) pollTimerRef.current = window.setTimeout(poll, 4000);
        }
      }
      poll();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't start payment: ${err.message}`
          : "Couldn't start payment.",
      );
      onFailure?.(null, err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  function finish(updated: PaymentIntent) {
    if (doneRef.current) return;
    doneRef.current = true;
    cleanup();
    if (updated.status === PaymentIntentStatus.SUCCEEDED) {
      setTerminalOutcome("succeeded");
      onSuccess?.(updated);
      // Auto-close after a beat so staff sees the green tick.
      window.setTimeout(() => closeModal(), 3000);
    } else {
      setTerminalOutcome("failed");
      onFailure?.(
        updated,
        updated.peachResultDescription ||
          `Payment ${updated.status.toLowerCase()}`,
      );
      // Failed / cancelled — keep modal up so staff can try again or dismiss.
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={submitting || disabled}
        className={
          className ??
          "w-full rounded-lg border border-primary bg-primary/5 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
        }
      >
        {submitting ? "Generating QR…" : label}
      </button>

      {error && !modalOpen && (
        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-border px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    Scan to pay
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Amount:{" "}
                    <span className="font-semibold text-foreground">
                      {formatCents(amountCents)}
                    </span>
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  aria-label="Close"
                  className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {terminalOutcome === "succeeded" ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                    <svg
                      className="h-9 w-9 text-success"
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
                  <h3 className="text-lg font-bold text-foreground">
                    Payment received
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatCents(amountCents)} settled to the folio.
                  </p>
                </div>
              ) : terminalOutcome === "failed" ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
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
                  <h3 className="text-lg font-bold text-foreground">
                    Payment didn't complete
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {intent?.peachResultDescription ||
                      `Status: ${intent?.status ?? "failed"}`}
                  </p>
                  <button
                    onClick={closeModal}
                    className="mt-4 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  {qrDataUri && (
                    <div className="mx-auto flex flex-col items-center">
                      <img
                        src={qrDataUri}
                        alt="Payment QR code"
                        className="h-64 w-64 rounded-lg border border-border bg-white p-2"
                      />
                    </div>
                  )}
                  <ol className="mt-6 space-y-1.5 text-sm text-muted-foreground">
                    <li>
                      <span className="font-semibold text-foreground">1.</span>{" "}
                      Guest opens their phone camera and points it at this
                      QR code
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">2.</span>{" "}
                      Tap the link that appears — enters card details on
                      Peach's secure page
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">3.</span>{" "}
                      This screen updates automatically once payment is
                      confirmed
                    </li>
                  </ol>
                  <div className="mt-5 flex items-center justify-center gap-2 rounded-md bg-secondary py-2 text-xs text-muted-foreground">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-primary" />
                    Waiting for guest to complete payment…
                  </div>
                  {redirectUrl && (
                    <details className="mt-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        Can't scan? Copy link
                      </summary>
                      <div className="mt-2 break-all rounded-md border border-border bg-secondary/50 p-2 font-mono text-[10px]">
                        {redirectUrl}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
