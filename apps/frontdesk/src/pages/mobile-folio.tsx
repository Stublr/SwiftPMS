import { useEffect, useState } from "react";

import {
  ChargeCategory,
  PaymentMethod,
  formatCents,
  type Folio,
  type Reservation,
} from "@swiftpms/shared";

import {
  addCharge,
  getFolioByReservation,
  processPayment,
} from "@/services/billing";
import {
  checkInReservation,
  checkOutReservation,
  getReservation,
} from "@/services/reservations";
import { useUIStore } from "@/stores/ui.store";

function readResId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("res");
}

export function MobileFolioPage() {
  const navigate = useUIStore((s) => s.navigate);
  const [resId, setResId] = useState<string | null>(null);
  const [folio, setFolio] = useState<Folio | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "charge" | "payment">("none");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Form state
  const [chargeCategory, setChargeCategory] = useState<string>(ChargeCategory.OTHER);
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [payMethod, setPayMethod] = useState<string>(PaymentMethod.CASH);
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");

  useEffect(() => {
    const id = readResId();
    setResId(id);
    if (id) load(id);
    else {
      setError("No booking selected. Tap a booking from Today, or use Scan/Walk-in, to open its folio.");
      setLoading(false);
    }
  }, []);

  async function load(id: string) {
    setLoading(true);
    setError(null);
    try {
      const [f, r] = await Promise.all([
        getFolioByReservation(id),
        getReservation(id),
      ]);
      setFolio(f);
      setReservation(r);
      if (f) setPayAmount((f.balance / 100).toFixed(2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleAddCharge(e: React.FormEvent) {
    e.preventDefault();
    if (!folio) return;
    const parsed = parseFloat(chargeAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid charge amount (e.g. 150.00).");
      return;
    }
    const cents = Math.round(parsed * 100);
    setBusy(true);
    setError(null);
    try {
      await addCharge({
        folioId: folio.id,
        category: chargeCategory as ChargeCategory,
        description: chargeDescription || chargeCategory,
        amount: cents,
        quantity: 1,
      });
      setChargeDescription("");
      setChargeAmount("");
      setMode("none");
      if (resId) await load(resId);
      showToast("Charge added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add charge failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleProcessPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!folio) return;
    const parsed = parseFloat(payAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid payment amount (e.g. 250.00).");
      return;
    }
    const cents = Math.round(parsed * 100);
    setBusy(true);
    setError(null);
    try {
      await processPayment({
        folioId: folio.id,
        method: payMethod as PaymentMethod,
        amount: cents,
        reference: payRef || undefined,
      });
      setMode("none");
      setPayRef("");
      setPayAmount("");
      if (resId) await load(resId);
      showToast(`Payment of ${formatCents(cents)} recorded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckIn() {
    if (!resId) return;
    setBusy(true);
    setError(null);
    try {
      await checkInReservation(resId);
      await load(resId);
      showToast("Guest checked in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckOut() {
    if (!resId) return;
    setBusy(true);
    setError(null);
    try {
      await checkOutReservation(resId);
      await load(resId);
      showToast("Guest checked out.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-out failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !folio) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-sm text-destructive">{error ?? "We couldn't find the folio for this booking."}</p>
        <button
          onClick={() => navigate("/today")}
          className="mt-4 rounded-md border border-border px-4 py-2 text-sm"
        >
          Back to Today
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-4 pb-24">
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full bg-success px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
      <button
        onClick={() => navigate("/today")}
        className="mb-3 text-sm text-muted-foreground"
      >
        ← Back
      </button>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        <div className="text-xs uppercase text-muted-foreground">Folio</div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          Reservation: {folio.reservationId.slice(0, 8).toUpperCase()}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded bg-secondary p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground">Charges</div>
            <div className="text-sm font-bold">{formatCents(folio.totalCharges)}</div>
          </div>
          <div className="rounded bg-secondary p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground">Paid</div>
            <div className="text-sm font-bold text-success">{formatCents(folio.totalPayments)}</div>
          </div>
          <div className="rounded bg-secondary p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground">Balance</div>
            <div className={`text-sm font-bold ${folio.balance > 0 ? "text-destructive" : "text-success"}`}>
              {formatCents(folio.balance)}
            </div>
          </div>
        </div>
        <div className="mt-2 text-right">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
            {folio.status}
          </span>
        </div>
      </div>

      {/* Charges */}
      <details open className="mt-4 rounded-lg border border-border bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Charges ({folio.charges.length})
        </summary>
        <div className="space-y-1 px-4 pb-3">
          {folio.charges.length === 0 ? (
            <p className="text-xs text-muted-foreground">None yet.</p>
          ) : (
            folio.charges.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span>{c.description}</span>
                <span className="font-medium">{formatCents(c.total)}</span>
              </div>
            ))
          )}
        </div>
      </details>

      {/* Payments */}
      <details className="mt-2 rounded-lg border border-border bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Payments ({folio.payments.length})
        </summary>
        <div className="space-y-1 px-4 pb-3">
          {folio.payments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No payments recorded.</p>
          ) : (
            folio.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="capitalize">{p.method.replace("_", " ")}</span>
                <span className="font-medium text-success">{formatCents(p.amount)}</span>
              </div>
            ))
          )}
        </div>
      </details>

      {/* Action buttons */}
      {folio.status === "open" && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode("charge")}
            className="rounded-lg border border-border bg-white px-3 py-3 text-sm font-medium"
          >
            + Add charge
          </button>
          <button
            onClick={() => setMode("payment")}
            disabled={folio.balance <= 0}
            className="rounded-lg bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            + Record payment
          </button>
        </div>
      )}

      {/* Check-in / Check-out shortcuts. Buttons only show when the reservation
          is in the right state — Check-in only when confirmed, Check-out only
          when currently checked_in. Prevents the "click once, nothing happens,
          click again, error" bug from stale UI. */}
      <div className="mt-3">
        {reservation?.status === "confirmed" && (
          <button
            onClick={handleCheckIn}
            disabled={busy}
            className="w-full rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 text-sm font-semibold text-primary disabled:opacity-50"
          >
            {busy ? "Checking in…" : "Check in guest"}
          </button>
        )}
        {reservation?.status === "checked_in" && (
          <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-3 text-center text-sm font-medium text-success">
            ✓ Guest is checked in
          </div>
        )}
        {reservation?.status === "checked_out" && (
          <div className="rounded-lg border border-border bg-secondary px-3 py-3 text-center text-sm text-muted-foreground">
            Guest has checked out
          </div>
        )}
        {reservation?.status === "cancelled" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-center text-sm text-destructive">
            Reservation cancelled
          </div>
        )}
        {reservation?.status === "checked_in" && folio.status === "open" && (
          <button
            onClick={async () => {
              if (folio.balance > 0) {
                const ok = window.confirm(
                  `Folio still has an outstanding balance of ${formatCents(folio.balance)}. Check out anyway? Record the payment first if you'd rather settle now.`,
                );
                if (!ok) return;
              }
              await handleCheckOut();
            }}
            disabled={busy}
            className={`mt-2 w-full rounded-lg px-3 py-3 text-sm font-semibold disabled:opacity-50 ${
              folio.balance === 0
                ? "bg-success text-white"
                : "border border-amber-300 bg-amber-50 text-amber-900"
            }`}
          >
            {folio.balance === 0
              ? "Check out"
              : `Check out (R${(folio.balance / 100).toFixed(2)} outstanding)`}
          </button>
        )}
      </div>

      {/* Charge modal */}
      {mode === "charge" && (
        <form onSubmit={handleAddCharge} className="mt-4 space-y-3 rounded-lg border border-border bg-white p-4">
          <h3 className="text-sm font-semibold">Add charge</h3>
          <select
            value={chargeCategory}
            onChange={(e) => setChargeCategory(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {Object.values(ChargeCategory).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Description"
            value={chargeDescription}
            onChange={(e) => setChargeDescription(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Amount (R)"
            value={chargeAmount}
            onChange={(e) => setChargeAmount(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            required
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "Adding…" : "Add"}
            </button>
            <button type="button" onClick={() => setMode("none")} className="flex-1 rounded-md border border-border px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Payment modal */}
      {mode === "payment" && (
        <form onSubmit={handleProcessPayment} className="mt-4 space-y-3 rounded-lg border border-border bg-white p-4">
          <h3 className="text-sm font-semibold">Record payment</h3>
          <select
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {Object.values(PaymentMethod).map((m) => (
              <option key={m} value={m}>{m.replace("_", " ")}</option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="Amount (R)"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            required
          />
          <input
            type="text"
            placeholder="Reference (optional)"
            value={payRef}
            onChange={(e) => setPayRef(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "Saving…" : `Pay ${payAmount ? formatCents(Math.round(parseFloat(payAmount) * 100)) : ""}`}
            </button>
            <button type="button" onClick={() => setMode("none")} className="flex-1 rounded-md border border-border px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
