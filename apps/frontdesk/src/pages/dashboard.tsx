import { formatCents, type Room, type Reservation, RoomStatus } from "@swiftpms/shared";
import { useEffect, useState } from "react";

import { onRooms, onTodayReservations, onTodayDepartures, onDailyAggregates } from "@/lib/realtime";
import { useAuthStore } from "@/stores/auth.store";
import { usePropertyStore } from "@/stores/property.store";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const propertyName = usePropertyStore((s) => s.propertyName);
  const propertyId = usePropertyStore((s) => s.propertyId);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [todayArrivals, setTodayArrivals] = useState<Reservation[]>([]);
  const [todayDepartures, setTodayDepartures] = useState<Reservation[]>([]);
  const [aggregates, setAggregates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let initialLoad = true;

    const unsubRooms = onRooms((data) => {
      setRooms(data);
      if (initialLoad) {
        initialLoad = false;
        setLoading(false);
      }
    });

    const unsubArrivals = onTodayReservations((data) => {
      setTodayArrivals(data);
    });

    const unsubDepartures = onTodayDepartures((data) => {
      setTodayDepartures(data);
    });

    const unsubAgg = onDailyAggregates((data) => {
      setAggregates(data);
    });

    return () => {
      unsubRooms();
      unsubArrivals();
      unsubDepartures();
      unsubAgg();
    };
  }, [propertyId]);

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.status === RoomStatus.OCCUPIED).length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
  const revenueToday = aggregates?.revenue ?? 0;

  const statusCounts = {
    available: rooms.filter((r) => r.status === RoomStatus.AVAILABLE).length,
    occupied: occupiedRooms,
    reserved: rooms.filter((r) => r.status === RoomStatus.RESERVED).length,
    dirty: rooms.filter((r) => r.status === RoomStatus.DIRTY).length,
    maintenance: rooms.filter((r) => r.status === RoomStatus.MAINTENANCE).length,
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground mt-1">
        Welcome back, {user?.fullName ?? "User"}. Managing {propertyName ?? "property"}.
      </p>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-white p-6">
          <p className="text-muted-foreground text-sm">Occupancy Rate</p>
          <p className="mt-1 text-2xl font-bold">
            {loading ? "..." : `${occupancyRate}%`}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {occupiedRooms} of {totalRooms} rooms
          </p>
        </div>
        <div className="rounded-lg border border-border bg-white p-6">
          <p className="text-muted-foreground text-sm">Today's Arrivals</p>
          <p className="mt-1 text-2xl font-bold">
            {loading ? "..." : todayArrivals.length}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Reservations checking in</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-6">
          <p className="text-muted-foreground text-sm">Today's Departures</p>
          <p className="mt-1 text-2xl font-bold">
            {loading ? "..." : todayDepartures.length}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Reservations checking out</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-6">
          <p className="text-muted-foreground text-sm">Revenue Today</p>
          <p className="mt-1 text-2xl font-bold">
            {loading ? "..." : formatCents(revenueToday)}
          </p>
        </div>
      </div>

      {/* Room status summary + Today's activity */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-white p-6">
          <h2 className="font-semibold">Room Status Summary</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-green-500" />
                <span>Available</span>
              </div>
              <span className="font-medium">{statusCounts.available}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-blue-500" />
                <span>Occupied</span>
              </div>
              <span className="font-medium">{statusCounts.occupied}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-yellow-500" />
                <span>Reserved</span>
              </div>
              <span className="font-medium">{statusCounts.reserved}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-orange-500" />
                <span>Dirty</span>
              </div>
              <span className="font-medium">{statusCounts.dirty}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500" />
                <span>Maintenance</span>
              </div>
              <span className="font-medium">{statusCounts.maintenance}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white p-6">
          <h2 className="font-semibold">System Status</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span>Logged in as <strong>{user?.email}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span>Role: <strong>{user?.role.replace("_", " ")}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span>Property: <strong>{propertyName ?? "---"}</strong></span>
            </div>
          </div>

          {todayArrivals.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Upcoming Check-ins
              </h3>
              <div className="mt-2 space-y-1">
                {todayArrivals.slice(0, 5).map((res) => (
                  <div
                    key={res.id}
                    className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-xs"
                  >
                    <span className="font-medium">#{res.id.slice(0, 8)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        res.status === "confirmed"
                          ? "bg-primary/10 text-primary"
                          : res.status === "checked_in"
                            ? "bg-success/10 text-success"
                            : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {res.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
