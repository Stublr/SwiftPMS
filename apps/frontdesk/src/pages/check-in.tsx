import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";

import {
  ReservationStatus,
  UserRole,
  formatCents,
  type Reservation,
} from "@swiftpms/shared";

import { db, functions } from "@/lib/firebase";
import { checkOutReservation } from "@/services/reservations";
import { useAuthStore } from "@/stores/auth.store";
import { usePropertyStore } from "@/stores/property.store";
import { useUIStore } from "@/stores/ui.store";

interface CheckInTarget {
  reservationId: string;
  propertyId: string;
  tenantId: string;
}

/**
 * Read check-in params from the URL. Only the reservation id (`res`) is
 * required — property (`p`) and tenant (`t`) are optional and fall back to
 * the currently-selected property + logged-in user's tenant. This lets the
 * manual-entry fallback in scan.tsx and simple ID-only QR codes work.
 */
function readQueryParams(
  fallbackTenantId: string | null,
  fallbackPropertyId: string | null,
): CheckInTarget | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const res = params.get("res");
  const p = params.get("p") ?? fallbackPropertyId;
  const t = params.get("t") ?? fallbackTenantId;
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
  const [checkingOut, setCheckingOut] = useState(false);
  // Group booking siblings (empty for solo bookings).
  const [groupSiblings, setGroupSiblings] = useState<Reservation[]>([]);
  const [bulkCheckIn, setBulkCheckIn] = useState<{
    running: boolean;
    done: number;
    total: number;
    failures: string[];
  } | null>(null);

  useEffect(() => {
    const t = readQueryParams(
      user?.tenantId ?? null,
      propertyStore.propertyId ?? null,
    );
    setTarget(t);
    if (!t) {
      setError("That QR code didn't include a booking. Scan again, or enter the booking ID manually below.");
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
        setError("No booking found for that QR. It may have been cancelled, or belong to a different property. Check the guest's confirmation email.");
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

      // Group booking: fetch sibling reservations sharing the same groupId.
      // Firestore auto-indexes single-field equality so no composite index needed.
      if (r.groupId) {
        try {
          const q = query(
            collection(
              db,
              `tenants/${t.tenantId}/properties/${t.propertyId}/reservations`,
            ),
            where("groupId", "==", r.groupId),
          );
          const groupSnap = await getDocs(q);
          const sibs = groupSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Reservation)
            // Sort so the primary reservation shows first, others in id order.
            .sort((a, b) => (a.id === r.id ? -1 : b.id === r.id ? 1 : a.id.localeCompare(b.id)));
          setGroupSiblings(sibs);
        } catch (groupErr) {
          console.warn("Failed to load group siblings", groupErr);
          setGroupSiblings([]);
        }
      } else {
        setGroupSiblings([]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't load that booking (${err.message}). Check your connection and try again.`
          : "Couldn't load that booking. Check your connection and try again.",
      );
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

  async function handleCheckOut() {
    if (!reservation) return;
    setCheckingOut(true);
    setError(null);
    try {
      await checkOutReservation(reservation.id);
      // Reload to reflect new status
      if (target) await loadReservation(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-out failed");
    } finally {
      setCheckingOut(false);
    }
  }

  /**
   * Check in every "confirmed" sibling in the group booking. Already-checked-in
   * sites are skipped. Each call is independent — a failure on one doesn't
   * block the rest, but we surface the count of failures at the end.
   */
  async function handleCheckInAllGroup() {
    if (!target || groupSiblings.length === 0) return;
    const toCheckIn = groupSiblings.filter(
      (r) => r.status === ReservationStatus.CONFIRMED,
    );
    if (toCheckIn.length === 0) return;
    setBulkCheckIn({ running: true, done: 0, total: toCheckIn.length, failures: [] });
    setError(null);
    const fn = httpsCallable(functions, "checkIn");
    let done = 0;
    const failures: string[] = [];
    for (const res of toCheckIn) {
      try {
        await fn({ reservationId: res.id, propertyId: res.propertyId });
      } catch (err) {
        failures.push(
          `${res.id.slice(0, 8).toUpperCase()}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
      done += 1;
      setBulkCheckIn({ running: true, done, total: toCheckIn.length, failures });
    }
    setBulkCheckIn({ running: false, done, total: toCheckIn.length, failures });
    await loadReservation(target);
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

            {/* Group booking panel — only visible when this reservation is
                part of a multi-site group. Lists sibling sites + offers a
                one-click check-in for the whole group. */}
            {groupSiblings.length > 1 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-primary">
                    Part of a {groupSiblings.length}-site group booking
                  </div>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 font-mono text-[10px] text-primary">
                    #{(reservation.groupId ?? "").slice(-6).toUpperCase()}
                  </span>
                </div>
                <ul className="mb-3 space-y-1.5 text-xs">
                  {groupSiblings.map((sib, i) => (
                    <li
                      key={sib.id}
                      className={`flex items-center justify-between rounded-md px-2.5 py-1.5 ${
                        sib.id === reservation.id
                          ? "bg-primary/10 font-semibold text-primary"
                          : "bg-white text-foreground"
                      }`}
                    >
                      <span>
                        Site {i + 1}
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                          #{sib.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className="ml-2 text-muted-foreground">
                          {sib.adults} adult{sib.adults !== 1 ? "s" : ""}
                          {sib.children > 0
                            ? `, ${sib.children} kid${sib.children !== 1 ? "s" : ""}`
                            : ""}
                        </span>
                      </span>
                      <span className="capitalize text-muted-foreground">
                        {sib.status.replace("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
                {groupSiblings.some((s) => s.status === ReservationStatus.CONFIRMED) && (
                  <button
                    onClick={handleCheckInAllGroup}
                    disabled={bulkCheckIn?.running}
                    className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {bulkCheckIn?.running
                      ? `Checking in… ${bulkCheckIn.done}/${bulkCheckIn.total}`
                      : `Check In All ${
                          groupSiblings.filter((s) => s.status === ReservationStatus.CONFIRMED).length
                        } Ready Sites`}
                  </button>
                )}
                {bulkCheckIn && !bulkCheckIn.running && bulkCheckIn.done > 0 && (
                  <div className="mt-2 text-xs">
                    {bulkCheckIn.failures.length === 0 ? (
                      <span className="text-green-700">
                        ✓ Checked in {bulkCheckIn.done} site
                        {bulkCheckIn.done !== 1 ? "s" : ""}.
                      </span>
                    ) : (
                      <div className="rounded bg-red-50 p-2 text-red-700">
                        {bulkCheckIn.done - bulkCheckIn.failures.length} succeeded,{" "}
                        {bulkCheckIn.failures.length} failed:
                        <ul className="mt-1 list-disc pl-4">
                          {bulkCheckIn.failures.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
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
                  {checkingIn
                    ? "Checking in…"
                    : groupSiblings.length > 1
                      ? "Check In This Site Only"
                      : "Check In Guest"}
                </button>
              )}
              {/* Status-gated (not validity.kind) — an overstaying guest shows
                  validity.kind "expired" but is still checked_in and must
                  remain checkoutable. */}
              {reservation.status === ReservationStatus.CHECKED_IN && (
                <button
                  onClick={handleCheckOut}
                  disabled={checkingOut}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {checkingOut ? "Checking out…" : "Check Out Guest"}
                </button>
              )}
              <button
                onClick={() => {
                  // Strip query string + go back to the role's home page
                  window.history.replaceState({}, "", "/");
                  navigate(user?.role === UserRole.SCANNER ? "/scan" : "/");
                }}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
              >
                {user?.role === UserRole.SCANNER ? "Scan another" : "Back to Dashboard"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
