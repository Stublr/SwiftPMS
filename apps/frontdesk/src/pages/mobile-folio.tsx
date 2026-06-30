import { useEffect, useState } from "react";

import {
  ChargeCategory,
  PaymentMethod,
  formatCents,
  type Folio,
} from "@swiftpms/shared";

import {
  addCharge,
  getFolioByReservation,
  processPayment,
} from "@/services/billing";
import { checkInReservation, checkOutReservation } from "@/services/reservations";
import { useUIStore } from "@/stores/ui.store";

function readResId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("res");
}

export function MobileFolioPage() {
  const navigate = useUIStore((s) => s.navigate);
  const [resId, setResId] = useState<string | null>(null);
  const [folio, setFolio] = useState<Folio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "charge" | "payment">("none");
  const [busy, setBusy] = useState(false);

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
      setError("No reservation specified");
      setLoading(false);
    }
  }, []);

  async function load(id: string) {
    setLoading(true);
    setError(null);
    try {
      const f = await getFolioByReservation(id);
      setFolio(f);
      if (f) setPayAmount((f.balance / 100).toFixed(2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCharge(e: React.FormEvent) {
    e.preventDefault();
    if (!folio) return;
    const cents = Math.round(parseFloat(chargeAmount) * 100);
    if (!cents || cents <= 0) return;
    setBusy(true);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add charge failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleProcessPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!folio) return;
    const cents = Math.round(parseFloat(payAmount) * 100);
    if (!cents || cents <= 0) return;
    setBusy(true);
    try {
      await processPayment({
        folioId: folio.id,
        method: payMethod as PaymentMethod,
        amount: cents,
        reference: payRef || undefined,
      });
      setMode("none");
      setPayRef("");
      if (resId) await load(resId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckIn() {
    if (!resId) return;
    setBusy(true);
    try {
      await checkInReservation(resId);
      await load(resId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckOut() {
    if (!resId) return;
    setBusy(true);
    try {
      await checkOutReservation(resId);
      await load(resId);
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
        <p className="text-sm text-destructive">{error ?? "Folio not found"}</p>
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

      {/* Check-in / Check-out shortcuts */}
      <div className="mt-3">
        <button
          onClick={handleCheckIn}
          disabled={busy}
          className="w-full rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 text-sm font-semibold text-primary disabled:opacity-50"
        >
          Check in guest
        </button>
        {folio.balance === 0 && folio.status === "open" && (
          <button
            onClick={handleCheckOut}
            disabled={busy}
            className="mt-2 w-full rounded-lg bg-success px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Check out
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
