import { useEffect, useState } from "react";
import { formatCents, type RoomType } from "@swiftpms/shared";

import { createLegacyReservation } from "@/services/legacy-booking";
import { getRoomTypes } from "@/services/rooms";
import { useUIStore } from "@/stores/ui.store";

/**
 * Legacy booking capture. Guest walks up with a paper invoice from an
 * old system (St Lucia SA, Ezemvelo KZN Wildlife, etc.); staff types it
 * in here so the reservation is in SwiftPMS for check-in and folio
 * balancing purposes.
 *
 * The invoice's total goes in verbatim — we do NOT compute a rate from
 * our tiered pricing (guest paid the old operator's rate). Any amount
 * already paid on the legacy system becomes a payment on the new folio
 * with method "eft/cash/card/other" as staff selected + a
 * `legacy: true` marker so the cash-up excludes it (that money hit the
 * previous operator's till, not ours).
 */

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

function parseRandsToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/[, ]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const COMMON_SOURCES = [
  "St Lucia SA",
  "Ezemvelo KZN Wildlife",
  "Other",
];

export function LegacyBookingPage() {
  const navigate = useUIStore((s) => s.navigate);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [pensioners, setPensioners] = useState(0);
  const [children, setChildren] = useState(0);

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomTypeId, setRoomTypeId] = useState<string>("");

  const [totalRands, setTotalRands] = useState("");
  const [amountPaidRands, setAmountPaidRands] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "eft" | "other"
  >("eft");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentDate, setPaymentDate] = useState("");

  const [externalSource, setExternalSource] = useState<string>("St Lucia SA");
  const [customSource, setCustomSource] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    reservationId: string;
    folioId: string;
    balance: number;
  } | null>(null);

  useEffect(() => {
    getRoomTypes()
      .then((types) => {
        const active = types.filter((t) => t.isActive);
        setRoomTypes(active);
        if (active[0] && !roomTypeId) setRoomTypeId(active[0].id);
      })
      .catch(() => setError("Failed to load room types."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCents = parseRandsToCents(totalRands);
  const paidCents = parseRandsToCents(amountPaidRands) ?? 0;
  const balanceCents =
    totalCents != null ? Math.max(0, totalCents - paidCents) : null;

  const nightCount = (() => {
    if (!checkIn || !checkOut) return 0;
    const d = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return Math.max(0, Math.round(d / 86400000));
  })();

  function validate(): string | null {
    if (!firstName.trim() || !lastName.trim())
      return "Enter the guest's first and last name.";
    if (!checkIn || !checkOut) return "Enter arrival and departure dates.";
    if (new Date(checkOut) <= new Date(checkIn))
      return "Departure must be after arrival.";
    if (!roomTypeId) return "Select a campsite type.";
    if (totalCents == null || totalCents <= 0)
      return "Enter the invoice total (Rands).";
    if (paidCents > totalCents)
      return "Amount already paid can't exceed the invoice total.";
    const src =
      externalSource === "Other" ? customSource.trim() : externalSource.trim();
    if (!src) return "Enter the source system.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const source =
        externalSource === "Other" ? customSource.trim() : externalSource;
      const res = await createLegacyReservation({
        guestFirstName: firstName.trim(),
        guestLastName: lastName.trim(),
        guestEmail: email.trim() || undefined,
        guestPhone: phone.trim() || undefined,
        roomTypeId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults,
        children,
        pensioners,
        totalRoomChargesCents: totalCents!,
        amountAlreadyPaidCents: paidCents,
        paymentMethodOriginal: paidCents > 0 ? paymentMethod : undefined,
        paymentReference: paymentReference.trim() || undefined,
        paymentDateOriginal: paymentDate.trim() || undefined,
        externalSource: source,
        externalReference: externalReference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setSuccess({
        reservationId: res.id,
        folioId: res.folioId,
        balance: res.balance,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <svg
            className="h-9 w-9 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Legacy booking imported</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {firstName} {lastName} · {checkIn} → {checkOut}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Reservation:{" "}
          <span className="font-mono">
            {success.reservationId.slice(0, 8).toUpperCase()}
          </span>
        </p>
        <p className="mt-4 text-sm">
          Outstanding balance:{" "}
          <span
            className={`font-bold ${success.balance === 0 ? "text-success" : "text-warning"}`}
          >
            {formatCents(success.balance)}
          </span>
          {success.balance === 0 && " · Fully paid"}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() =>
              navigate(`/folio?res=${success.reservationId}`)
            }
            className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Open folio
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setFirstName("");
              setLastName("");
              setPhone("");
              setEmail("");
              setCheckIn("");
              setCheckOut("");
              setAdults(2);
              setPensioners(0);
              setChildren(0);
              setTotalRands("");
              setAmountPaidRands("");
              setPaymentReference("");
              setPaymentDate("");
              setExternalReference("");
              setNotes("");
            }}
            className="rounded-lg border border-border px-4 py-3 text-sm hover:bg-secondary"
          >
            Import another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-bold">Import legacy booking</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Capture a reservation made on the previous operator's system. Totals
        come from the invoice — not our pricing.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {/* Guest details */}
        <SectionLabel>Guest</SectionLabel>
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <Field label="First name *">
            <Input value={firstName} onChange={setFirstName} autoFocus />
          </Field>
          <Field label="Last name *">
            <Input value={lastName} onChange={setLastName} />
          </Field>
        </div>
        <Field label="Phone">
          <Input value={phone} onChange={setPhone} type="tel" placeholder="082 123 4567" />
        </Field>
        <Field label="Email">
          <Input value={email} onChange={setEmail} type="email" placeholder="optional" />
        </Field>

        {/* Stay */}
        <SectionLabel className="border-t border-border pt-4">Stay</SectionLabel>
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <Field label="Arrival *">
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
            />
          </Field>
          <Field label="Departure *">
            <input
              type="date"
              value={checkOut}
              min={
                checkIn
                  ? new Date(new Date(checkIn).getTime() + 86_400_000)
                      .toISOString()
                      .split("T")[0]
                  : todayIso()
              }
              onChange={(e) => setCheckOut(e.target.value)}
              className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
            />
          </Field>
          <Field label="Adults *">
            <select
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
              className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pensioners (ID)">
            <select
              value={pensioners}
              onChange={(e) => setPensioners(Number(e.target.value))}
              className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Children">
            <select
              value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
              className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Campsite type *">
          <select
            value={roomTypeId}
            onChange={(e) => setRoomTypeId(e.target.value)}
            className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
          >
            {roomTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        {/* Source */}
        <SectionLabel className="border-t border-border pt-4">
          Source system
        </SectionLabel>
        <Field label="Booked via *">
          <select
            value={externalSource}
            onChange={(e) => setExternalSource(e.target.value)}
            className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
          >
            {COMMON_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {externalSource === "Other" && (
          <Field label="Source name *">
            <Input
              value={customSource}
              onChange={setCustomSource}
              placeholder="e.g. Booking.com"
            />
          </Field>
        )}
        <Field label="Original reference #">
          <Input
            value={externalReference}
            onChange={setExternalReference}
            placeholder="e.g. 634201 or Ezemvelo #632772"
          />
        </Field>

        {/* Money */}
        <SectionLabel className="border-t border-border pt-4">
          Amounts
        </SectionLabel>
        <Field label="Invoice total (Rands) *">
          <Input
            value={totalRands}
            onChange={setTotalRands}
            type="text"
            inputMode="decimal"
            placeholder="2280.00"
          />
        </Field>
        <Field label="Amount already paid (Rands)">
          <Input
            value={amountPaidRands}
            onChange={setAmountPaidRands}
            type="text"
            inputMode="decimal"
            placeholder="0.00 if nothing paid yet"
          />
        </Field>
        {paidCents > 0 && (
          <>
            <Field label="Original payment method">
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as "cash" | "card" | "eft" | "other",
                  )
                }
                className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
              >
                <option value="eft">EFT / bank transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Payment reference">
              <Input
                value={paymentReference}
                onChange={setPaymentReference}
                placeholder="Invoice or POP ref"
              />
            </Field>
            <Field label="Original payment date">
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
              />
            </Field>
          </>
        )}
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
            placeholder="e.g. Additional 1 person — R450 cash on arrival"
          />
        </Field>

        {/* Summary */}
        {totalCents != null && (
          <div className="rounded-lg border border-border bg-secondary/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {nightCount || 0} night{nightCount !== 1 ? "s" : ""} · {adults}{" "}
                adult{adults !== 1 ? "s" : ""}
                {children > 0
                  ? `, ${children} kid${children !== 1 ? "s" : ""}`
                  : ""}
              </span>
              <span className="font-medium">{formatCents(totalCents)}</span>
            </div>
            {paidCents > 0 && (
              <div className="mt-1 flex justify-between text-success">
                <span>Paid on {externalSource === "Other" ? customSource : externalSource}</span>
                <span>−{formatCents(paidCents)}</span>
              </div>
            )}
            {balanceCents != null && (
              <div
                className={`mt-2 flex justify-between border-t border-border pt-2 font-bold ${
                  balanceCents === 0 ? "text-success" : "text-warning"
                }`}
              >
                <span>{balanceCents === 0 ? "Fully paid" : "Balance on arrival"}</span>
                <span>{formatCents(balanceCents)}</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "Importing…" : "Import booking"}
        </button>
      </form>
    </div>
  );
}

/* --- tiny UI helpers --- */

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-sm font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </h2>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  inputMode?: "decimal" | "numeric" | "text" | "tel" | "email";
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
    />
  );
}
