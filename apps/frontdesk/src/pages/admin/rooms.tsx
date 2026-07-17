import { formatCents, type Room, type RoomType, type RatePeriod } from "@swiftpms/shared";
import { useEffect, useState } from "react";

import {
  getRooms,
  getRoomTypes,
  createRoom,
  updateRoom,
  createRoomType,
  updateRoomType,
} from "@/services/rooms";

type Tab = "rooms" | "room-types";
type View = "list" | "create" | "edit";

export function AdminRoomsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("rooms");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Room Setup</h1>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1">
        <button
          onClick={() => setActiveTab("rooms")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "rooms"
              ? "bg-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Rooms
        </button>
        <button
          onClick={() => setActiveTab("room-types")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "room-types"
              ? "bg-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Room Types
        </button>
      </div>

      {activeTab === "rooms" ? <RoomsList /> : <RoomTypesList />}
    </div>
  );
}

function RoomsList() {
  const [view, setView] = useState<View>("list");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [r, rt] = await Promise.all([getRooms(), getRoomTypes()]);
      setRooms(r);
      setRoomTypes(rt);
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  const roomTypeMap = new Map(roomTypes.map((rt) => [rt.id, rt.name]));

  if (view === "create") {
    return (
      <RoomForm
        roomTypes={roomTypes}
        onSave={async (data) => {
          await createRoom(data);
          await loadData();
          setView("list");
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "edit" && editingRoom) {
    return (
      <RoomEditForm
        room={editingRoom}
        roomTypes={roomTypes}
        onSave={async (data) => {
          await updateRoom(editingRoom.id, data);
          await loadData();
          setView("list");
          setEditingRoom(null);
        }}
        onCancel={() => {
          setView("list");
          setEditingRoom(null);
        }}
      />
    );
  }

  return (
    <div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rooms.length} rooms</p>
        <button
          onClick={() => setView("create")}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add Room
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Room #</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Floor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rooms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No rooms configured.
                  </td>
                </tr>
              ) : (
                rooms
                  .sort((a, b) => (a.roomNumber ?? "").localeCompare(b.roomNumber ?? "", undefined, { numeric: true }))
                  .map((room) => (
                    <tr key={room.id}>
                      <td className="px-4 py-3 font-medium">{room.roomNumber}</td>
                      <td className="px-4 py-3">{roomTypeMap.get(room.roomTypeId) ?? room.roomTypeId}</td>
                      <td className="px-4 py-3">{room.floor}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs capitalize">
                          {room.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setEditingRoom(room);
                            setView("edit");
                          }}
                          className="text-primary hover:underline"
                        >
                          Edit
                        </button>
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

function RoomForm({
  roomTypes,
  onSave,
  onCancel,
}: {
  roomTypes: RoomType[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    roomNumber: "",
    roomTypeId: "",
    floor: 1,
    rateOverride: "",
    imageUrls: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.roomNumber || !form.roomTypeId) {
      setError("Room number and type are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const rateCents = form.rateOverride ? Math.round(parseFloat(form.rateOverride) * 100) : undefined;
      const images = form.imageUrls.split("\n").map((u) => u.trim()).filter(Boolean);
      await onSave({
        roomNumber: form.roomNumber,
        roomTypeId: form.roomTypeId,
        floor: form.floor,
        rateOverride: rateCents || null,
        imageUrls: images.length > 0 ? images : undefined,
        notes: form.notes || null,
      });
    } catch (err) {
      const isPermission = err && typeof err === "object" && "code" in err
        && (err as { code: string }).code === "permission-denied";
      setError(isPermission
        ? "You don't have permission to manage rooms. Please log in as an admin."
        : "Failed to create room");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <h2 className="text-lg font-semibold">Add Room</h2>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-4">
        <div>
          <label className="block text-sm font-medium">Room Name / Number *</label>
          <input
            type="text"
            required
            value={form.roomNumber}
            onChange={(e) => setForm((f) => ({ ...f, roomNumber: e.target.value }))}
            placeholder="e.g., 101, Suite A, Garden Room"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Room Type *</label>
          <select
            required
            value={form.roomTypeId}
            onChange={(e) => setForm((f) => ({ ...f, roomTypeId: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="">Select type...</option>
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name} ({rt.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Floor</label>
          <input
            type="number"
            min={0}
            value={form.floor}
            onChange={(e) => setForm((f) => ({ ...f, floor: parseInt(e.target.value) || 1 }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Rate Override (R)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.rateOverride}
            onChange={(e) => setForm((f) => ({ ...f, rateOverride: e.target.value }))}
            placeholder="Leave blank to use room type rate"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">Overrides the room type base rate for this specific room</p>
        </div>
        <div>
          <label className="block text-sm font-medium">Image URLs</label>
          <textarea
            value={form.imageUrls}
            onChange={(e) => setForm((f) => ({ ...f, imageUrls: e.target.value }))}
            rows={3}
            placeholder="One URL per line"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">Room-specific photos. Falls back to room type images if empty.</p>
        </div>
        <div>
          <label className="block text-sm font-medium">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Room"}
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

function RoomEditForm({
  room,
  roomTypes,
  onSave,
  onCancel,
}: {
  room: Room;
  roomTypes: RoomType[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    roomNumber: room.roomNumber,
    roomTypeId: room.roomTypeId,
    floor: room.floor,
    rateOverride: room.rateOverride ? (room.rateOverride / 100).toFixed(2) : "",
    imageUrls: (room.imageUrls ?? []).join("\n"),
    notes: room.notes ?? "",
    isActive: room.isActive,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const rateCents = form.rateOverride ? Math.round(parseFloat(form.rateOverride) * 100) : null;
      const images = form.imageUrls.split("\n").map((u) => u.trim()).filter(Boolean);
      await onSave({
        roomNumber: form.roomNumber,
        roomTypeId: form.roomTypeId,
        floor: form.floor,
        rateOverride: rateCents,
        imageUrls: images,
        notes: form.notes || null,
        isActive: form.isActive,
      });
    } catch (err) {
      const isPermission = err && typeof err === "object" && "code" in err
        && (err as { code: string }).code === "permission-denied";
      setError(isPermission
        ? "You don't have permission to manage rooms. Please log in as an admin."
        : "Failed to update room");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <h2 className="text-lg font-semibold">Edit Room {room.roomNumber}</h2>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-4">
        <div>
          <label className="block text-sm font-medium">Room Name / Number *</label>
          <input
            type="text"
            required
            value={form.roomNumber}
            onChange={(e) => setForm((f) => ({ ...f, roomNumber: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Room Type *</label>
          <select
            required
            value={form.roomTypeId}
            onChange={(e) => setForm((f) => ({ ...f, roomTypeId: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name} ({rt.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Floor</label>
          <input
            type="number"
            min={0}
            value={form.floor}
            onChange={(e) => setForm((f) => ({ ...f, floor: parseInt(e.target.value) || 1 }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Rate Override (R)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.rateOverride}
            onChange={(e) => setForm((f) => ({ ...f, rateOverride: e.target.value }))}
            placeholder="Leave blank to use room type rate"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">Overrides the room type base rate for this specific room</p>
        </div>
        <div>
          <label className="block text-sm font-medium">Image URLs</label>
          <textarea
            value={form.imageUrls}
            onChange={(e) => setForm((f) => ({ ...f, imageUrls: e.target.value }))}
            rows={3}
            placeholder="One URL per line"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">Room-specific photos. Falls back to room type images if empty.</p>
        </div>
        <div>
          <label className="block text-sm font-medium">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
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

function RoomTypesList() {
  const [view, setView] = useState<View>("list");
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [editingType, setEditingType] = useState<RoomType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getRoomTypes();
      setRoomTypes(data);
    } catch {
      setError("Failed to load room types");
    } finally {
      setLoading(false);
    }
  }

  if (view === "create") {
    return (
      <RoomTypeForm
        onSave={async (data) => {
          await createRoomType(data);
          await loadData();
          setView("list");
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "edit" && editingType) {
    return (
      <RoomTypeEditForm
        roomType={editingType}
        onSave={async (data) => {
          await updateRoomType(editingType.id, data);
          await loadData();
          setView("list");
          setEditingType(null);
        }}
        onCancel={() => {
          setView("list");
          setEditingType(null);
        }}
      />
    );
  }

  return (
    <div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{roomTypes.length} room types</p>
        <button
          onClick={() => setView("create")}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add Room Type
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Base Rate</th>
                <th className="px-4 py-3 font-medium">Max Occupancy</th>
                <th className="px-4 py-3 font-medium">Bed Config</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roomTypes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No room types configured.
                  </td>
                </tr>
              ) : (
                roomTypes.map((rt) => (
                  <tr key={rt.id}>
                    <td className="px-4 py-3 font-medium">{rt.name}</td>
                    <td className="px-4 py-3">{rt.code}</td>
                    <td className="px-4 py-3">
                      {rt.tieredPricing ? (
                        <span title={`Standard: R${(rt.tieredPricing.standard.baseRate / 100).toFixed(2)} base + R${(rt.tieredPricing.standard.extraAdult / 100).toFixed(2)}/extra adult + R${(rt.tieredPricing.standard.extraChild / 100).toFixed(2)}/child. High: R${(rt.tieredPricing.high.baseRate / 100).toFixed(2)} base + R${(rt.tieredPricing.high.extraAdult / 100).toFixed(2)}/adult + R${(rt.tieredPricing.high.extraChild / 100).toFixed(2)}/child.`}>
                          {formatCents(rt.tieredPricing.standard.baseRate)}/person/night
                          <span className="ml-1 text-xs text-muted-foreground">
                            (tiered)
                          </span>
                        </span>
                      ) : (
                        `${formatCents(rt.baseRate)}/night`
                      )}
                    </td>
                    <td className="px-4 py-3">{rt.maxOccupancy}</td>
                    <td className="px-4 py-3">{rt.bedConfiguration}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          rt.isActive
                            ? "bg-success/10 text-success"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {rt.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setEditingType(rt);
                          setView("edit");
                        }}
                        className="text-primary hover:underline"
                      >
                        Edit
                      </button>
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

interface RatePeriodRow {
  id: string;
  name: string;
  start: string;
  end: string;
  mode: "flat" | "tier";
  baseRate: string; // R — flat rate override, or tier base rate when mode is "tier"
  basePersonCount: string;
  extraAdult: string;
  extraChild: string;
  extraSenior: string;
}

function ratePeriodsToRows(periods: RatePeriod[] | undefined): RatePeriodRow[] {
  return (periods ?? []).map((p) => {
    if (p.tier) {
      return {
        id: p.id,
        name: p.name,
        start: p.start,
        end: p.end,
        mode: "tier",
        baseRate: (p.tier.baseRate / 100).toFixed(2),
        basePersonCount: String(p.tier.basePersonCount),
        extraAdult: (p.tier.extraAdult / 100).toFixed(2),
        extraChild: (p.tier.extraChild / 100).toFixed(2),
        extraSenior: p.tier.extraSenior != null ? (p.tier.extraSenior / 100).toFixed(2) : "",
      };
    }
    return {
      id: p.id,
      name: p.name,
      start: p.start,
      end: p.end,
      mode: "flat",
      baseRate: p.baseRate != null ? (p.baseRate / 100).toFixed(2) : "",
      basePersonCount: "",
      extraAdult: "",
      extraChild: "",
      extraSenior: "",
    };
  });
}

function rowsToRatePeriods(rows: RatePeriodRow[]): RatePeriod[] {
  return rows
    .filter((r) => r.name.trim() && r.start && r.end)
    .map((r) => {
      if (r.mode === "tier") {
        return {
          id: r.id,
          name: r.name.trim(),
          start: r.start,
          end: r.end,
          tier: {
            baseRate: Math.round(parseFloat(r.baseRate || "0") * 100),
            basePersonCount: parseInt(r.basePersonCount) || 1,
            extraAdult: Math.round(parseFloat(r.extraAdult || "0") * 100),
            extraChild: Math.round(parseFloat(r.extraChild || "0") * 100),
            ...(r.extraSenior ? { extraSenior: Math.round(parseFloat(r.extraSenior) * 100) } : {}),
          },
        };
      }
      return {
        id: r.id,
        name: r.name.trim(),
        start: r.start,
        end: r.end,
        baseRate: r.baseRate ? Math.round(parseFloat(r.baseRate) * 100) : undefined,
      };
    });
}

function RatePeriodEditor({
  rows,
  onChange,
}: {
  rows: RatePeriodRow[];
  onChange: (rows: RatePeriodRow[]) => void;
}) {
  function updateRow(id: string, patch: Partial<RatePeriodRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        name: "",
        start: "",
        end: "",
        mode: "flat",
        baseRate: "",
        basePersonCount: "",
        extraAdult: "",
        extraChild: "",
        extraSenior: "",
      },
    ]);
  }

  function removeRow(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  return (
    <div>
      <label className="block text-sm font-medium">Rate periods</label>
      <p className="mt-1 text-xs text-muted-foreground">
        Date-range overrides (e.g. peak season). Choose a flat nightly rate override, or a
        per-person tier override for tiered-pricing room types.
      </p>
      <div className="mt-2 space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateRow(row.id, { name: e.target.value })}
                placeholder="e.g., Peak Season"
                className="rounded-md border border-border px-3 py-2 text-sm"
              />
              <select
                value={row.mode}
                onChange={(e) => updateRow(row.id, { mode: e.target.value as "flat" | "tier" })}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <option value="flat">Flat rate override</option>
                <option value="tier">Per-person tier override</option>
              </select>
              <input
                type="date"
                value={row.start}
                onChange={(e) => updateRow(row.id, { start: e.target.value })}
                className="rounded-md border border-border px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={row.end}
                onChange={(e) => updateRow(row.id, { end: e.target.value })}
                className="rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>

            {row.mode === "flat" ? (
              <div className="mt-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.baseRate}
                  onChange={(e) => updateRow(row.id, { baseRate: e.target.value })}
                  placeholder="Rate (R), optional — falls back to base rate"
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.baseRate}
                  onChange={(e) => updateRow(row.id, { baseRate: e.target.value })}
                  placeholder="Base rate (R)"
                  className="rounded-md border border-border px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="1"
                  value={row.basePersonCount}
                  onChange={(e) => updateRow(row.id, { basePersonCount: e.target.value })}
                  placeholder="Base person count"
                  className="rounded-md border border-border px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.extraAdult}
                  onChange={(e) => updateRow(row.id, { extraAdult: e.target.value })}
                  placeholder="R/extra adult"
                  className="rounded-md border border-border px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.extraChild}
                  onChange={(e) => updateRow(row.id, { extraChild: e.target.value })}
                  placeholder="R/extra child"
                  className="rounded-md border border-border px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.extraSenior}
                  onChange={(e) => updateRow(row.id, { extraSenior: e.target.value })}
                  placeholder="R/pensioner, optional"
                  className="col-span-2 rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => removeRow(row.id)}
              className="mt-2 text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
      >
        Add rate period
      </button>
    </div>
  );
}

function RoomTypeForm({
  onSave,
  onCancel,
}: {
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
    baseRate: "",
    maxOccupancy: 2,
    bedConfiguration: "",
    amenities: "",
  });
  const [ratePeriods, setRatePeriods] = useState<RatePeriodRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.code || !form.baseRate || !form.bedConfiguration) {
      setError("Name, code, base rate, and bed configuration are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        name: form.name,
        code: form.code,
        description: form.description || null,
        baseRate: Math.round(parseFloat(form.baseRate) * 100), // Convert to cents
        maxOccupancy: form.maxOccupancy,
        bedConfiguration: form.bedConfiguration,
        amenities: form.amenities ? form.amenities.split(",").map((a) => a.trim()) : [],
        ratePeriods: rowsToRatePeriods(ratePeriods),
      });
    } catch {
      setError("Failed to create room type");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <h2 className="text-lg font-semibold">Add Room Type</h2>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Standard Double"
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Code *</label>
            <input
              type="text"
              required
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g., STD"
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Base Rate (R/night) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={form.baseRate}
              onChange={(e) => setForm((f) => ({ ...f, baseRate: e.target.value }))}
              placeholder="0.00"
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Max Occupancy</label>
            <input
              type="number"
              min={1}
              value={form.maxOccupancy}
              onChange={(e) => setForm((f) => ({ ...f, maxOccupancy: parseInt(e.target.value) || 2 }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Bed Configuration *</label>
          <input
            type="text"
            required
            value={form.bedConfiguration}
            onChange={(e) => setForm((f) => ({ ...f, bedConfiguration: e.target.value }))}
            placeholder="e.g., 1 King, 2 Twin"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Amenities (comma-separated)</label>
          <input
            type="text"
            value={form.amenities}
            onChange={(e) => setForm((f) => ({ ...f, amenities: e.target.value }))}
            placeholder="e.g., WiFi, TV, Mini-bar"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <RatePeriodEditor rows={ratePeriods} onChange={setRatePeriods} />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Room Type"}
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

function RoomTypeEditForm({
  roomType,
  onSave,
  onCancel,
}: {
  roomType: RoomType;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: roomType.name,
    code: roomType.code,
    description: roomType.description ?? "",
    baseRate: (roomType.baseRate / 100).toFixed(2),
    maxOccupancy: roomType.maxOccupancy,
    bedConfiguration: roomType.bedConfiguration,
    amenities: roomType.amenities.join(", "),
    isActive: roomType.isActive,
  });
  const [ratePeriods, setRatePeriods] = useState<RatePeriodRow[]>(
    ratePeriodsToRows(roomType.ratePeriods),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({
        name: form.name,
        code: form.code,
        description: form.description || null,
        baseRate: Math.round(parseFloat(form.baseRate) * 100),
        maxOccupancy: form.maxOccupancy,
        bedConfiguration: form.bedConfiguration,
        amenities: form.amenities ? form.amenities.split(",").map((a) => a.trim()) : [],
        isActive: form.isActive,
        ratePeriods: rowsToRatePeriods(ratePeriods),
      });
    } catch {
      setError("Failed to update room type");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <h2 className="text-lg font-semibold">Edit Room Type: {roomType.name}</h2>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Code *</label>
            <input
              type="text"
              required
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Base Rate (R/night) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={form.baseRate}
              onChange={(e) => setForm((f) => ({ ...f, baseRate: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Max Occupancy</label>
            <input
              type="number"
              min={1}
              value={form.maxOccupancy}
              onChange={(e) => setForm((f) => ({ ...f, maxOccupancy: parseInt(e.target.value) || 2 }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Bed Configuration *</label>
          <input
            type="text"
            required
            value={form.bedConfiguration}
            onChange={(e) => setForm((f) => ({ ...f, bedConfiguration: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Amenities (comma-separated)</label>
          <input
            type="text"
            value={form.amenities}
            onChange={(e) => setForm((f) => ({ ...f, amenities: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>
        </div>
        <RatePeriodEditor rows={ratePeriods} onChange={setRatePeriods} />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
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
