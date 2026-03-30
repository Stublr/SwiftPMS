import { useEffect } from "react";
import { useUIStore } from "@/stores/ui.store";
import { useBookingStore } from "@/stores/booking.store";
import { useGuestAuthStore } from "@/stores/auth.store";

export function ConfirmationPage() {
  const navigate = useUIStore((s) => s.navigate);
  const checkInDate = useBookingStore((s) => s.checkInDate);
  const checkOutDate = useBookingStore((s) => s.checkOutDate);
  const adults = useBookingStore((s) => s.adults);
  const children = useBookingStore((s) => s.children);
  const resetBooking = useBookingStore((s) => s.reset);
  const firstName = useGuestAuthStore((s) => s.firstName);
  const lastName = useGuestAuthStore((s) => s.lastName);
  const email = useGuestAuthStore((s) => s.email);

  // Guard: redirect if no booking data
  useEffect(() => {
    if (!checkInDate || !checkOutDate) navigate("/");
  }, [checkInDate, checkOutDate, navigate]);

  function nightCount(): number {
    if (!checkInDate || !checkOutDate) return 0;
    const diff = new Date(checkOutDate).getTime() - new Date(checkInDate).getTime();
    return Math.max(1, Math.round(diff / 86400000));
  }

  const nights = nightCount();

  function handleViewBookings() {
    resetBooking();
    navigate("/my-bookings");
  }

  function handleBackHome() {
    resetBooking();
    navigate("/");
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:py-20">
      <div className="rounded-xl border border-border bg-white p-8 text-center shadow-sm sm:p-10">
        {/* Success Checkmark */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
          <svg
            className="h-10 w-10 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-foreground">
          Booking Confirmed!
        </h1>
        <p className="mb-8 text-muted-foreground">
          Your reservation has been successfully created. A confirmation email
          will be sent to{" "}
          <span className="font-medium text-foreground">{email}</span>.
        </p>

        {/* Reservation Details */}
        <div className="mb-8 rounded-lg border border-border bg-muted/30 p-5 text-left">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Reservation Details
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Guest</dt>
              <dd className="font-medium text-foreground">
                {firstName} {lastName}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Check-in</dt>
              <dd className="font-medium text-foreground">
                {checkInDate
                  ? new Date(checkInDate + "T00:00:00").toLocaleDateString(
                      "en-ZA",
                      {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      },
                    )
                  : "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Check-out</dt>
              <dd className="font-medium text-foreground">
                {checkOutDate
                  ? new Date(checkOutDate + "T00:00:00").toLocaleDateString(
                      "en-ZA",
                      {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      },
                    )
                  : "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Duration</dt>
              <dd className="font-medium text-foreground">
                {nights} {nights === 1 ? "night" : "nights"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Guests</dt>
              <dd className="font-medium text-foreground">
                {adults} {adults === 1 ? "adult" : "adults"}
                {children > 0 &&
                  `, ${children} ${children === 1 ? "child" : "children"}`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  Confirmed
                </span>
              </dd>
            </div>
          </dl>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={handleViewBookings}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            View My Bookings
          </button>
          <button
            onClick={handleBackHome}
            className="rounded-lg border border-border bg-white px-6 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
