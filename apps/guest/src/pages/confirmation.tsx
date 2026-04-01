import { useEffect } from "react";
import { useUIStore } from "@/stores/ui.store";
import { useBookingStore } from "@/stores/booking.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { downloadBookingPdf } from "@/lib/booking-pdf";
import type { Reservation } from "@swiftpms/shared";

export function ConfirmationPage() {
  const navigate = useUIStore((s) => s.navigate);
  const checkInDate = useBookingStore((s) => s.checkInDate);
  const checkOutDate = useBookingStore((s) => s.checkOutDate);
  const adults = useBookingStore((s) => s.adults);
  const children = useBookingStore((s) => s.children);
  const selectedRoomTypeId = useBookingStore((s) => s.selectedRoomTypeId);
  const resetBooking = useBookingStore((s) => s.reset);
  const firstName = useGuestAuthStore((s) => s.firstName);
  const lastName = useGuestAuthStore((s) => s.lastName);
  const email = useGuestAuthStore((s) => s.email);
  const guestId = useGuestAuthStore((s) => s.guestId);

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

  function handleDownload() {
    if (!checkInDate || !checkOutDate) return;

    const mockReservation: Reservation = {
      id: `res_${Date.now().toString(36)}`,
      propertyId: "",
      guestId: guestId ?? "",
      roomId: null,
      roomTypeId: selectedRoomTypeId ?? "",
      checkInDate,
      checkOutDate,
      nightCount: nights,
      adults,
      children,
      status: "confirmed",
      roomRate: 0,
      totalRoomCharges: 0,
      specialRequests: null,
      source: "guest_portal",
      createdBy: "",
      checkedInAt: null,
      checkedInBy: null,
      checkedOutAt: null,
      checkedOutBy: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    downloadBookingPdf({
      reservation: mockReservation,
      guestName: `${firstName ?? ""} ${lastName ?? ""}`.trim() || "Guest",
      guestEmail: email ?? "",
    });
  }

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
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-6 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download Confirmation
          </button>
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
