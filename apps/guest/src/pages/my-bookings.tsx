import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { getMyBookings } from "@/services/booking";
import { formatCents } from "@swiftpms/shared";
import type { Reservation } from "@swiftpms/shared";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  confirmed: { bg: "bg-blue-50", text: "text-blue-700", label: "Confirmed" },
  checked_in: { bg: "bg-green-50", text: "text-green-700", label: "Checked In" },
  checked_out: { bg: "bg-gray-100", text: "text-gray-600", label: "Checked Out" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Cancelled" },
  no_show: { bg: "bg-amber-50", text: "text-amber-700", label: "No Show" },
};

export function MyBookingsPage() {
  const navigate = useUIStore((s) => s.navigate);
  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);
  const firstName = useGuestAuthStore((s) => s.firstName);

  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            My Bookings
          </h1>
          {firstName && (
            <p className="mt-1 text-sm text-muted-foreground">
              Welcome back, {firstName}
            </p>
          )}
        </div>
        <button
          onClick={() => navigate("/")}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          New Booking
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && bookings.length === 0 && (
        <div className="rounded-xl border border-border bg-white py-16 text-center shadow-sm">
          <svg
            className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
            />
          </svg>
          <p className="text-muted-foreground">
            You don't have any bookings yet.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse Rooms
          </button>
        </div>
      )}

      {/* Booking Cards */}
      <div className="space-y-4">
        {bookings.map((booking) => {
          const nights = nightCount(booking.checkInDate, booking.checkOutDate);
          const statusStyle = STATUS_STYLES[booking.status] ?? {
            bg: "bg-gray-100",
            text: "text-gray-600",
            label: booking.status,
          };

          return (
            <div
              key={booking.id}
              className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
            >
              <div className="p-5 sm:p-6">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Reservation #{booking.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Booked{" "}
                      {(() => {
                        const ca = booking.createdAt as unknown;
                        if (ca && typeof ca === "object" && "seconds" in (ca as Record<string, unknown>)) {
                          return new Date((ca as { seconds: number }).seconds * 1000);
                        }
                        return new Date(booking.createdAt);
                      })().toLocaleDateString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
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
                  <div className="text-lg font-bold text-foreground">
                    {formatCents(booking.totalRoomCharges)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
