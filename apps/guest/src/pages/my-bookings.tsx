import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { getMyBookings } from "@/services/booking";
import { getPropertyInfo, getRoomTypeName, type PropertyInfo } from "@/services/property";
import { downloadBookingPdf } from "@/lib/booking-pdf";
import { formatCents } from "@swiftpms/shared";
import type { Reservation } from "@swiftpms/shared";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  confirmed: { bg: "bg-leaf-soft", text: "text-leaf-foreground", label: "Confirmed" },
  checked_in: { bg: "bg-primary/10", text: "text-primary", label: "Checked In" },
  checked_out: { bg: "bg-muted", text: "text-muted-foreground", label: "Checked Out" },
  cancelled: { bg: "bg-destructive/10", text: "text-destructive", label: "Cancelled" },
  no_show: { bg: "bg-accent-soft", text: "text-accent-dark", label: "No Show" },
};

export function MyBookingsPage() {
  const navigate = useUIStore((s) => s.navigate);
  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);
  const firstName = useGuestAuthStore((s) => s.firstName);
  const lastName = useGuestAuthStore((s) => s.lastName);

  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyCache, setPropertyCache] = useState<Map<string, PropertyInfo>>(new Map());
  const [roomTypeCache, setRoomTypeCache] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    loadBookings();
  }, [isAuthenticated]);

  async function loadBookings() {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyBookings();
      setBookings(data);

      // Pre-fetch property and room type info for all bookings
      const propIds = [...new Set(data.map((b) => b.propertyId))];
      const rtIds = [...new Set(data.map((b) => b.roomTypeId))];

      const propMap = new Map<string, PropertyInfo>();
      for (const pid of propIds) {
        try {
          const info = await getPropertyInfo(pid);
          propMap.set(pid, info);
        } catch { /* skip */ }
      }
      setPropertyCache(propMap);

      const rtMap = new Map<string, string>();
      for (const rtId of rtIds) {
        try {
          const name = await getRoomTypeName(rtId);
          rtMap.set(rtId, name);
        } catch { /* skip */ }
      }
      setRoomTypeCache(rtMap);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load bookings.",
      );
    } finally {
      setLoading(false);
    }
  }

  function nightCount(ci: string, co: string): number {
    const diff = new Date(co).getTime() - new Date(ci).getTime();
    return Math.max(1, Math.round(diff / 86400000));
  }

  function handleDownload(booking: Reservation) {
    const prop = propertyCache.get(booking.propertyId);
    const rtName = roomTypeCache.get(booking.roomTypeId);

    downloadBookingPdf({
      reservation: booking,
      guestName: [firstName, lastName].filter(Boolean).join(" ") || "Guest",
      guestEmail: useGuestAuthStore.getState().email ?? "",
      propertyName: prop?.name,
      propertyAddress: prop?.address ?? undefined,
      propertyPhone: prop?.phone ?? undefined,
      propertyEmail: prop?.email ?? undefined,
      roomTypeName: rtName,
      roomNumber: booking.roomId ?? undefined,
      amenities: prop?.amenities,
      checkInTime: prop?.checkInTime,
      checkOutTime: prop?.checkOutTime,
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <span className="eyebrow text-accent">Your itinerary</span>
          <h1 className="mt-2 font-display text-3xl font-semibold text-foreground sm:text-4xl">
            My bookings
          </h1>
          {firstName && (
            <p className="mt-1 text-sm text-muted-foreground">
              Welcome back, {firstName}.
            </p>
          )}
        </div>
        <button
          onClick={() => navigate("/")}
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card"
        >
          + New Booking
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && bookings.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center shadow-soft">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-leaf-soft">
            <svg
              className="h-8 w-8 text-leaf"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
              />
            </svg>
          </div>
          <p className="text-muted-foreground">
            You don't have any bookings yet.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-5 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card"
          >
            Browse Rooms
          </button>
        </div>
      )}

      <div className="space-y-4">
        {bookings.map((booking) => {
          const nights = nightCount(booking.checkInDate, booking.checkOutDate);
          const statusStyle = STATUS_STYLES[booking.status] ?? {
            bg: "bg-gray-100",
            text: "text-gray-600",
            label: booking.status,
          };
          const rtName = roomTypeCache.get(booking.roomTypeId);
          const prop = propertyCache.get(booking.propertyId);

          return (
            <div
              key={booking.id}
              className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
            >
              <div className="p-5 sm:p-6">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Reservation #{booking.id.slice(0, 8).toUpperCase()}
                      {prop ? ` — ${prop.name}` : ""}
                    </p>
                    {rtName && (
                      <p className="mt-0.5 text-sm font-medium text-foreground">
                        {rtName}
                        {booking.roomId ? ` — ${booking.roomId}` : ""}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      statusStyle.bg,
                      statusStyle.text,
                    )}
                  >
                    {statusStyle.label}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Check-in
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {new Date(
                        booking.checkInDate + "T00:00:00",
                      ).toLocaleDateString("en-ZA", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Check-out
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {new Date(
                        booking.checkOutDate + "T00:00:00",
                      ).toLocaleDateString("en-ZA", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Duration
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {nights} {nights === 1 ? "night" : "nights"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <div className="text-sm text-muted-foreground">
                    {booking.adults} {booking.adults === 1 ? "adult" : "adults"}
                    {booking.children > 0 &&
                      `, ${booking.children} ${booking.children === 1 ? "child" : "children"}`}
                  </div>
                  <div className="font-display text-xl font-semibold text-primary">
                    {formatCents(booking.totalRoomCharges)}
                  </div>
                </div>

                <div className="mt-3 flex justify-end border-t border-border pt-3">
                  <button
                    onClick={() => handleDownload(booking)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download Confirmation
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
