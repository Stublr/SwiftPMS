import { formatCents } from "@swiftpms/shared";
import { useEffect, useState } from "react";

import {
  closeShift,
  getLiveShiftTotals,
  getOpenShift,
  getRecentShifts,
  openShift,
  type LiveShiftTotals,
  type Shift,
} from "@/services/cashup";
import { useAuthStore } from "@/stores/auth.store";

type Mode = "idle" | "openingForm" | "closingForm";

function parseRandsToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/[, ]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function methodLabel(m: string): string {
  return (
    {
      cash: "Cash",
      card: "Card",
      card_on_arrival: "Card on arrival",
      eft: "EFT",
      other: "Other",
    }[m] ?? m.replace("_", " ")
  );
}

function dtFormat(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-ZA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CashupPage() {
  const user = useAuthStore((s) => s.user);
  const [openShiftState, setOpenShiftState] = useState<Shift | null>(null);
  const [recent, setRecent] = useState<Shift[]>([]);
  const [live, setLive] = useState<LiveShiftTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form state
  const [openingFloatRands, setOpeningFloatRands] = useState("0");
  const [cashCountedRands, setCashCountedRands] = useState("");
  const [notes, setNotes] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [open, history] = await Promise.all([getOpenShift(), getRecentShifts(15)]);
      setOpenShiftState(open);
      setRecent(history);
      if (open) {
        setLive(await getLiveShiftTotals(open.openedAt));
      } else {
        setLive(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cash-up state");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // Refresh the running total every 30s while a shift is open so the
    // preview stays close to real-time without hammering Firestore.
    const timer = window.setInterval(async () => {
      const open = await getOpenShift().catch(() => null);
      if (open) {
        setOpenShiftState(open);
        setLive(await getLiveShiftTotals(open.openedAt).catch(() => null));
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleOpen() {
    setBusy(true);
    setError(null);
    try {
      const cents = parseRandsToCents(openingFloatRands) ?? 0;
      await openShift(cents);
      setMode("idle");
      setOpeningFloatRands("0");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open shift");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!openShiftState) return;
    const cents = parseRandsToCents(cashCountedRands);
    if (cents == null) {
      setError("Enter a valid cash amount (e.g. 4500.00).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await closeShift(openShiftState.id, cents, notes.trim() || undefined);
      setMode("idle");
      setCashCountedRands("");
      setNotes("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close shift");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">Cash-up</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Open a shift when you start, close it when you hand over. Card
        payments settle automatically — cash is what you count against.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : openShiftState ? (
        <OpenShiftCard
          shift={openShiftState}
          live={live}
          onCloseClick={() => setMode("closingForm")}
        />
      ) : mode === "openingForm" ? (
        <OpenForm
          openingFloatRands={openingFloatRands}
          setOpeningFloatRands={setOpeningFloatRands}
          onOpen={handleOpen}
          onCancel={() => setMode("idle")}
          busy={busy}
        />
      ) : (
        <div className="mt-6 rounded-xl border border-border bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            No shift is currently open{user ? ` for ${user.fullName}` : ""}.
          </p>
          <button
            onClick={() => setMode("openingForm")}
            className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Open new shift
          </button>
        </div>
      )}

      {openShiftState && mode === "closingForm" && (
        <CloseForm
          shift={openShiftState}
          live={live}
          cashCountedRands={cashCountedRands}
          setCashCountedRands={setCashCountedRands}
          notes={notes}
          setNotes={setNotes}
          onClose={handleClose}
          onCancel={() => setMode("idle")}
          busy={busy}
        />
      )}

      {/* History */}
      <h2 className="mt-10 text-lg font-semibold">Recent shifts</h2>
      {recent.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No cash-ups yet. Your closed shifts will appear here.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">Opened</th>
                <th className="px-4 py-2 font-medium">Closed</th>
                <th className="px-4 py-2 font-medium">Staff</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Cash var.</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recent.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 text-xs">{dtFormat(s.openedAt)}</td>
                  <td className="px-4 py-2 text-xs">
                    {s.closedAt ? dtFormat(s.closedAt) : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {s.status === "closed" ? s.closedByName : s.openedByName}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {s.totalPayments != null ? formatCents(s.totalPayments) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {s.cashDiscrepancy != null ? (
                      <span
                        className={
                          s.cashDiscrepancy === 0
                            ? "text-success"
                            : Math.abs(s.cashDiscrepancy) < 1000
                              ? "text-warning"
                              : "text-destructive"
                        }
                      >
                        {s.cashDiscrepancy >= 0 ? "+" : ""}
                        {formatCents(s.cashDiscrepancy)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                        s.status === "open"
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OpenShiftCard({
  shift,
  live,
  onCloseClick,
}: {
  shift: Shift;
  live: LiveShiftTotals | null;
  onCloseClick: () => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-primary">
            Shift open
          </div>
          <p className="mt-1 text-sm text-foreground">
            <span className="font-semibold">{shift.openedByName}</span> opened{" "}
            <span className="text-muted-foreground">{dtFormat(shift.openedAt)}</span>
          </p>
          {shift.openingFloat > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Opening float: {formatCents(shift.openingFloat)}
            </p>
          )}
        </div>
        <button
          onClick={onCloseClick}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Close shift
        </button>
      </div>

      <div className="mt-4 border-t border-primary/20 pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Running total {live && `· ${live.paymentCount} payment${live.paymentCount !== 1 ? "s" : ""}`}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {live && Object.entries(live.expectedByMethod).length === 0 ? (
            <div className="col-span-full text-sm text-muted-foreground">
              No payments taken yet in this shift.
            </div>
          ) : (
            live &&
            Object.entries(live.expectedByMethod).map(([method, amount]) => (
              <div key={method} className="rounded-md bg-white p-3">
                <div className="text-[10px] uppercase text-muted-foreground">
                  {methodLabel(method)}
                </div>
                <div className="mt-0.5 text-sm font-bold">{formatCents(amount)}</div>
              </div>
            ))
          )}
        </div>
        {live && live.totalPayments > 0 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total taken</span>
            <span className="font-bold">{formatCents(live.totalPayments)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function OpenForm({
  openingFloatRands,
  setOpeningFloatRands,
  onOpen,
  onCancel,
  busy,
}: {
  openingFloatRands: string;
  setOpeningFloatRands: (v: string) => void;
  onOpen: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Open new shift</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        How much cash is in the drawer to start?
      </p>
      <div className="mt-4">
        <label className="block text-xs font-medium">Opening float (Rands)</label>
        <input
          type="text"
          inputMode="decimal"
          value={openingFloatRands}
          onChange={(e) => setOpeningFloatRands(e.target.value)}
          className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
          placeholder="0.00"
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onOpen}
          disabled={busy}
          className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Opening…" : "Open shift"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-border px-4 py-2.5 text-sm hover:bg-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CloseForm({
  shift,
  live,
  cashCountedRands,
  setCashCountedRands,
  notes,
  setNotes,
  onClose,
  onCancel,
  busy,
}: {
  shift: Shift;
  live: LiveShiftTotals | null;
  cashCountedRands: string;
  setCashCountedRands: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onClose: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const expectedCashPayments = live?.expectedByMethod.cash ?? 0;
  const expectedCashInDrawer = shift.openingFloat + expectedCashPayments;
  const counted = parseRandsToCents(cashCountedRands);
  const discrepancy =
    counted != null ? counted - expectedCashInDrawer : null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Close shift</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Count physical cash in the drawer. Card and EFT amounts settle
        automatically — no counting needed.
      </p>

      <div className="mt-4 rounded-md bg-secondary/50 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Opening float</span>
          <span>{formatCents(shift.openingFloat)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted-foreground">Cash payments taken</span>
          <span>{formatCents(expectedCashPayments)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
          <span>Expected in drawer</span>
          <span>{formatCents(expectedCashInDrawer)}</span>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium">Physical cash counted (Rands)</label>
        <input
          type="text"
          inputMode="decimal"
          value={cashCountedRands}
          onChange={(e) => setCashCountedRands(e.target.value)}
          className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
          placeholder="0.00"
          autoFocus
        />
        {discrepancy != null && counted != null && (
          <p
            className={`mt-2 text-sm font-medium ${
              discrepancy === 0
                ? "text-success"
                : Math.abs(discrepancy) < 1000
                  ? "text-warning"
                  : "text-destructive"
            }`}
          >
            {discrepancy === 0
              ? "✓ Balances exactly"
              : discrepancy > 0
                ? `+${formatCents(discrepancy)} over expected`
                : `${formatCents(discrepancy)} short`}
          </p>
        )}
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 block w-full min-w-0 rounded-md border border-border px-3 py-2 text-base"
          placeholder="Any discrepancies, incidents, or handover notes"
        />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onClose}
          disabled={busy || counted == null}
          className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Closing…" : "Close shift"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-border px-4 py-2.5 text-sm hover:bg-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
