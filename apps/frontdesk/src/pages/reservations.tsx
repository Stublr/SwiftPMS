import { ReservationStatus, type Reservation, type Guest, type RoomType } from "@swiftpms/shared";
import { useEffect, useState } from "react";

import {
  getReservations,
  createReservation,
  checkInReservation,
  checkOutReservation,
  cancelReservation,
} from "@/services/reservations";
import { getGuests } from "@/services/guests";
import { getRoomTypes, getRooms } from "@/services/rooms";
import type { Room } from "@swiftpms/shared";

type Tab = "all" | "confirmed" | "checked_in" | "checked_out";

export function ReservationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadReservations();
  }, [activeTab]);

  async function loadReservations() {
    setLoading(true);
    setError("");
    try {
      const status = activeTab === "all" ? undefined : activeTab;
      const data = await getReservations(status);
      setReservations(data);
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

  const filteredReservations = search
    ? reservations.filter((r) =>
        r.guestId.toLowerCase().includes(search.toLowerCase()) ||
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
          placeholder="Search by reservation or guest ID..."
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
                  <tr key={res.id}>
                    <td className="px-4 py-3 font-mono text-xs">{res.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-xs">{res.guestId.slice(0, 8)}</td>
                    <td className="px-4 py-3">{res.roomId ? res.roomId.slice(0, 8) : "---"}</td>
                    <td className="px-4 py-3">{res.checkInDate}</td>
                    <td className="px-4 py-3">{res.checkOutDate}</td>
                    <td className="px-4 py-3 text-center">{res.nightCount}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={res.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {res.status === ReservationStatus.CONFIRMED && (
                          <button
                            onClick={() => handleCheckIn(res.id)}
                            className="rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success hover:bg-success/20"
                          >
                            Check In
                          </button>
                        )}
                        {res.status === ReservationStatus.CHECKED_IN && (
                          <button
                            onClick={() => handleCheckOut(res.id)}
                            className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                          >
                            Check Out
                          </button>
                        )}
                        {res.status === ReservationStatus.CONFIRMED && (
                          <button
                            onClick={() => handleCancel(res.id)}
                            className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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
    Promise.all([getGuests(), getRoomTypes(), getRooms()])
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
        children: form.children || undefined,
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
          <label className="block text-sm font-medium">Guest *</label>
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
