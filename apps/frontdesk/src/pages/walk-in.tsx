import { useEffect, useState } from "react";

import {
  resolveStayPricing,
  formatCents,
  type RoomType,
} from "@swiftpms/shared";

import { createGuest } from "@/services/guests";
import { createReservation } from "@/services/reservations";
import { processPayment } from "@/services/billing";
import { PaymentMethod } from "@swiftpms/shared";
import { getRoomTypes } from "@/services/rooms";
import { useUIStore } from "@/stores/ui.store";
import { PeachPayQrButton } from "@/components/peach-pay-qr-button";

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

function tomorrowIso(): string {
  return new Date(Date.now() + 86_400_000).toISOString().split("T")[0]!;
}

export function WalkInPage() {
  const navigate = useUIStore((s) => s.navigate);

  // Guest details
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Stay
  const [checkIn, setCheckIn] = useState(todayIso());
  const [checkOut, setCheckOut] = useState(tomorrowIso());
  const [adults, setAdults] = useState(2);
  const [pensioners, setPensioners] = useState(0);
  const [children, setChildren] = useState(0);

  // Inventory
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomTypeId, setRoomTypeId] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    reservationId: string;
    folioId: string;
  } | null>(null);

  // Speedpoint (manual card terminal) capture on the success screen.
  const [speedpointOpen, setSpeedpointOpen] = useState(false);
  const [speedpointRef, setSpeedpointRef] = useState("");
  const [speedpointSaving, setSpeedpointSaving] = useState(false);
  const [speedpointError, setSpeedpointError] = useState<string | null>(null);

  async function handleSpeedpointPayment() {
    if (!success) return;
    setSpeedpointSaving(true);
    setSpeedpointError(null);
    try {
      await processPayment({
        folioId: success.folioId,
        method: PaymentMethod.SPEEDPOINT,
        amount: totalCharge,
        reference: speedpointRef.trim() || undefined,
      });
      navigate(`/folio?res=${success.reservationId}`);
    } catch {
      setSpeedpointError("Failed to record the speedpoint payment.");
      setSpeedpointSaving(false);
    }
  }

  useEffect(() => {
    getRoomTypes()
      .then((types) => {
        const active = types.filter((t) => t.isActive);
        setRoomTypes(active);
        if (active.length > 0 && !roomTypeId) setRoomTypeId(active[0]!.id);
      })
      .catch(() => setError("Failed to load campsite types"));
  }, []);

  const selectedType = roomTypes.find((t) => t.id === roomTypeId);
  const nights = (() => {
    const ms =
      new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return Math.max(1, Math.round(ms / 86_400_000));
  })();

  const totalCharge = selectedType
    ? resolveStayPricing(
        selectedType,
        checkIn,
        checkOut,
        adults,
        children,
        pensioners,
      ).total
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !roomTypeId) {
      setError("First and last name + campsite type are required");
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      setError("Check-out must be after check-in");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const guest = await createGuest({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
      });
      const reservation = await createReservation({
        guestId: guest.id,
        roomTypeId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults,
        children,
        pensioners,
      });
      setSuccess({ reservationId: reservation.id, folioId: reservation.folioId });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Booking failed",
      );
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Walk-in booked</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {firstName} {lastName} · {checkIn} → {checkOut} · {nights} night
          {nights !== 1 ? "s" : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Reservation: <span className="font-mono">{success.reservationId.slice(0, 8).toUpperCase()}</span>
        </p>
        <p className="mt-4 text-base font-semibold">
          Charge: {formatCents(totalCharge)}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {/* Payment method choice: online (guest scans a QR, pays on the
              Peach hosted checkout) or speedpoint (staff captures the card
              on the physical terminal and records it here). */}
          <PeachPayQrButton
            label={`Online Card Payment (QR) — ${formatCents(totalCharge)}`}
            amountCents={totalCharge}
            purpose="folio_settlement"
            paymentType="DB"
            reservationId={success.reservationId}
            folioId={success.folioId}
            className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            onSuccess={() =>
              navigate(`/folio?res=${success.reservationId}`)
            }
          />
          {!speedpointOpen ? (
            <button
              onClick={() => setSpeedpointOpen(true)}
              className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              Speedpoint Payment — {formatCents(totalCharge)}
            </button>
          ) : (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-left">
              <p className="text-sm font-semibold">Speedpoint payment</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Process {formatCents(totalCharge)} on the card terminal first,
                then record it here.
              </p>
              <input
                type="text"
                value={speedpointRef}
                onChange={(e) => setSpeedpointRef(e.target.value)}
                placeholder="Terminal receipt / approval no. (optional)"
                className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm"
              />
              {speedpointError && (
                <p className="mt-2 text-xs text-destructive">{speedpointError}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleSpeedpointPayment}
                  disabled={speedpointSaving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {speedpointSaving
                    ? "Recording…"
                    : `Record ${formatCents(totalCharge)} paid`}
                </button>
                <button
                  onClick={() => {
                    setSpeedpointOpen(false);
                    setSpeedpointError(null);
                  }}
                  disabled={speedpointSaving}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <button
            onClick={() => navigate(`/folio?res=${success.reservationId}`)}
            className="rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-secondary"
          >
            Open folio instead
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setSpeedpointOpen(false);
              setSpeedpointRef("");
              setSpeedpointError(null);
              setFirstName("");
              setLastName("");
              setPhone("");
              setEmail("");
              setAdults(2);
              setPensioners(0);
              setChildren(0);
            }}
            className="rounded-lg border border-border px-4 py-3 text-sm font-semibold hover:bg-secondary"
          >
            Another walk-in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-bold">Walk-in booking</h1>
      <p className="text-sm text-muted-foreground">
        Capture the guest and create a reservation on the spot.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <LabelledInput
            label="First name *"
            value={firstName}
            onChange={setFirstName}
            autoFocus
          />
          <LabelledInput label="Last name *" value={lastName} onChange={setLastName} />
        </div>
        <LabelledInput
          label="Phone"
          value={phone}
          onChange={setPhone}
          type="tel"
          placeholder="082 123 4567"
        />
        <LabelledInput
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          placeholder="optional — for emailed confirmation"
        />

        <div className="border-t border-border pt-4">
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">
            Stay
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium">Check-in</label>
              <input
                type="date"
                value={checkIn}
                min={todayIso()}
                onChange={(e) => setCheckIn(e.target.value)}
                className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Check-out</label>
              <input
                type="date"
                value={checkOut}
                min={checkIn ? new Date(new Date(checkIn).getTime() + 86_400_000).toISOString().split("T")[0] : todayIso()}
                onChange={(e) => setCheckOut(e.target.value)}
                className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Adults</label>
              <select
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
                className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">
                Pensioners <span className="text-muted-foreground">(ID required)</span>
              </label>
              <select
                value={pensioners}
                onChange={(e) => setPensioners(Number(e.target.value))}
                className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">Children (under 12)</label>
              <select
                value={children}
                onChange={(e) => setChildren(Number(e.target.value))}
                className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium">Campsite type</label>
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
        </div>

        {selectedType && (
          <div className="rounded-lg border border-border bg-secondary p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {nights} night{nights !== 1 ? "s" : ""} · {adults} adult{adults !== 1 ? "s" : ""}
                {pensioners > 0
                  ? `, ${pensioners} pensioner${pensioners !== 1 ? "s" : ""}`
                  : ""}
                {children > 0 ? `, ${children} kid${children !== 1 ? "s" : ""}` : ""}
              </span>
              <span className="text-base font-bold">{formatCents(totalCharge)}</span>
            </div>
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
          {submitting ? "Booking…" : `Book + open folio`}
        </button>
      </form>
    </div>
  );
}

function LabelledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-medium">{label}</label>
      {/* text-base (16px) prevents iOS Safari auto-zoom on input focus. */}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
      />
    </div>
  );
}
