import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { useBookingStore, type GroupBookingItem } from "@/stores/booking.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import {
  checkAvailability,
  type AvailableRoomType,
} from "@/services/availability";
import { getAllProperties, type PropertyInfo } from "@/services/property";
import { getTourOperatorStatus } from "@/services/tour-operators";
import { BrandMark } from "@/components/brand/logo";
import { formatCents, resolveStayPricing } from "@swiftpms/shared";
import type { PricingTier } from "@swiftpms/shared";

interface PropertyAvailability {
  property: PropertyInfo;
  rooms: AvailableRoomType[];
  loading: boolean;
  error: string | null;
}

export function RoomsPage() {
  const navigate = useUIStore((s) => s.navigate);
  const checkInDate = useBookingStore((s) => s.checkInDate);
  const checkOutDate = useBookingStore((s) => s.checkOutDate);
  const adults = useBookingStore((s) => s.adults);
  const children = useBookingStore((s) => s.children);
  const totalGuests = adults + children;
  const setDates = useBookingStore((s) => s.setDates);
  const setRoomType = useBookingStore((s) => s.setRoomType);
  const setProperty = useBookingStore((s) => s.setProperty);
  const setGroupItems = useBookingStore((s) => s.setGroupItems);
  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);

  const [properties, setProperties] = useState<PropertyAvailability[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [localCheckIn, setLocalCheckIn] = useState(checkInDate ?? "");
  const [localCheckOut, setLocalCheckOut] = useState(checkOutDate ?? "");
  const [operatorStatus, setOperatorStatus] = useState<{
    isTourOperator: boolean;
    discountPercent: number;
  }>({ isTourOperator: false, discountPercent: 0 });

  const today = new Date().toISOString().split("T")[0];
  const hasDates = !!checkInDate && !!checkOutDate;

  useEffect(() => {
    getAllProperties()
      .then((props) => {
        setProperties(
          props.map((p) => ({ property: p, rooms: [], loading: false, error: null })),
        );
      })
      .catch(() => {})
      .finally(() => setLoadingProps(false));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setOperatorStatus({ isTourOperator: false, discountPercent: 0 });
      return;
    }
    getTourOperatorStatus()
      .then(setOperatorStatus)
      .catch(() => setOperatorStatus({ isTourOperator: false, discountPercent: 0 }));
  }, [isAuthenticated]);

  useEffect(() => {
    if (!hasDates || properties.length === 0) return;
    fetchAllAvailability(checkInDate, checkOutDate);
  }, [checkInDate, checkOutDate, totalGuests, properties.length]);

  async function fetchAllAvailability(ci: string, co: string) {
    setProperties((prev) => prev.map((p) => ({ ...p, loading: true, error: null })));

    for (const pa of properties) {
      try {
        // Keep ALL room types visible even when a single site can't fit the
        // group — the card will suggest a multi-site booking instead. Only
        // hide room types with zero total inventory available.
        const rooms = await checkAvailability(ci, co, pa.property.id);
        setProperties((prev) =>
          prev.map((p) =>
            p.property.id === pa.property.id ? { ...p, rooms, loading: false } : p,
          ),
        );
      } catch {
        setProperties((prev) =>
          prev.map((p) =>
            p.property.id === pa.property.id
              ? { ...p, rooms: [], loading: false, error: "Failed to load" }
              : p,
          ),
        );
      }
    }
  }

  function handleDateSearch() {
    if (!localCheckIn || !localCheckOut) return;
    if (new Date(localCheckOut) <= new Date(localCheckIn)) return;
    setDates(localCheckIn, localCheckOut);
  }

  function handleBookNow(
    propertyId: string,
    room: AvailableRoomType,
    quantity: number,
  ) {
    setProperty(propertyId);
    setRoomType(room.id);
    if (quantity <= 1) {
      // Legacy solo flow — leave groupItems null.
      setGroupItems(null);
    } else {
      setGroupItems(
        splitGroupItems(
          room,
          quantity,
          adults,
          children,
          checkInDate,
          checkOutDate,
          operatorStatus.discountPercent,
        ),
      );
    }
    navigate("/booking");
  }

  function nightCount(ci: string, co: string): number {
    const diff = new Date(co).getTime() - new Date(ci).getTime();
    return Math.max(1, Math.round(diff / 86400000));
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <button
        onClick={() => navigate("/")}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Search
      </button>

      <span className="eyebrow text-accent">Availability</span>
      <h1 className="mt-2 font-display text-3xl font-semibold text-foreground sm:text-4xl">
        Choose your room
      </h1>

      {/* Date Bar */}
      {hasDates ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-4 shadow-soft">
          <DateChip
            label={new Date(checkInDate + "T00:00:00").toLocaleDateString("en-ZA", {
              weekday: "short", day: "numeric", month: "short", year: "numeric",
            })}
          />
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <DateChip
            label={new Date(checkOutDate + "T00:00:00").toLocaleDateString("en-ZA", {
              weekday: "short", day: "numeric", month: "short", year: "numeric",
            })}
          />
          <span className="ml-auto flex flex-wrap gap-2">
            <Pill>
              {nightCount(checkInDate, checkOutDate)}{" "}
              {nightCount(checkInDate, checkOutDate) === 1 ? "night" : "nights"}
            </Pill>
            <Pill>{adults + children} {adults + children === 1 ? "guest" : "guests"}</Pill>
          </span>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-soft">
          <p className="mb-4 text-sm text-muted-foreground">
            Select your dates to see available rooms across all lodges.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Check-in</label>
              <input
                type="date" value={localCheckIn} min={today}
                onChange={(e) => setLocalCheckIn(e.target.value)}
                className={fieldInput}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Check-out</label>
              <input
                type="date" value={localCheckOut}
                min={localCheckIn ? new Date(new Date(localCheckIn).getTime() + 86400000).toISOString().split("T")[0] : today}
                onChange={(e) => setLocalCheckOut(e.target.value)}
                className={fieldInput}
              />
            </div>
            <button
              onClick={handleDateSearch}
              disabled={!localCheckIn || !localCheckOut}
              className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card disabled:opacity-50"
            >
              Search
            </button>
          </div>
        </div>
      )}

      {loadingProps && (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      )}

      {!loadingProps && properties.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">No lodges available.</p>
      )}

      <div className="mt-10 space-y-14">
        {properties.map(({ property, rooms, loading, error }) => (
          <div key={property.id}>
            <div className="mb-6 flex items-end justify-between border-b border-border pb-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  {property.name}
                </h2>
                {property.address && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    {property.address}
                  </p>
                )}
              </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-10">
                <Spinner />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {!loading && hasDates && rooms.filter((r) => r.available > 0).length === 0 && !error && (
              <EmptyNote>No rooms available at this lodge for the selected dates.</EmptyNote>
            )}

            {!hasDates && !loading && (
              <EmptyNote>Select dates above to see availability.</EmptyNote>
            )}

            <div className="grid gap-6">
              {rooms.filter((room) => room.available > 0).map((room) => (
                <RoomTypeCard
                  key={room.id}
                  room={room}
                  nights={hasDates ? nightCount(checkInDate, checkOutDate) : 1}
                  totalGuests={totalGuests}
                  checkInDate={checkInDate}
                  checkOutDate={checkOutDate}
                  adults={adults}
                  children={children}
                  discountPercent={operatorStatus.discountPercent}
                  onBook={(qty) => handleBookNow(property.id, room, qty)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Multi-site: distribute total adults + children evenly across N sites, then
// price each site through resolveStayPricing so rate periods AND the tour
// operator discount flow into the per-site totals (these feed the booking
// store, the confirmation page, and the group PDF).
function splitGroupItems(
  room: AvailableRoomType,
  quantity: number,
  adults: number,
  children: number,
  checkInDate: string | null,
  checkOutDate: string | null,
  discountPercent: number,
): GroupBookingItem[] {
  const items: GroupBookingItem[] = [];
  for (let i = 0; i < quantity; i++) {
    const a = Math.floor(adults / quantity) + (i < adults % quantity ? 1 : 0);
    const c = Math.floor(children / quantity) + (i < children % quantity ? 1 : 0);
    const perSiteAdults = Math.max(1, a);
    const perSiteChildren = c;
    let perSiteTotal = 0;
    if (checkInDate && checkOutDate) {
      perSiteTotal = resolveStayPricing(
        {
          baseRate: room.baseRate,
          tieredPricing: room.tieredPricing ?? undefined,
          ratePeriods: room.ratePeriods ?? undefined,
        },
        checkInDate,
        checkOutDate,
        perSiteAdults,
        perSiteChildren,
        0,
        discountPercent,
      ).total;
    }
    items.push({
      roomTypeId: room.id,
      roomTypeName: room.name,
      adults: perSiteAdults,
      children: perSiteChildren,
      totalRoomCharges: perSiteTotal,
    });
  }
  return items;
}

const fieldInput =
  "rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

function Spinner() {
  return <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />;
}

function DateChip({ label }: { label: string }) {
  return <span className="text-sm font-medium text-foreground">{label}</span>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
      {children}
    </span>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-5 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function RoomTypeCard({
  room,
  nights,
  totalGuests,
  checkInDate,
  checkOutDate,
  adults,
  children,
  discountPercent,
  onBook,
}: {
  room: AvailableRoomType;
  nights: number;
  totalGuests: number;
  checkInDate: string | null;
  checkOutDate: string | null;
  adults: number;
  children: number;
  discountPercent: number;
  onBook: (quantity: number) => void;
}) {
  // Auto-suggest a multi-site booking when the group is too big for one site.
  // Cap at available inventory. Also cap at 5 sites — beyond that they'd
  // more likely want to talk to us directly.
  const suggestedQty = Math.max(
    1,
    Math.min(
      room.available,
      5,
      totalGuests > 0 && room.maxOccupancy > 0
        ? Math.ceil(totalGuests / room.maxOccupancy)
        : 1,
    ),
  );
  const [quantity, setQuantity] = useState<number>(suggestedQty);
  // Sync quantity down if the auto-suggest changes (e.g. guest count changes).
  useEffect(() => {
    setQuantity(suggestedQty);
  }, [suggestedQty]);
  const maxQty = Math.min(room.available, 5);
  const showGroupHint = suggestedQty > 1;
  // Mirror resolveStayPricing's rate resolution for the headline rate card:
  // an active rate period overrides (tier or flat), else standard tier / flat.
  const activePeriod = checkInDate
    ? (room.ratePeriods ?? []).find(
        (p) => checkInDate >= p.start && checkInDate <= p.end,
      )
    : undefined;
  // The tiered card only takes over from the flat rate once its effectiveFrom
  // cutover is reached for the selected check-in (mirrors resolveStayPricing).
  const tieredInEffect =
    !!room.tieredPricing &&
    (!room.tieredPricing.effectiveFrom ||
      (!!checkInDate && checkInDate >= room.tieredPricing.effectiveFrom));
  const displayTier: PricingTier | null = activePeriod
    ? (activePeriod.tier ?? null)
    : (tieredInEffect ? (room.tieredPricing?.standard ?? null) : null);
  const displayFlatRate = displayTier
    ? null
    : (activePeriod?.baseRate ?? room.baseRate);
  const disc = (v: number) =>
    discountPercent > 0 ? Math.round((v * (100 - discountPercent)) / 100) : v;
  const groupTotalEstimate =
    checkInDate && checkOutDate
      ? splitGroupItems(
          room,
          quantity,
          adults,
          children,
          checkInDate,
          checkOutDate,
          discountPercent,
        ).reduce((sum, it) => sum + it.totalRoomCharges, 0)
      : (displayTier?.baseRate ?? room.baseRate) * nights * quantity;
  const calc =
    checkInDate && checkOutDate
      ? resolveStayPricing(
          {
            baseRate: room.baseRate,
            tieredPricing: room.tieredPricing ?? undefined,
            ratePeriods: room.ratePeriods ?? undefined,
          },
          checkInDate,
          checkOutDate,
          adults,
          children,
          0,
          discountPercent,
        )
      : null;

  const badge =
    room.available > 3
      ? "bg-leaf-soft text-leaf-foreground"
      : room.available > 0
        ? "bg-accent-soft text-accent-dark"
        : "bg-destructive/10 text-destructive";

  return (
    <div className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex flex-col sm:flex-row">
        <div className="relative h-52 w-full overflow-hidden sm:h-auto sm:w-72">
          {room.imageUrls.length > 0 ? (
            <img
              src={room.imageUrls[0]}
              alt={room.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="bg-placeholder flex h-full min-h-52 items-center justify-center">
              <BrandMark className="h-12 w-12 opacity-40" />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-between p-6">
          <div>
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="font-display text-xl font-semibold text-foreground">{room.name}</h3>
              <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", badge)}>
                {room.available > 0 ? `${room.available} left` : "Sold out"}
              </span>
            </div>

            {room.description && (
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{room.description}</p>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                Up to {room.maxOccupancy} guests
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
                {room.bedConfiguration}
              </span>
            </div>

            {room.amenities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {room.amenities.map((amenity) => (
                  <span key={amenity} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                    {amenity.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Auto-suggest banner: group too big for a single site → recommend multiple. */}
          {showGroupHint && (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent-soft/50 p-3 text-sm text-accent-dark">
              <p className="font-medium">
                Your group of {totalGuests} won't fit one site (max {room.maxOccupancy}).
              </p>
              <p className="mt-0.5 text-xs">
                We've suggested {suggestedQty} sites — guests split evenly across them. One payment, one confirmation.
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {displayTier ? (
                <>
                  {discountPercent > 0 && (
                    <span className="mr-2 text-base text-muted-foreground/60 line-through">
                      {formatCents(displayTier.baseRate)}
                    </span>
                  )}
                  <span className="font-display text-2xl font-semibold text-foreground">
                    {formatCents(disc(displayTier.baseRate))}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {" "}/ night per site ({displayTier.basePersonCount}{" "}
                    {displayTier.basePersonCount === 1
                      ? "person"
                      : "people"}{" "}
                    included)
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Each extra adult{" "}
                    {formatCents(disc(displayTier.extraAdult))}/night
                    {room.tieredPricing && (
                      <>
                        {" · "}children under{" "}
                        {room.tieredPricing.childAgeMax + 1}{" "}
                        {formatCents(disc(displayTier.extraChild))}/night
                      </>
                    )}
                  </p>
                  {!activePeriod && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      High season rates apply on public holidays, school holidays and long weekends.
                    </p>
                  )}
                </>
              ) : (
                <>
                  {discountPercent > 0 && (
                    <span className="mr-2 text-base text-muted-foreground/60 line-through">
                      {formatCents(displayFlatRate ?? room.baseRate)}
                    </span>
                  )}
                  <span className="font-display text-2xl font-semibold text-foreground">
                    {formatCents(disc(displayFlatRate ?? room.baseRate))}
                  </span>
                  <span className="text-sm text-muted-foreground"> / night per site</span>
                </>
              )}
              {calc && nights > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {discountPercent > 0 && (
                    <span className="mr-1.5 text-muted-foreground/60 line-through">
                      {formatCents(calc.grossTotal)}
                    </span>
                  )}
                  {formatCents(calc.total)} per site for {nights} night{nights !== 1 ? "s" : ""}
                  {discountPercent > 0 && (
                    <span className="ml-1.5 rounded-full bg-leaf-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-leaf-foreground">
                      Tour operator rate
                    </span>
                  )}
                </p>
              )}
              {quantity > 1 && (
                <p className="mt-1 text-xs font-medium text-accent-dark">
                  Group estimate: {formatCents(groupTotalEstimate)} for {quantity} sites × {nights} night{nights !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Quantity picker — only show >1 option when there's inventory for it. */}
              {maxQty > 1 && (
                <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
                  <span className="text-xs font-medium uppercase text-muted-foreground">Sites</span>
                  <select
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="bg-transparent text-sm font-semibold text-foreground focus:outline-none"
                  >
                    {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                onClick={() => onBook(quantity)}
                disabled={room.available === 0}
                className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50"
              >
                {quantity > 1 ? `Book ${quantity} Sites` : "Book Now"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
