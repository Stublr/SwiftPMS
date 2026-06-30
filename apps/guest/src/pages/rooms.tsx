import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { useBookingStore } from "@/stores/booking.store";
import {
  checkAvailability,
  type AvailableRoomType,
} from "@/services/availability";
import { getAllProperties, type PropertyInfo } from "@/services/property";
import { formatCents } from "@swiftpms/shared";

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

  const [properties, setProperties] = useState<PropertyAvailability[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [localCheckIn, setLocalCheckIn] = useState(checkInDate ?? "");
  const [localCheckOut, setLocalCheckOut] = useState(checkOutDate ?? "");

  const today = new Date().toISOString().split("T")[0];
  const hasDates = !!checkInDate && !!checkOutDate;

  // Load all properties on mount
  useEffect(() => {
    getAllProperties()
      .then((props) => {
        setProperties(props.map((p) => ({ property: p, rooms: [], loading: false, error: null })));
      })
      .catch(() => {})
      .finally(() => setLoadingProps(false));
  }, []);

  // When dates or guest count change, fetch availability for all properties
  useEffect(() => {
    if (!hasDates || properties.length === 0) return;
    fetchAllAvailability(checkInDate, checkOutDate);
  }, [checkInDate, checkOutDate, totalGuests, properties.length]);

  async function fetchAllAvailability(ci: string, co: string) {
    setProperties((prev) =>
      prev.map((p) => ({ ...p, loading: true, error: null })),
    );

    for (const pa of properties) {
      try {
        const allRooms = await checkAvailability(ci, co, pa.property.id);
        // Filter to room types that can accommodate the total guest count
        const rooms = allRooms.filter((r) => r.maxOccupancy >= totalGuests);
        setProperties((prev) =>
          prev.map((p) =>
            p.property.id === pa.property.id
              ? { ...p, rooms, loading: false }
              : p,
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

  function handleBookNow(propertyId: string, roomTypeId: string) {
    setProperty(propertyId);
    setRoomType(roomTypeId);
    navigate("/booking");
  }

  function nightCount(ci: string, co: string): number {
    const diff = new Date(co).getTime() - new Date(ci).getTime();
    return Math.max(1, Math.round(diff / 86400000));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <button
        onClick={() => navigate("/")}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Search
      </button>

      <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
        Available Rooms
      </h1>

      {/* Date Bar */}
      {hasDates ? (
        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {new Date(checkInDate + "T00:00:00").toLocaleDateString("en-ZA", {
              weekday: "short", day: "numeric", month: "short", year: "numeric",
            })}
          </span>
          <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <span className="text-sm text-muted-foreground">
            {new Date(checkOutDate + "T00:00:00").toLocaleDateString("en-ZA", {
              weekday: "short", day: "numeric", month: "short", year: "numeric",
            })}
          </span>
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {nightCount(checkInDate, checkOutDate)} {nightCount(checkInDate, checkOutDate) === 1 ? "night" : "nights"}
          </span>
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {adults} {adults === 1 ? "guest" : "guests"}
          </span>
        </div>
      ) : (
        <div className="mb-8 rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm text-muted-foreground">
            Select your dates to see available rooms across all lodges.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Check-in</label>
              <input
                type="date" value={localCheckIn} min={today}
                onChange={(e) => setLocalCheckIn(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Check-out</label>
              <input
                type="date" value={localCheckOut}
                min={localCheckIn ? new Date(new Date(localCheckIn).getTime() + 86400000).toISOString().split("T")[0] : today}
                onChange={(e) => setLocalCheckOut(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              onClick={handleDateSearch}
              disabled={!localCheckIn || !localCheckOut}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Search
            </button>
          </div>
        </div>
      )}

      {loadingProps && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {/* Properties + Rooms */}
      {!loadingProps && properties.length === 0 && (
        <p className="text-center text-muted-foreground">No lodges available.</p>
      )}

      <div className="space-y-10">
        {properties.map(({ property, rooms, loading, error }) => (
          <div key={property.id}>
            {/* Lodge Header */}
            <div className="mb-4 border-b border-border pb-3">
              <h2 className="text-xl font-bold text-foreground">{property.name}</h2>
              {property.address && (
                <p className="mt-0.5 text-sm text-muted-foreground">{property.address}</p>
              )}
              {property.description && (
                <p className="mt-1 text-sm text-muted-foreground">{property.description}</p>
              )}
            </div>

            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {!loading && hasDates && rooms.filter((r) => r.available > 0).length === 0 && !error && (
              <p className="py-4 text-sm text-muted-foreground">
                No rooms available at this lodge for the selected dates.
              </p>
            )}

            {!hasDates && !loading && (
              <p className="py-4 text-sm text-muted-foreground">
                Select dates above to see availability.
              </p>
            )}

            <div className="grid gap-6">
              {rooms.filter((room) => room.available > 0).map((room) => (
                <RoomTypeCard
                  key={room.id}
                  room={room}
                  nights={hasDates ? nightCount(checkInDate, checkOutDate) : 1}
                  onBook={() => handleBookNow(property.id, room.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomTypeCard({
  room,
  nights,
  onBook,
}: {
  room: AvailableRoomType;
  nights: number;
  onBook: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col sm:flex-row">
        <div className="flex h-48 w-full items-center justify-center bg-gradient-to-br from-sky-100 to-cyan-50 sm:h-auto sm:w-64">
          {room.imageUrls.length > 0 ? (
            <img src={room.imageUrls[0]} alt={room.name} className="h-full w-full object-cover" />
          ) : (
            <svg className="h-16 w-16 text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
            </svg>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{room.name}</h3>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  room.available > 3 ? "bg-green-50 text-green-700"
                    : room.available > 0 ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700",
                )}
              >
                {room.available > 0 ? `${room.available} available` : "Sold out"}
              </span>
            </div>

            {room.description && (
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{room.description}</p>
            )}

            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                Up to {room.maxOccupancy} guests
              </span>
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
                {room.bedConfiguration}
              </span>
            </div>

            {room.amenities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {room.amenities.map((amenity) => (
                  <span key={amenity} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {amenity.replace("_", " ")}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
            <div>
              {room.tieredPricing ? (
                <>
                  <span className="text-2xl font-bold text-foreground">
                    {formatCents(room.tieredPricing.standard.baseRate)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {" "}per person / night
                  </span>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Children under {room.tieredPricing.childAgeMax + 1}:{" "}
                    {formatCents(room.tieredPricing.standard.extraChild)}/night •
                    High season rates apply on peak dates
                  </p>
                </>
              ) : (
                <>
                  <span className="text-2xl font-bold text-foreground">
                    {formatCents(room.baseRate)}
                  </span>
                  <span className="text-sm text-muted-foreground"> / night</span>
                  {nights > 1 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatCents(room.baseRate * nights)} total for {nights}{" "}
                      nights
                    </p>
                  )}
                </>
              )}
            </div>
            <button
              onClick={onBook}
              disabled={room.available === 0}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Book Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
