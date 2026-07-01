import { useEffect, useState } from "react";

import { useUIStore } from "@/stores/ui.store";
import { useBookingStore } from "@/stores/booking.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { getAllProperties, type PropertyInfo } from "@/services/property";
import { BrandMark } from "@/components/brand/logo";

const GALLERY = [
  { src: "/images/lodge/lodge-lounge.jpeg", label: "Lounge" },
  { src: "/images/lodge/chalet-exterior.jpeg", label: "Chalets" },
  { src: "/images/lodge/tented-camp-interior.jpeg", label: "Tented camp" },
  { src: "/images/lodge/bathroom.jpeg", label: "Suites" },
];

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

  const single = properties.length === 1 ? properties[0]! : null;
  const heroTitle = single ? single.name : "Find your place to disappear";

  return (
    <div className="flex flex-col">
      {/* ============================ HERO ============================ */}
      <section className="relative isolate flex flex-col sm:min-h-[88vh] sm:justify-center">
        {/* Background wrapper — overflow-hidden lives HERE so the scale-105
            image is clipped inside the hero, without clipping the search
            card that's translate-y-1/2'd below the section on desktop. */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <img
            src="/images/lodge/pool-sunset.jpeg"
            alt="Lodge pool at sunset"
            className="h-full w-full scale-105 object-cover"
          />
          <div className="hero-scrim absolute inset-0" />
        </div>

        <div className="mx-auto w-full max-w-6xl px-6 pb-8 pt-20 sm:pb-44 sm:pt-28">
          <div className="max-w-2xl animate-fade-up">
            <span className="eyebrow inline-flex items-center gap-2 text-leaf">
              <span className="h-px w-8 bg-leaf" />
              The Architecture of Escape
            </span>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] text-white sm:text-6xl md:text-7xl">
              {heroTitle}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/85">
              {single
                ? `Welcome to ${single.name}. Reserve your bush escape in a few unhurried clicks.`
                : "A collection of lodges, chalets and tented camps in the wild. Book direct for the best rate — confirmed in seconds."}
            </p>
          </div>
        </div>

        {/* ---- Search card ---- inline on mobile, floats on tablet+ */}
        <div className="relative z-20 mt-8 px-6 pb-10 sm:absolute sm:inset-x-0 sm:bottom-0 sm:mt-0 sm:translate-y-1/2 sm:pb-0">
          <div className="mx-auto max-w-5xl rounded-2xl border border-white/60 bg-surface/95 p-5 shadow-hero backdrop-blur-md sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.8fr_0.8fr_auto]">
              <Field label="Check-in" htmlFor="checkin">
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
                  className={fieldInput}
                />
              </Field>
              <Field label="Check-out" htmlFor="checkout">
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
                  className={fieldInput}
                />
              </Field>
              <Field label="Adults" htmlFor="adults">
                <select
                  id="adults"
                  value={adults}
                  onChange={(e) => setAdults(Number(e.target.value))}
                  className={fieldInput}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "Adult" : "Adults"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Children" htmlFor="children">
                <select
                  id="children"
                  value={children}
                  onChange={(e) => setChildren(Number(e.target.value))}
                  className={fieldInput}
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "Child" : "Children"}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex flex-col justify-end">
                <button
                  onClick={handleSearch}
                  className="flex h-[2.85rem] items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface active:scale-[0.98]"
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
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                  Search
                </button>
              </div>
            </div>
            {error && (
              <p className="mt-3 text-sm font-medium text-destructive">{error}</p>
            )}
          </div>
        </div>
      </section>

      {/* spacer for the overlapping search card — only when card is floating (sm+) */}
      <div className="hidden sm:block sm:h-24" />

      {/* ============================ LODGES ============================ */}
      {properties.length > 1 && (
        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <SectionHeading
            eyebrow="The Collection"
            title="Our lodges"
            subtitle="Each property has its own character — choose where your story begins."
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
              >
                <div className="relative h-48 overflow-hidden">
                  {p.imageUrls.length > 0 ? (
                    <img
                      src={p.imageUrls[0]}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="bg-placeholder flex h-full items-center justify-center">
                      <BrandMark className="h-12 w-12 opacity-40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-display text-xl font-semibold text-foreground transition-colors group-hover:text-primary">
                    {p.name}
                  </h3>
                  {p.address && (
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <svg
                        className="h-3.5 w-3.5 text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                        />
                      </svg>
                      {p.address}
                    </p>
                  )}
                  {p.description && (
                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                  {p.amenities.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {p.amenities.slice(0, 4).map((a) => (
                        <span
                          key={a}
                          className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-medium capitalize text-leaf-foreground"
                        >
                          {a.replace(/_/g, " ")}
                        </span>
                      ))}
                      {p.amenities.length > 4 && (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          +{p.amenities.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    View rooms
                    <span className="transition-transform duration-200 group-hover:translate-x-1">
                      &rarr;
                    </span>
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ============================ GALLERY BAND ============================ */}
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {GALLERY.map((g, i) => (
            <div key={g.src} className={galleryTile(i)}>
              <img
                src={g.src}
                alt={g.label}
                className="h-full w-full object-cover transition-transform duration-700 hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent" />
              <span className="absolute bottom-3 left-4 text-sm font-medium text-white drop-shadow">
                {g.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ============================ FEATURES ============================ */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
        <SectionHeading
          eyebrow="Why book direct"
          title="The ALGAFUSION promise"
          subtitle="No middlemen, no markups — just a calmer way to plan your time away."
          centered
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <FeatureCard
            tone="leaf"
            title="Best Rate Guarantee"
            description="Book directly with us for the lowest available rate. No hidden fees, no surprises."
            icon="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
          <FeatureCard
            tone="accent"
            title="Flexible Cancellation"
            description="Plans change. Enjoy free cancellation on most bookings up to 24 hours before check-in."
            icon="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
          <FeatureCard
            tone="primary"
            title="Instant Confirmation"
            description="Receive your booking confirmation immediately. Check in seamlessly upon arrival."
            icon="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
          />
        </div>
      </section>

      {/* ============================ CTA ============================ */}
      {!isAuthenticated && (
        <section className="mx-auto w-full max-w-6xl px-6 pb-8">
          <div className="bg-brand-gradient relative overflow-hidden rounded-3xl px-8 py-14 text-center shadow-card sm:px-12">
            <BrandMark
              tone="light"
              className="mx-auto mb-6 h-12 w-12 opacity-90"
            />
            <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">
              Already part of the escape?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-primary-foreground/80">
              Sign in to view your itinerary, download confirmations and manage
              your reservations.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="mt-8 rounded-full bg-accent px-8 py-3 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-lift active:scale-[0.98]"
            >
              Sign In
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

const fieldInput =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  centered,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <span className="eyebrow text-accent">{eyebrow}</span>
      <h2 className="mt-3 font-display text-3xl font-semibold text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}

const TONES = {
  leaf: "bg-leaf-soft text-leaf",
  accent: "bg-accent-soft text-accent",
  primary: "bg-primary/10 text-primary",
} as const;

function FeatureCard({
  title,
  description,
  icon,
  tone,
}: {
  title: string;
  description: string;
  icon: string;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="group flex flex-col rounded-2xl border border-border bg-surface p-7 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card">
      <div
        className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 ${TONES[tone]}`}
      >
        <svg
          className="h-7 w-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

/** First gallery tile spans two columns on large screens for rhythm. */
function galleryTile(i: number): string {
  const base =
    "group relative overflow-hidden rounded-2xl shadow-soft h-44 sm:h-56";
  return i === 0 ? `${base} lg:col-span-2 lg:h-auto` : base;
}
