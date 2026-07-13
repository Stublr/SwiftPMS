import { RoomStatus, type Room } from "@swiftpms/shared";
import { useEffect, useState } from "react";

import { onRooms } from "@/lib/realtime";
import { updateRoomStatus } from "@/services/rooms";
import { usePropertyStore } from "@/stores/property.store";

const STATUS_COLORS: Record<string, string> = {
  [RoomStatus.AVAILABLE]: "bg-green-100 border-green-400 text-green-800",
  [RoomStatus.HELD]: "bg-amber-100 border-amber-400 text-amber-800",
  [RoomStatus.OCCUPIED]: "bg-blue-100 border-blue-400 text-blue-800",
  [RoomStatus.RESERVED]: "bg-yellow-100 border-yellow-400 text-yellow-800",
  [RoomStatus.DIRTY]: "bg-orange-100 border-orange-400 text-orange-800",
  [RoomStatus.MAINTENANCE]: "bg-red-100 border-red-400 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  [RoomStatus.AVAILABLE]: "Available",
  [RoomStatus.HELD]: "Held (30 min)",
  [RoomStatus.OCCUPIED]: "Occupied",
  [RoomStatus.RESERVED]: "Reserved",
  [RoomStatus.DIRTY]: "Dirty",
  [RoomStatus.MAINTENANCE]: "Maintenance",
};

const ALL_STATUSES = [
  RoomStatus.AVAILABLE,
  RoomStatus.OCCUPIED,
  RoomStatus.RESERVED,
  RoomStatus.DIRTY,
  RoomStatus.MAINTENANCE,
] as const;

export function RoomBoardPage() {
  const propertyId = usePropertyStore((s) => s.propertyId);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    if (!propertyId) return;

    setLoading(true);
    const unsub = onRooms((data) => {
      setRooms(data);
      setLoading(false);
    });
    return () => unsub();
  }, [propertyId]);

  async function handleStatusChange(roomId: string, newStatus: string) {
    setUpdatingStatus(true);
    setStatusError(null);
    try {
      await updateRoomStatus(roomId, newStatus);
      setSelectedRoom(null);
    } catch (err) {
      // Surface the failure — the realtime listener only fires on success, so
      // a silent catch made a rejected update look like it worked.
      setStatusError(
        err instanceof Error ? err.message : "Failed to update room status",
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  const filteredRooms = filterStatus === "all"
    ? rooms
    : rooms.filter((r) => r.status === filterStatus);

  // Sort by room number. Coalesce undefined → "" so a stray legacy row
  // without a roomNumber doesn't throw on localeCompare and crash the whole page.
  const sortedRooms = [...filteredRooms].sort((a, b) =>
    (a.roomNumber ?? "").localeCompare(b.roomNumber ?? "", undefined, { numeric: true }),
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Room Board</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-sm"
          >
            <option value="all">All ({rooms.length})</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]} ({rooms.filter((r) => r.status === s).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {ALL_STATUSES.map((s) => (
          <div key={s} className="flex items-center gap-1.5 text-xs">
            <span className={`h-3 w-3 rounded-full border ${STATUS_COLORS[s]}`} />
            <span>{STATUS_LABELS[s]}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">Loading rooms...</div>
      ) : sortedRooms.length === 0 ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">
          No rooms found. Add rooms in Room Setup.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {sortedRooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setSelectedRoom(room)}
              className={`rounded-lg border-2 p-3 text-left transition-shadow hover:shadow-md ${STATUS_COLORS[room.status] ?? "bg-secondary border-border"}`}
            >
              <p className="text-lg font-bold">{room.roomNumber}</p>
              <p className="mt-0.5 text-xs capitalize">
                {STATUS_LABELS[room.status] ?? room.status}
              </p>
              {room.floor > 0 && (
                <p className="mt-0.5 text-xs opacity-70">Floor {room.floor}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Room detail modal */}
      {selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Room {selectedRoom.roomNumber}</h2>
                <p className="text-sm text-muted-foreground">Floor {selectedRoom.floor}</p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_COLORS[selectedRoom.status]}`}
              >
                {STATUS_LABELS[selectedRoom.status]}
              </span>
            </div>

            {selectedRoom.notes && (
              <p className="mt-3 text-sm text-muted-foreground">
                {selectedRoom.notes}
              </p>
            )}

            {selectedRoom.currentReservationId && (
              <p className="mt-2 text-xs text-muted-foreground">
                Reservation: #{selectedRoom.currentReservationId.slice(0, 8)}
              </p>
            )}

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Change Status</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_STATUSES.filter((s) => s !== selectedRoom.status).map((s) => (
                  <button
                    key={s}
                    disabled={updatingStatus}
                    onClick={() => handleStatusChange(selectedRoom.id, s)}
                    className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${STATUS_COLORS[s]} hover:opacity-80`}
                  >
                    {updatingStatus ? "..." : STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {statusError && (
              <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                {statusError}
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setSelectedRoom(null);
                  setStatusError(null);
                }}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
