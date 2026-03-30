import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { useBookingStore } from "@/stores/booking.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { checkAvailability, type AvailableRoomType } from "@/services/availability";
import { createBooking } from "@/services/booking";
import { guestLogin, guestRegister } from "@/services/auth";
import { formatCents, multiplyCents } from "@swiftpms/shared";

type AuthTab = "login" | "register";

export function BookingPage() {
  const navigate = useUIStore((s) => s.navigate);
  const checkInDate = useBookingStore((s) => s.checkInDate);
  const checkOutDate = useBookingStore((s) => s.checkOutDate);
  const adults = useBookingStore((s) => s.adults);
  const children = useBookingStore((s) => s.children);
  const selectedRoomTypeId = useBookingStore((s) => s.selectedRoomTypeId);

  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);
  const guestId = useGuestAuthStore((s) => s.guestId);
  const firstName = useGuestAuthStore((s) => s.firstName);
  const lastName = useGuestAuthStore((s) => s.lastName);
  const email = useGuestAuthStore((s) => s.email);

  const [roomType, setRoomType] = useState<AvailableRoomType | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [specialRequests, setSpecialRequests] = useState("");

  // Auth form state
  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFirstName, setAuthFirstName] = useState("");
  const [authLastName, setAuthLastName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (!checkInDate || !checkOutDate || !selectedRoomTypeId) {
      navigate("/rooms");
      return;
    }
    loadRoomType();
  }, [checkInDate, checkOutDate, selectedRoomTypeId]);

  async function loadRoomType() {
    if (!checkInDate || !checkOutDate || !selectedRoomTypeId) return;
    setLoading(true);
    try {
      const results = await checkAvailability(
        checkInDate,
        checkOutDate,
        selectedRoomTypeId,
      );
      const found = results.find((r) => r.id === selectedRoomTypeId);
      setRoomType(found ?? null);
    } catch {
      setError("Failed to load room details.");
    } finally {
      setLoading(false);
    }
  }

  function nightCount(): number {
    if (!checkInDate || !checkOutDate) return 0;
    const diff = new Date(checkOutDate).getTime() - new Date(checkInDate).getTime();
    return Math.max(1, Math.round(diff / 86400000));
  }

  // Track if user just authenticated so we can auto-confirm
  const [justAuthenticated, setJustAuthenticated] = useState(false);

  useEffect(() => {
    if (justAuthenticated && isAuthenticated && guestId && selectedRoomTypeId) {
      setJustAuthenticated(false);
      handleConfirmBooking();
    }
  }, [justAuthenticated, isAuthenticated, guestId]);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      if (authTab === "login") {
        await guestLogin(authEmail, authPassword);
      } else {
        await guestRegister(
          authFirstName,
          authLastName,
          authEmail,
          authPassword,
          authPhone || undefined,
        );
      }
      setJustAuthenticated(true);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Authentication failed.",
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleConfirmBooking() {
    if (!guestId || !selectedRoomTypeId || !checkInDate || !checkOutDate) return;
    setSubmitting(true);
    setError(null);
    try {
      await createBooking({
        guestId,
        roomTypeId: selectedRoomTypeId,
        checkInDate,
        checkOutDate,
        adults,
        children,
        specialRequests: specialRequests.trim() || undefined,
      });
      navigate("/confirmation");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create booking.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const nights = nightCount();
  const totalCents = roomType ? multiplyCents(roomType.baseRate, nights) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate("/rooms")}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
        Back to Rooms
      </button>

      <h1 className="mb-8 text-2xl font-bold text-foreground sm:text-3xl">
        Complete Your Booking
      </h1>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Room Info */}
          {roomType && (
            <div className="mb-6 rounded-xl border border-border bg-white p-5 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-foreground">
                {roomType.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {roomType.bedConfiguration} &middot; Up to{" "}
                {roomType.maxOccupancy} guests
              </p>
              {roomType.description && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {roomType.description}
                </p>
              )}
            </div>
          )}

          {/* Guest Details / Auth */}
          {isAuthenticated ? (
            <div className="mb-6 rounded-xl border border-border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Guest Details
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">
                    First Name
                  </label>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                    {firstName}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">
                    Last Name
                  </label>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                    {lastName}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">
                    Email
                  </label>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                    {email}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Sign in to continue
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Please log in or create an account to complete your booking.
              </p>

              {/* Auth Tabs */}
              <div className="mb-4 flex border-b border-border">
                <button
                  onClick={() => setAuthTab("login")}
                  className={cn(
                    "px-4 py-2 text-sm font-medium transition-colors",
                    authTab === "login"
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Login
                </button>
                <button
                  onClick={() => setAuthTab("register")}
                  className={cn(
                    "px-4 py-2 text-sm font-medium transition-colors",
                    authTab === "register"
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Register
                </button>
              </div>

              <form onSubmit={handleAuthSubmit}>
                {authTab === "register" && (
                  <div className="mb-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        First Name
                      </label>
                      <input
                        type="text"
                        required
                        value={authFirstName}
                        onChange={(e) => setAuthFirstName(e.target.value)}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Last Name
                      </label>
                      <input
                        type="text"
                        required
                        value={authLastName}
                        onChange={(e) => setAuthLastName(e.target.value)}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {authTab === "register" && (
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      Phone{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                )}

                {authError && (
                  <p className="mb-4 text-sm text-destructive">{authError}</p>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {authLoading
                    ? "Please wait..."
                    : authTab === "login"
                      ? "Sign In"
                      : "Create Account"}
                </button>
              </form>
            </div>
          )}

          {/* Special Requests */}
          {isAuthenticated && (
            <div className="mb-6 rounded-xl border border-border bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                Special Requests
              </h2>
              <textarea
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                rows={3}
                placeholder="Any special requests? (e.g., high floor, extra pillows, late check-in)"
                className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Special requests are subject to availability and cannot be
                guaranteed.
              </p>
            </div>
          )}
        </div>

        {/* Booking Summary Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-8 rounded-xl border border-border bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Booking Summary
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Check-in</span>
                <span className="font-medium text-foreground">
                  {checkInDate
                    ? new Date(checkInDate + "T00:00:00").toLocaleDateString(
                        "en-ZA",
                        { day: "numeric", month: "short", year: "numeric" },
                      )
                    : "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Check-out</span>
                <span className="font-medium text-foreground">
                  {checkOutDate
                    ? new Date(checkOutDate + "T00:00:00").toLocaleDateString(
                        "en-ZA",
                        { day: "numeric", month: "short", year: "numeric" },
                      )
                    : "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium text-foreground">
                  {nights} {nights === 1 ? "night" : "nights"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Guests</span>
                <span className="font-medium text-foreground">
                  {adults} {adults === 1 ? "adult" : "adults"}
                  {children > 0 &&
                    `, ${children} ${children === 1 ? "child" : "children"}`}
                </span>
              </div>

              <div className="border-t border-border pt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Room Type</span>
                  <span className="font-medium text-foreground">
                    {roomType?.name ?? "-"}
                  </span>
                </div>
              </div>

              {roomType && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {formatCents(roomType.baseRate)} x {nights}{" "}
                      {nights === 1 ? "night" : "nights"}
                    </span>
                    <span className="font-medium text-foreground">
                      {formatCents(totalCents)}
                    </span>
                  </div>

                  <div className="border-t border-border pt-3">
                    <div className="flex justify-between">
                      <span className="text-base font-semibold text-foreground">
                        Total
                      </span>
                      <span className="text-base font-bold text-primary">
                        {formatCents(totalCents)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {error && (
              <p className="mt-4 text-sm text-destructive">{error}</p>
            )}

            <button
              onClick={handleConfirmBooking}
              disabled={!isAuthenticated || submitting || !roomType}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Confirming..." : "Confirm Booking"}
            </button>

            {!isAuthenticated && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Please sign in to confirm your booking.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
