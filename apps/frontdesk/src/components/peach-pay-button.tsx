import { useEffect, useRef, useState } from "react";

import {
  PaymentIntentStatus,
  formatCents,
  type PaymentIntent,
} from "@swiftpms/shared";

import {
  initiatePeachCheckout,
  watchPaymentIntent,
} from "@/services/payment";
import { usePropertyStore } from "@/stores/property.store";

type Purpose =
  | "folio_settlement"
  | "card_on_arrival_preauth";

interface PeachPayButtonProps {
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

export function PeachPayButton({
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
}: PeachPayButtonProps) {
  const tenantId = usePropertyStore((s) => s.tenantId);
  const propertyId = usePropertyStore((s) => s.propertyId);

  const [submitting, setSubmitting] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const popupRef = useRef<Window | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      unsubRef.current?.();
      if (popupRef.current && !popupRef.current.closed) {
        try {
          popupRef.current.close();
        } catch {
          // ignore — cross-origin close throws after redirect
        }
      }
    };
  }, []);

  async function handleClick() {
    if (!tenantId || !propertyId) {
      setError("Property not selected");
      return;
    }
    if (amountCents <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const shopperResultUrl = `${window.location.origin}/?payment_return=1`;
      const result = await initiatePeachCheckout({
        purpose,
        amount: amountCents,
        propertyId,
        reservationId,
        folioId,
        paymentType,
        shopperResultUrl,
      });

      // Open Peach in a popup so the staff workflow continues uninterrupted.
      const w = window.open(
        result.redirectUrl,
        "swiftpms-peach-pay",
        "width=520,height=720,resizable=yes,scrollbars=yes",
      );
      popupRef.current = w;

      // Subscribe to the PaymentIntent doc — Cloud Functions webhook updates it
      // when Peach pings back.
      setWaiting(true);
      unsubRef.current = watchPaymentIntent(
        tenantId,
        propertyId,
        result.paymentIntentId,
        (updated) => {
          setIntent(updated);
          if (!updated) return;
          const terminal =
            updated.status === PaymentIntentStatus.SUCCEEDED ||
            updated.status === PaymentIntentStatus.FAILED ||
            updated.status === PaymentIntentStatus.CANCELLED ||
            updated.status === PaymentIntentStatus.EXPIRED;
          if (!terminal) return;

          // Close popup if still open
          if (popupRef.current && !popupRef.current.closed) {
            try {
              popupRef.current.close();
            } catch {
              // ignore
            }
          }
          setWaiting(false);
          unsubRef.current?.();
          unsubRef.current = null;

          if (updated.status === PaymentIntentStatus.SUCCEEDED) {
            onSuccess?.(updated);
          } else {
            onFailure?.(
              updated,
              updated.peachResultDescription ||
                `Payment ${updated.status}`,
            );
          }
        },
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start payment",
      );
      onFailure?.(null, err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  const showStatus = waiting && intent?.status === PaymentIntentStatus.REDIRECTED;
  const buttonText = submitting
    ? "Starting…"
    : showStatus
      ? "Waiting for Peach…"
      : `${label} (${formatCents(amountCents)})`;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || submitting || waiting || !tenantId || !propertyId}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
          />
        </svg>
        {buttonText}
      </button>
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
      {waiting && !error && (
        <p className="mt-1 text-xs text-muted-foreground">
          A Peach payment window has opened. Complete the payment there —
          this view will update automatically.
        </p>
      )}
    </div>
  );
}
