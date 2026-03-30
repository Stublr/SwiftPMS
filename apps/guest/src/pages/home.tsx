import { useState } from "react";

import { useUIStore } from "@/stores/ui.store";
import { useBookingStore } from "@/stores/booking.store";
import { useGuestAuthStore } from "@/stores/auth.store";

export function HomePage() {
  const navigate = useUIStore((s) => s.navigate);
  const setDates = useBookingStore((s) => s.setDates);
  const setGuests = useBookingStore((s) => s.setGuests);
  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);
  const [adults, setAdults] = useState(1);
  const [error, setError] = useState<string | null>(null);

  function handleSearch() {
    if (!checkIn || !checkOut) {
      setError("Please select both check-in and check-out dates.");
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      setError("Check-out date must be after check-in date.");
      return;
    }
    setError(null);
    setDates(checkIn, checkOut);
    setGuests(adults, 0);
    navigate("/rooms");
  }

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative flex min-h-[520px] items-center justify-center bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-400 px-4 py-20">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            Book Your Perfect Stay
          </h1>
          <p className="mb-10 text-lg text-white/90 sm:text-xl">
            Discover comfort, luxury, and unforgettable experiences. Reserve
            your room in just a few clicks.
          </p>

          {/* Search Card */}
          <div className="rounded-xl bg-white p-6 shadow-xl sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Check-in */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="checkin"
                  className="text-left text-sm font-medium text-foreground"
                >
                  Check-in
                </label>
                <input
                  id="checkin"
                  type="date"
                  value={checkIn}
                  min={today}
                  onChange={(e) => {
                    setCheckIn(e.target.value);
                    if (
                      e.target.value &&
                      checkOut &&
                      new Date(checkOut) <= new Date(e.target.value)
                    ) {
                      const next = new Date(e.target.value);
                      next.setDate(next.getDate() + 1);
                      setCheckOut(next.toISOString().split("T")[0]);
                    }
                  }}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Check-out */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="checkout"
                  className="text-left text-sm font-medium text-foreground"
                >
                  Check-out
                </label>
                <input
                  id="checkout"
                  type="date"
                  value={checkOut}
                  min={
                    checkIn
                      ? new Date(new Date(checkIn).getTime() + 86400000)
                          .toISOString()
                          .split("T")[0]
                      : today
                  }
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Adults */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="adults"
                  className="text-left text-sm font-medium text-foreground"
                >
                  Guests
                </label>
                <select
                  id="adults"
                  value={adults}
                  onChange={(e) => setAdults(Number(e.target.value))}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "Adult" : "Adults"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Button */}
              <div className="flex flex-col justify-end">
                <button
                  onClick={handleSearch}
                  className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  Search Rooms
                </button>
              </div>
            </div>

            {error && (
              <p className="mt-3 text-left text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
        <h2 className="mb-12 text-center text-2xl font-bold text-foreground sm:text-3xl">
          Why Stay With Us
        </h2>
        <div className="grid gap-8 sm:grid-cols-3">
          <FeatureCard
            title="Best Rate Guarantee"
            description="Book directly with us for the lowest available rate. No hidden fees, no surprises."
            icon={
              <svg
                className="h-8 w-8 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            }
          />
          <FeatureCard
            title="Flexible Cancellation"
            description="Plans change. Enjoy free cancellation on most bookings up to 24 hours before check-in."
            icon={
              <svg
                className="h-8 w-8 text-primary"
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
            }
          />
          <FeatureCard
            title="Instant Confirmation"
            description="Receive your booking confirmation immediately. Check in seamlessly upon arrival."
            icon={
              <svg
                className="h-8 w-8 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                />
              </svg>
            }
          />
        </div>
      </section>

      {/* CTA Section */}
      {!isAuthenticated && (
        <section className="bg-muted px-4 py-16 text-center">
          <h2 className="mb-3 text-2xl font-bold text-foreground">
            Already have an account?
          </h2>
          <p className="mb-6 text-muted-foreground">
            Sign in to view your bookings and manage your reservations.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="rounded-lg border border-primary bg-white px-6 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Sign In
          </button>
        </section>
      )}
    </div>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-white p-6 text-center shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
