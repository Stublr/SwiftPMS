import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/ui.store";
import { useBookingStore } from "@/stores/booking.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { getPropertyInfo, getRoomTypeName, type PropertyInfo } from "@/services/property";
import { downloadBookingPdf } from "@/lib/booking-pdf";
import type { Reservation } from "@swiftpms/shared";

export function ConfirmationPage() {
  const navigate = useUIStore((s) => s.navigate);
  const checkInDate = useBookingStore((s) => s.checkInDate);
  const checkOutDate = useBookingStore((s) => s.checkOutDate);
  const adults = useBookingStore((s) => s.adults);
  const children = useBookingStore((s) => s.children);
  const selectedPropertyId = useBookingStore((s) => s.selectedPropertyId);
  const selectedRoomTypeId = useBookingStore((s) => s.selectedRoomTypeId);
  const bookingResult = useBookingStore((s) => s.result);
  const resetBooking = useBookingStore((s) => s.reset);
  const firstName = useGuestAuthStore((s) => s.firstName);
  const lastName = useGuestAuthStore((s) => s.lastName);
  const email = useGuestAuthStore((s) => s.email);
  const guestId = useGuestAuthStore((s) => s.guestId);

  const [propInfo, setPropInfo] = useState<PropertyInfo | null>(null);
  const [rtName, setRtName] = useState<string>("");

  // Guard: redirect if no booking data
  useEffect(() => {
    if (!checkInDate || !checkOutDate) navigate("/");
  }, [checkInDate, checkOutDate, navigate]);

  // Load property and room type info for the download
  useEffect(() => {
    if (selectedPropertyId) {
      getPropertyInfo(selectedPropertyId).then(setPropInfo).catch(() => {});
    }
    if (selectedRoomTypeId) {
      getRoomTypeName(selectedRoomTypeId).then(setRtName).catch(() => {});
    }
  }, [selectedPropertyId, selectedRoomTypeId]);

  function nightCount(): number {
    if (!checkInDate || !checkOutDate) return 0;
    const diff = new Date(checkOutDate).getTime() - new Date(checkInDate).getTime();
    return Math.max(1, Math.round(diff / 86400000));
  }

  const nights = nightCount();

  function handleDownload() {
    if (!checkInDate || !checkOutDate) return;

    const reservation: Reservation = {
      id: bookingResult?.reservationId ?? `res_${Date.now().toString(36)}`,
      propertyId: selectedPropertyId ?? "",
      guestId: guestId ?? "",
      roomId: null,
      roomTypeId: selectedRoomTypeId ?? "",
      checkInDate,
      checkOutDate,
      nightCount: bookingResult?.nightCount ?? nights,
      adults,
      children,
      status: "confirmed",
      roomRate: bookingResult?.roomRate ?? 0,
      totalRoomCharges: bookingResult?.totalRoomCharges ?? 0,
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
      reservation,
      guestName: `${firstName ?? ""} ${lastName ?? ""}`.trim() || "Guest",
      guestEmail: email ?? "",
      propertyName: propInfo?.name,
      propertyAddress: propInfo?.address ?? undefined,
      propertyPhone: propInfo?.phone ?? undefined,
      propertyEmail: propInfo?.email ?? undefined,
      roomTypeName: rtName || undefined,
      amenities: propInfo?.amenities,
      checkInTime: propInfo?.checkInTime,
      checkOutTime: propInfo?.checkOutTime,
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
    <div className="mx-auto max-w-xl px-6 py-14 sm:py-20">
      <div className="overflow-hidden rounded-3xl border border-border bg-surface text-center shadow-card">
        {/* Success header band */}
        <div className="bg-leaf-gradient px-8 pb-10 pt-12">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/20 backdrop-blur-sm">
            <svg
              className="h-10 w-10 text-white"
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
          <h1 className="font-display text-3xl font-semibold text-white">
            Booking confirmed
          </h1>
        </div>

        <div className="p-8 sm:p-10">
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
                <span className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-semibold text-leaf-foreground">
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
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download
          </button>
          <button
            onClick={handleViewBookings}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card"
          >
            View My Bookings
          </button>
          <button
            onClick={handleBackHome}
            className="rounded-xl border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Back to Home
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
