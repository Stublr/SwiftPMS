import {
  ReservationStatus,
  formatCents,
  ChargeCategory,
  PaymentMethod,
  type Reservation,
  type Guest,
  type RoomType,
  type Folio,
  type Room,
} from "@swiftpms/shared";
import { useEffect, useState } from "react";

import {
  getReservations,
  createReservation,
  checkInReservation,
  checkOutReservation,
  cancelReservation,
} from "@/services/reservations";
import { getAllGuests, createGuest } from "@/services/guests";
import { getRoomTypes, getRooms } from "@/services/rooms";
import { getFolioByReservation, addCharge, processPayment } from "@/services/billing";
import { PeachPayButton } from "@/components/peach-pay-button";

type Tab = "all" | "confirmed" | "checked_in" | "checked_out";

export function ReservationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [guestMap, setGuestMap] = useState<Map<string, Guest>>(new Map());
  const [roomTypeMap, setRoomTypeMap] = useState<Map<string, RoomType>>(new Map());
  const [roomMap, setRoomMap] = useState<Map<string, Room>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  useEffect(() => {
    loadReservations();
  }, [activeTab]);

  async function loadReservations() {
    setLoading(true);
    setError("");
    try {
      const [data, guests, roomTypes, rooms] = await Promise.all([
        getReservations(activeTab === "all" ? undefined : activeTab),
        getAllGuests(),
        getRoomTypes(),
        getRooms(),
      ]);
      setReservations(data);
      setGuestMap(new Map(guests.map((g) => [g.id, g])));
      setRoomTypeMap(new Map(roomTypes.map((rt) => [rt.id, rt])));
      setRoomMap(new Map(rooms.map((r) => [r.id, r])));
    } catch {
      setError("Failed to load reservations");
    } finally {
      setLoading(false);
    }
  }

  function extractErrorMessage(err: unknown): string {
    if (err && typeof err === "object" && "code" in err && "message" in err) {
      return (err as { message: string }).message;
    }
    if (err instanceof Error) return err.message;
    return "Unknown error";
  }

  async function handleCheckIn(reservationId: string) {
    try {
      setError("");
      await checkInReservation(reservationId);
      await loadReservations();
    } catch (err) {
      setError("Check-in failed: " + extractErrorMessage(err));
    }
  }

  async function handleCheckOut(reservationId: string) {
    try {
      setError("");
      await checkOutReservation(reservationId);
      await loadReservations();
    } catch (err) {
      setError("Check-out failed: " + extractErrorMessage(err));
    }
  }

  async function handleCancel(reservationId: string) {
    const reason = prompt("Cancel reason (optional):");
    if (reason === null) return;
    try {
      setError("");
      await cancelReservation(reservationId, reason || undefined);
      await loadReservations();
    } catch (err) {
      setError("Cancellation failed: " + extractErrorMessage(err));
    }
  }

  function guestName(guestId: string): string {
    const g = guestMap.get(guestId);
    return g ? `${g.firstName} ${g.lastName}` : guestId.slice(0, 8);
  }

  const filteredReservations = search
    ? reservations.filter((r) =>
        guestName(r.guestId).toLowerCase().includes(search.toLowerCase()) ||
        r.id.toLowerCase().includes(search.toLowerCase()),
      )
    : reservations;

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "confirmed", label: "Confirmed" },
    { key: "checked_in", label: "Checked In" },
    { key: "checked_out", label: "Checked Out" },
  ];

  if (showCreate) {
    return (
      <CreateReservationForm
        onSave={async () => {
          setShowCreate(false);
          await loadReservations();
        }}
        onCancel={() => setShowCreate(false)}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reservations</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          New Reservation
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="mt-4">
        <input
          type="text"
          placeholder="Search by guest name or reservation ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
        />
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Guest</th>
                <th className="px-4 py-3 font-medium">Room</th>
                <th className="px-4 py-3 font-medium">Check-in</th>
                <th className="px-4 py-3 font-medium">Check-out</th>
                <th className="px-4 py-3 font-medium">Nights</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No reservations found.
                  </td>
                </tr>
              ) : (
                filteredReservations.map((res) => (
                  <tr
                    key={res.id}
                    onClick={() => setSelectedReservation(res)}
                    className="cursor-pointer hover:bg-secondary/50"
                    title="Open billing"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{res.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-medium text-primary">
                      {guestName(res.guestId)}
                    </td>
                    <td className="px-4 py-3">
                      {res.roomId
                        ? (roomMap.get(res.roomId)?.roomNumber ?? res.roomId.slice(0, 8))
                        : (roomTypeMap.get(res.roomTypeId)?.name ?? "Unassigned")}
                    </td>
                    <td className="px-4 py-3">{res.checkInDate}</td>
                    <td className="px-4 py-3">{res.checkOutDate}</td>
                    <td className="px-4 py-3 text-center">{res.nightCount}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={res.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Actions column — every button stopPropagation so the
                          row's onClick (open billing) doesn't fire when the
                          cashier meant to check in/out or cancel. */}
                      <div className="flex justify-end gap-2">
                        {res.status === ReservationStatus.CONFIRMED && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCheckIn(res.id);
                            }}
                            className="rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success hover:bg-success/20"
                          >
                            Check In
                          </button>
                        )}
                        {res.status === ReservationStatus.CHECKED_IN && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCheckOut(res.id);
                            }}
                            className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                          >
                            Check Out
                          </button>
                        )}
                        {res.status === ReservationStatus.CONFIRMED && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(res.id);
                            }}
                            className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
                          >
                            Cancel
                          </button>
                        )}
                        {/* Chevron hint that row is clickable */}
                        <svg
                          className="h-4 w-4 self-center text-muted-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Folio Panel */}
      {selectedReservation && (
        <FolioPanel
          reservation={selectedReservation}
          guestName={guestName(selectedReservation.guestId)}
          onClose={() => setSelectedReservation(null)}
        />
      )}
    </div>
  );
}

// ─── Folio Panel ───────────────────────────────────────────────

function FolioPanel({
  reservation,
  guestName,
  onClose,
}: {
  reservation: Reservation;
  guestName: string;
  onClose: () => void;
}) {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    loadFolio();
  }, [reservation.id]);

  async function loadFolio() {
    setLoading(true);
    setError("");
    try {
      const f = await getFolioByReservation(reservation.id);
      setFolio(f);
    } catch {
      setError("Failed to load folio");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Billing — {guestName}</h2>
            <p className="text-xs text-muted-foreground">
              {reservation.checkInDate} to {reservation.checkOutDate} ({reservation.nightCount} nights)
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-secondary"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading folio...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !folio ? (
            <p className="text-sm text-muted-foreground">No folio found for this reservation.</p>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Charges</p>
                  <p className="mt-1 text-lg font-bold">{formatCents(folio.totalCharges)}</p>
                </div>
                <div className="rounded-md border border-border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="mt-1 text-lg font-bold text-success">{formatCents(folio.totalPayments)}</p>
                </div>
                <div className="rounded-md border border-border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className={`mt-1 text-lg font-bold ${folio.balance > 0 ? "text-destructive" : "text-success"}`}>
                    {formatCents(folio.balance)}
                  </p>
                </div>
              </div>

              <div className="mt-3 text-right">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  folio.status === "settled" ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                }`}>
                  {folio.status}
                </span>
              </div>

              {/* Charges */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Charges</h3>
                  {folio.status === "open" && (
                    <button
                      onClick={() => setShowAddCharge(true)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      + Add Charge
                    </button>
                  )}
                </div>
                {folio.charges.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">No charges yet.</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {folio.charges.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-xs">
                        <div>
                          <span className="font-medium">{c.description}</span>
                          <span className="ml-2 text-muted-foreground capitalize">({c.category})</span>
                          {c.quantity > 1 && <span className="ml-1 text-muted-foreground">x{c.quantity}</span>}
                        </div>
                        <span className="font-medium">{formatCents(c.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payments */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Payments</h3>
                  {folio.status === "open" && folio.balance > 0 && (
                    <button
                      onClick={() => setShowPayment(true)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      + Process Payment
                    </button>
                  )}
                </div>
                {folio.payments.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">No payments yet.</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {folio.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-md bg-success/5 px-3 py-2 text-xs">
                        <div>
                          <span className="font-medium capitalize">{p.method.replace("_", " ")}</span>
                          {p.reference && <span className="ml-2 text-muted-foreground">Ref: {p.reference}</span>}
                          <span className="ml-2 text-muted-foreground">
                            {new Date(p.processedAt).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </div>
                        <span className="font-medium text-success">{formatCents(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Charge Form */}
              {showAddCharge && (
                <AddChargeForm
                  folioId={folio.id}
                  onDone={() => {
                    setShowAddCharge(false);
                    loadFolio();
                  }}
                  onCancel={() => setShowAddCharge(false)}
                />
              )}

              {/* Process Payment Form */}
              {showPayment && (
                <PaymentForm
                  folioId={folio.id}
                  balance={folio.balance}
                  onDone={() => {
                    setShowPayment(false);
                    loadFolio();
                  }}
                  onCancel={() => setShowPayment(false)}
                />
              )}

              {/* Peach Payments — settle outstanding balance by card */}
              {folio.status === "open" && folio.balance > 0 && (
                <div className="mt-6 rounded-md border border-primary/30 bg-primary/5 p-4">
                  <h4 className="text-sm font-semibold">Take card payment</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opens Peach hosted checkout in a new window. This view
                    updates automatically when the payment completes.
                  </p>
                  <div className="mt-3">
                    <PeachPayButton
                      label="Pay with Card"
                      amountCents={folio.balance}
                      purpose="folio_settlement"
                      paymentType="DB"
                      reservationId={reservation.id}
                      folioId={folio.id}
                      onSuccess={() => loadFolio()}
                    />
                  </div>
                </div>
              )}

              {/* Card-on-arrival pre-auth (optional, before checkout) */}
              {folio.status === "open" && reservation.status === "checked_in" && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
                  <h4 className="text-sm font-semibold">Pre-authorise card</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Holds the room total on the guest's card without charging.
                    Capture at check-out (manual capture flow coming soon).
                  </p>
                  <div className="mt-3">
                    <PeachPayButton
                      label="Pre-auth card"
                      amountCents={folio.totalCharges}
                      purpose="card_on_arrival_preauth"
                      paymentType="PA"
                      reservationId={reservation.id}
                      folioId={folio.id}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Add Charge Form ───────────────────────────────────────────

function AddChargeForm({
  folioId,
  onDone,
  onCancel,
}: {
  folioId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    category: "service" as string,
    description: "",
    amount: "",
    quantity: 1,
  });

  const categories = Object.entries(ChargeCategory).map(([, v]) => v);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(form.amount) * 100);
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await addCharge({
        folioId,
        category: form.category as typeof ChargeCategory[keyof typeof ChargeCategory],
        description: form.description,
        amount: amountCents,
        quantity: form.quantity,
      });
      onDone();
    } catch {
      setError("Failed to add charge");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-border p-4">
      <h4 className="text-sm font-semibold">Add Charge</h4>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div>
          <label className="block text-xs font-medium">Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium">Description *</label>
          <input
            type="text"
            required
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="e.g. Room service breakfast"
            className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium">Amount (R) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium">Qty</label>
            <input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 1 }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add Charge"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Payment Form ──────────────────────────────────────────────

function PaymentForm({
  folioId,
  balance,
  onDone,
  onCancel,
}: {
  folioId: string;
  balance: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    method: "cash" as string,
    amount: (balance / 100).toFixed(2),
    reference: "",
  });

  const methods = Object.entries(PaymentMethod).map(([, v]) => v);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(form.amount) * 100);
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processPayment({
        folioId,
        method: form.method as typeof PaymentMethod[keyof typeof PaymentMethod],
        amount: amountCents,
        reference: form.reference || undefined,
      });
      onDone();
    } catch {
      setError("Failed to process payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-success/30 bg-success/5 p-4">
      <h4 className="text-sm font-semibold">Process Payment</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Outstanding balance: <strong>{formatCents(balance)}</strong>
      </p>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div>
          <label className="block text-xs font-medium">Payment Method</label>
          <select
            value={form.method}
            onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
          >
            {methods.map((m) => (
              <option key={m} value={m}>
                {m.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium">Amount (R) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Reference (optional)</label>
          <input
            type="text"
            value={form.reference}
            onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            placeholder="e.g. Card last 4 digits, transfer ref"
            className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
          >
            {saving ? "Processing..." : `Pay ${form.amount ? formatCents(Math.round(parseFloat(form.amount) * 100)) : ""}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Status Badge ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    [ReservationStatus.CONFIRMED]: "bg-primary/10 text-primary",
    [ReservationStatus.CHECKED_IN]: "bg-success/10 text-success",
    [ReservationStatus.CHECKED_OUT]: "bg-secondary text-muted-foreground",
    [ReservationStatus.CANCELLED]: "bg-destructive/10 text-destructive",
    [ReservationStatus.NO_SHOW]: "bg-warning/10 text-warning",
  };

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colorMap[status] ?? "bg-secondary"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Create Reservation Form ───────────────────────────────────

function CreateReservationForm({
  onSave,
  onCancel,
}: {
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [showNewGuest, setShowNewGuest] = useState(false);
  const [newGuest, setNewGuest] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [creatingGuest, setCreatingGuest] = useState(false);

  const [form, setForm] = useState({
    guestId: "",
    roomTypeId: "",
    roomId: "",
    checkInDate: new Date().toISOString().split("T")[0]!,
    checkOutDate: "",
    adults: 1,
    children: 0,
    specialRequests: "",
  });

  useEffect(() => {
    Promise.all([getAllGuests(), getRoomTypes(), getRooms()])
      .then(([g, rt, r]) => {
        setGuests(g);
        setRoomTypes(rt);
        setRooms(r);
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoadingData(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.guestId || !form.roomTypeId || !form.checkInDate || !form.checkOutDate) {
      setError("Please fill in all required fields");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createReservation({
        guestId: form.guestId,
        roomTypeId: form.roomTypeId,
        roomId: form.roomId || undefined,
        checkInDate: form.checkInDate,
        checkOutDate: form.checkOutDate,
        adults: form.adults,
        children: form.children,
        specialRequests: form.specialRequests || undefined,
      });
      await onSave();
    } catch {
      setError("Failed to create reservation");
    } finally {
      setSaving(false);
    }
  }

  const availableRooms = rooms.filter(
    (r) => r.status === "available" && (!form.roomTypeId || r.roomTypeId === form.roomTypeId),
  );

  if (loadingData) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">New Reservation</h1>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Guest *</label>
            <button
              type="button"
              onClick={() => setShowNewGuest(!showNewGuest)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {showNewGuest ? "Select existing" : "+ New Guest"}
            </button>
          </div>

          {showNewGuest ? (
            <div className="mt-2 rounded-md border border-border bg-secondary/30 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium">First Name *</label>
                  <input
                    type="text"
                    value={newGuest.firstName}
                    onChange={(e) => setNewGuest((g) => ({ ...g, firstName: e.target.value }))}
                    placeholder="John"
                    className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Last Name *</label>
                  <input
                    type="text"
                    value={newGuest.lastName}
                    onChange={(e) => setNewGuest((g) => ({ ...g, lastName: e.target.value }))}
                    placeholder="Smith"
                    className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium">Email</label>
                <input
                  type="email"
                  value={newGuest.email}
                  onChange={(e) => setNewGuest((g) => ({ ...g, email: e.target.value }))}
                  placeholder="john@example.com"
                  className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Phone</label>
                <input
                  type="tel"
                  value={newGuest.phone}
                  onChange={(e) => setNewGuest((g) => ({ ...g, phone: e.target.value }))}
                  placeholder="+27 82 123 4567"
                  className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={creatingGuest || !newGuest.firstName || !newGuest.lastName}
                onClick={async () => {
                  setCreatingGuest(true);
                  try {
                    const created = await createGuest({
                      firstName: newGuest.firstName,
                      lastName: newGuest.lastName,
                      email: newGuest.email || null,
                      phone: newGuest.phone || null,
                    });
                    setGuests((prev) => [...prev, created]);
                    setForm((f) => ({ ...f, guestId: created.id }));
                    setShowNewGuest(false);
                    setNewGuest({ firstName: "", lastName: "", email: "", phone: "" });
                  } catch {
                    setError("Failed to create guest");
                  } finally {
                    setCreatingGuest(false);
                  }
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creatingGuest ? "Creating..." : "Create & Select Guest"}
              </button>
            </div>
          ) : (
            <select
              required
              value={form.guestId}
              onChange={(e) => setForm((f) => ({ ...f, guestId: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="">Select a guest...</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.firstName} {g.lastName} {g.email ? `(${g.email})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium">Room Type *</label>
          <select
            required
            value={form.roomTypeId}
            onChange={(e) => setForm((f) => ({ ...f, roomTypeId: e.target.value, roomId: "" }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="">Select room type...</option>
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name} ({rt.code}) - {rt.bedConfiguration}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Room (optional)</label>
          <select
            value={form.roomId}
            onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="">Auto-assign at check-in</option>
            {availableRooms.map((r) => (
              <option key={r.id} value={r.id}>
                Room {r.roomNumber} (Floor {r.floor})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Check-in Date *</label>
            <input
              type="date"
              required
              value={form.checkInDate}
              onChange={(e) => setForm((f) => ({ ...f, checkInDate: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Check-out Date *</label>
            <input
              type="date"
              required
              value={form.checkOutDate}
              onChange={(e) => setForm((f) => ({ ...f, checkOutDate: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Adults *</label>
            <input
              type="number"
              min={1}
              required
              value={form.adults}
              onChange={(e) => setForm((f) => ({ ...f, adults: parseInt(e.target.value) || 1 }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Children</label>
            <input
              type="number"
              min={0}
              value={form.children}
              onChange={(e) => setForm((f) => ({ ...f, children: parseInt(e.target.value) || 0 }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Special Requests</label>
          <textarea
            value={form.specialRequests}
            onChange={(e) => setForm((f) => ({ ...f, specialRequests: e.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Reservation"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
