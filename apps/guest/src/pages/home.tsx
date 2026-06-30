import { useEffect, useState } from "react";

import { useUIStore } from "@/stores/ui.store";
import { useBookingStore } from "@/stores/booking.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { getAllProperties, type PropertyInfo } from "@/services/property";

export function HomePage() {
  const navigate = useUIStore((s) => s.navigate);
  const setDates = useBookingStore((s) => s.setDates);
  const setGuests = useBookingStore((s) => s.setGuests);
  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);

  const [properties, setProperties] = useState<PropertyInfo[]>([]);

  useEffect(() => {
    getAllProperties().then(setProperties).catch(() => {});
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
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
    setGuests(adults, children);
    navigate("/rooms");
  }

  const heroTitle = properties.length === 1
    ? properties[0]!.name
    : "Book Your Campsite";
  const heroSubtitle = properties.length === 1
    ? `Welcome to ${properties[0]!.name}. Book your stay in just a few clicks.`
    : "Discover our campsites and book your stay in just a few clicks.";

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section
        className="relative flex min-h-[520px] items-center justify-center bg-cover bg-center px-4 py-20"
        style={{ backgroundImage: "url('/images/lodge/pool-sunset.jpeg')" }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            {heroTitle}
          </h1>
          <p className="mb-10 text-lg text-white/90 sm:text-xl">
            {heroSubtitle}
          </p>

          {/* Search Card */}
          <div className="rounded-xl bg-white p-6 shadow-xl sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="checkin" className="text-left text-sm font-medium text-foreground">
                  Check-in
                </label>
                <input
                  id="checkin" type="date" value={checkIn} min={today}
                  onChange={(e) => {
                    setCheckIn(e.target.value);
                    if (e.target.value && checkOut && new Date(checkOut) <= new Date(e.target.value)) {
                      const next = new Date(e.target.value);
                      next.setDate(next.getDate() + 1);
                      setCheckOut(next.toISOString().split("T")[0]);
                    }
                  }}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="checkout" className="text-left text-sm font-medium text-foreground">
                  Check-out
                </label>
                <input
                  id="checkout" type="date" value={checkOut}
                  min={checkIn ? new Date(new Date(checkIn).getTime() + 86400000).toISOString().split("T")[0] : today}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="adults" className="text-left text-sm font-medium text-foreground">
                  Adults
                </label>
                <select
                  id="adults" value={adults}
                  onChange={(e) => setAdults(Number(e.target.value))}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n} {n === 1 ? "Adult" : "Adults"}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="children" className="text-left text-sm font-medium text-foreground">
                  Children
                </label>
                <select
                  id="children" value={children}
                  onChange={(e) => setChildren(Number(e.target.value))}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n} {n === 1 ? "Child" : "Children"}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <button
                  onClick={handleSearch}
                  className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  Check Availability
                </button>
              </div>
            </div>
            {error && <p className="mt-3 text-left text-sm text-destructive">{error}</p>}
          </div>
        </div>
      </section>

      {/* Campsites Section */}
      {properties.length > 1 && (
        <section className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="mb-8 text-center text-2xl font-bold text-foreground sm:text-3xl">
            Our Campsites
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  if (checkIn && checkOut) {
                    setDates(checkIn, checkOut);
                    setGuests(adults, children);
                  }
                  navigate("/rooms");
                }}
                className="group overflow-hidden rounded-xl border border-border bg-white text-left shadow-sm transition-all hover:shadow-lg"
              >
                <div className="h-40 overflow-hidden bg-gradient-to-br from-sky-100 to-cyan-50">
                  {p.imageUrls.length > 0 ? (
                    <img
                      src={p.imageUrls[0]}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <svg className="h-16 w-16 text-sky-200 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-foreground group-hover:text-primary">
                    {p.name}
                  </h3>
                  {p.address && (
                    <p className="mt-1 text-sm text-muted-foreground">{p.address}</p>
                  )}
                  {p.description && (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  {p.amenities.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {p.amenities.slice(0, 5).map((a) => (
                        <span key={a} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {a.replace("_", " ")}
                        </span>
                      ))}
                      {p.amenities.length > 5 && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          +{p.amenities.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
                  <p className="mt-3 text-sm font-medium text-primary">
                    View rooms &rarr;
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

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
              <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            }
          />
          <FeatureCard
            title="Flexible Cancellation"
            description="Plans change. Enjoy free cancellation on most bookings up to 24 hours before check-in."
            icon={
              <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            }
          />
          <FeatureCard
            title="Instant Confirmation"
            description="Receive your booking confirmation immediately. Check in seamlessly upon arrival."
            icon={
              <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
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
