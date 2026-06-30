import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";

import {
  ReservationStatus,
  formatCents,
  type Reservation,
} from "@swiftpms/shared";

import { db, functions } from "@/lib/firebase";
import { useAuthStore } from "@/stores/auth.store";
import { usePropertyStore } from "@/stores/property.store";
import { useUIStore } from "@/stores/ui.store";

interface CheckInTarget {
  reservationId: string;
  propertyId: string;
  tenantId: string;
}

function readQueryParams(): CheckInTarget | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const res = params.get("res");
  const p = params.get("p");
  const t = params.get("t");
  if (!res || !p || !t) return null;
  return { reservationId: res, propertyId: p, tenantId: t };
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

interface GuestData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  nationality?: string;
}

export function CheckInPage() {
  const navigate = useUIStore((s) => s.navigate);
  const propertyStore = usePropertyStore();
  const user = useAuthStore((s) => s.user);
  const [target, setTarget] = useState<CheckInTarget | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [guest, setGuest] = useState<GuestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    const t = readQueryParams();
    setTarget(t);
    if (!t) {
      setError("This URL is missing reservation parameters. Re-scan the QR code.");
      setLoading(false);
      return;
    }
    if (!user) {
      setError("Please sign in to view this reservation.");
      setLoading(false);
      return;
    }
    if (user.tenantId !== t.tenantId) {
      setError(
        `Reservation belongs to a different tenant (${t.tenantId}). Sign in with an account that has access.`,
      );
      setLoading(false);
      return;
    }

    // Auto-switch property store so subsequent pages (folio, room board) bind
    // to this reservation's property.
    if (propertyStore.propertyId !== t.propertyId) {
      propertyStore.setProperty(t.tenantId, t.propertyId, t.propertyId);
    }

    loadReservation(t);
  }, [user?.tenantId]);

  async function loadReservation(t: CheckInTarget) {
    setLoading(true);
    setError(null);
    try {
      const resRef = doc(
        db,
        `tenants/${t.tenantId}/properties/${t.propertyId}/reservations/${t.reservationId}`,
      );
      const snap = await getDoc(resRef);
      if (!snap.exists()) {
        setError(`Reservation ${t.reservationId} not found.`);
        return;
      }
      const r = { id: snap.id, ...snap.data() } as Reservation;
      setReservation(r);

      // Load guest details
      const guestSnap = await getDoc(
        doc(db, `tenants/${t.tenantId}/guests/${r.guestId}`),
      );
      if (guestSnap.exists()) {
        setGuest(guestSnap.data() as GuestData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reservation");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckIn() {
    if (!reservation) return;
    setCheckingIn(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "checkIn");
      await fn({
        reservationId: reservation.id,
        propertyId: reservation.propertyId,
      });
      // Reload to reflect new status
      if (target) await loadReservation(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setCheckingIn(false);
    }
  }

  // Validity calculation
  const today = todayIso();
  const validity = (() => {
    if (!reservation) return null;
    if (reservation.status === ReservationStatus.CANCELLED) {
      return { kind: "cancelled" as const };
    }
    if (reservation.status === ReservationStatus.NO_SHOW) {
      return { kind: "noShow" as const };
    }
    if (reservation.status === ReservationStatus.CHECKED_OUT) {
      return { kind: "checkedOut" as const };
    }
    if (today < reservation.checkInDate) {
      return { kind: "future" as const };
    }
    if (today >= reservation.checkOutDate) {
      return { kind: "expired" as const };
    }
    if (reservation.status === ReservationStatus.CHECKED_IN) {
      return { kind: "active" as const };
    }
    return { kind: "ready" as const };
  })();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">Booking Check-In</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Scanned from QR. Verify the booking, then check the guest in.
      </p>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {reservation && !loading && (
        <div className="rounded-lg border border-border bg-white shadow-sm">
          {/* Validity banner */}
          {validity?.kind === "cancelled" && (
            <div className="border-b border-border bg-red-50 px-6 py-3 text-sm font-semibold text-red-700">
              ❌ Booking cancelled — not valid
              {reservation.cancelReason ? ` (${reservation.cancelReason})` : ""}
            </div>
          )}
          {validity?.kind === "noShow" && (
            <div className="border-b border-border bg-red-50 px-6 py-3 text-sm font-semibold text-red-700">
              ❌ Marked as no-show — not valid
            </div>
          )}
          {validity?.kind === "checkedOut" && (
            <div className="border-b border-border bg-gray-50 px-6 py-3 text-sm font-semibold text-gray-700">
              ✓ Already checked out
            </div>
          )}
          {validity?.kind === "expired" && (
            <div className="border-b border-border bg-red-50 px-6 py-3 text-sm font-semibold text-red-700">
              ❌ Booking expired (check-out was {reservation.checkOutDate})
            </div>
          )}
          {validity?.kind === "future" && (
            <div className="border-b border-border bg-blue-50 px-6 py-3 text-sm font-semibold text-blue-800">
              ⏳ Booking is for {reservation.checkInDate} — too early to check in
            </div>
          )}
          {validity?.kind === "ready" && (
            <div className="border-b border-border bg-green-50 px-6 py-3 text-sm font-semibold text-green-800">
              ✓ Valid booking — ready to check in
            </div>
          )}
          {validity?.kind === "active" && (
            <div className="border-b border-border bg-green-50 px-6 py-3 text-sm font-semibold text-green-800">
              ✓ Currently checked in — valid until {reservation.checkOutDate}
            </div>
          )}

          {/* Reservation details */}
          <div className="space-y-3 p-6 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Guest
                </div>
                <div className="font-medium">
                  {guest
                    ? `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() ||
                      "(no name)"
                    : reservation.guestId}
                </div>
                {guest?.email && (
                  <div className="text-xs text-muted-foreground">{guest.email}</div>
                )}
                {guest?.phone && (
                  <div className="text-xs text-muted-foreground">{guest.phone}</div>
                )}
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Reference
                </div>
                <div className="font-mono text-xs">{reservation.id}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Check-in
                </div>
                <div className="font-medium">{reservation.checkInDate}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Check-out
                </div>
                <div className="font-medium">{reservation.checkOutDate}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Nights
                </div>
                <div className="font-medium">{reservation.nightCount}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Guests
                </div>
                <div className="font-medium">
                  {reservation.adults} adult{reservation.adults !== 1 ? "s" : ""}
                  {reservation.children > 0
                    ? `, ${reservation.children} child${reservation.children !== 1 ? "ren" : ""}`
                    : ""}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Total</div>
                <div className="font-medium">
                  {formatCents(reservation.totalRoomCharges)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Status
                </div>
                <div className="font-medium capitalize">{reservation.status}</div>
              </div>
            </div>

            {reservation.specialRequests && (
              <div className="rounded bg-amber-50 p-3 text-xs">
                <strong>Special requests:</strong> {reservation.specialRequests}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {validity?.kind === "ready" && (
                <button
                  onClick={handleCheckIn}
                  disabled={checkingIn}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {checkingIn ? "Checking in…" : "Check In Guest"}
                </button>
              )}
              <button
                onClick={() => {
                  // Strip query string + go to dashboard
                  window.history.replaceState({}, "", "/");
                  navigate("/");
                }}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
