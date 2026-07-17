import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { useBookingStore } from "@/stores/booking.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { checkAvailability, type AvailableRoomType } from "@/services/availability";
import { cancelOwnReservation, createBooking, createBookingGroup } from "@/services/booking";
import { getTourOperatorStatus } from "@/services/tour-operators";
import { initiatePeachCheckout } from "@/services/payment";
import { writePendingToStorage } from "@/pages/payment-result";
import { guestLogin, guestRegister } from "@/services/auth";
import {
  calculateTieredStayTotal,
  formatCents,
  multiplyCents,
  resolveStayPricing,
} from "@swiftpms/shared";

type AuthTab = "login" | "register";

export function BookingPage() {
  const navigate = useUIStore((s) => s.navigate);
  const checkInDate = useBookingStore((s) => s.checkInDate);
  const checkOutDate = useBookingStore((s) => s.checkOutDate);
  const adults = useBookingStore((s) => s.adults);
  const children = useBookingStore((s) => s.children);
  const selectedPropertyId = useBookingStore((s) => s.selectedPropertyId);
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
  const [discountPercent, setDiscountPercent] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setDiscountPercent(0);
      return;
    }
    getTourOperatorStatus()
      .then((status) => setDiscountPercent(status.discountPercent))
      .catch(() => setDiscountPercent(0));
  }, [isAuthenticated]);

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
    if (!checkInDate || !checkOutDate || !selectedRoomTypeId || !selectedPropertyId) {
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
        selectedPropertyId!,
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

  const setResult = useBookingStore((s) => s.setResult);
  const setGroupResult = useBookingStore((s) => s.setGroupResult);
  const setPendingPayment = useBookingStore((s) => s.setPendingPayment);
  const groupItems = useBookingStore((s) => s.groupItems);
  const isGroup = (groupItems?.length ?? 0) > 1;

  async function handleConfirmBooking() {
    if (!guestId || !selectedRoomTypeId || !checkInDate || !checkOutDate) return;
    setSubmitting(true);
    setError(null);

    // Two-stage flow:
    //   (1) createGuestReservation(Group) — creates N reservations + one folio
    //   (2) initiatePeachCheckout        — calls Plankton, gets redirect URL
    // If (2) fails, roll back so we don't leak held rooms.
    let soloResult: Awaited<ReturnType<typeof createBooking>> | null = null;
    let groupCreated: Awaited<ReturnType<typeof createBookingGroup>> | null = null;
    try {
      let reservationIdForPayment: string;
      let folioIdForPayment: string;
      let totalAmountCents: number;
      let nightCountForSnap: number;
      let roomRateForSnap: number;
      // For the snapshot we only store the first reservation's id as the
      // "primary" — the group's other reservations are fetched from the
      // folio doc on the confirmation page.
      if (isGroup) {
        groupCreated = await createBookingGroup({
          guestId,
          propertyId: selectedPropertyId!,
          checkInDate,
          checkOutDate,
          items: groupItems!.map((it) => ({
            roomTypeId: it.roomTypeId,
            adults: it.adults,
            children: it.children,
          })),
          specialRequests: specialRequests.trim() || undefined,
        });
        setGroupResult(groupCreated);
        reservationIdForPayment = groupCreated.reservationIds[0]!;
        folioIdForPayment = groupCreated.folioId;
        totalAmountCents = groupCreated.totalRoomCharges;
        nightCountForSnap = groupCreated.nightCount;
        roomRateForSnap = 0; // group folio has per-site rates, snapshot is a summary only
      } else {
        soloResult = await createBooking({
          guestId,
          roomTypeId: selectedRoomTypeId,
          checkInDate,
          checkOutDate,
          adults,
          children,
          specialRequests: specialRequests.trim() || undefined,
          propertyId: selectedPropertyId!,
        });
        setResult({
          reservationId: soloResult.id,
          folioId: soloResult.folioId,
          nightCount: soloResult.nightCount,
          roomRate: soloResult.roomRate,
          totalRoomCharges: soloResult.totalRoomCharges,
        });
        reservationIdForPayment = soloResult.id;
        folioIdForPayment = soloResult.folioId;
        totalAmountCents = soloResult.totalRoomCharges;
        nightCountForSnap = soloResult.nightCount;
        roomRateForSnap = soloResult.roomRate;
      }

      const shopperResultUrl = `${window.location.origin}/?payment_return=1`;
      const { paymentIntentId, redirectUrl } = await initiatePeachCheckout({
        purpose: "guest_booking",
        amount: totalAmountCents,
        propertyId: selectedPropertyId!,
        reservationId: reservationIdForPayment,
        folioId: folioIdForPayment,
        paymentType: "DB",
        shopperResultUrl,
      });

      const tid = useGuestAuthStore.getState().tenantId ?? "";
      writePendingToStorage({
        paymentIntentId,
        tenantId: tid,
        propertyId: selectedPropertyId!,
        snapshot: {
          checkInDate,
          checkOutDate,
          adults,
          children,
          selectedPropertyId: selectedPropertyId!,
          selectedRoomTypeId: selectedRoomTypeId!,
          reservationId: reservationIdForPayment,
          nightCount: nightCountForSnap,
          roomRate: roomRateForSnap,
          totalRoomCharges: totalAmountCents,
        },
        groupSnapshot: isGroup && groupCreated
          ? {
              groupId: groupCreated.groupId,
              reservationIds: groupCreated.reservationIds,
              folioId: groupCreated.folioId,
              items: groupItems!,
            }
          : undefined,
      });
      setPendingPayment({
        paymentIntentId,
        amountCents: totalAmountCents,
      });

      window.location.assign(redirectUrl);
    } catch (err) {
      // Rollback: for a solo, cancel the one reservation. For a group, cancel
      // every reservation in the group (each independently) so no held rooms
      // linger.
      const idsToCancel = isGroup && groupCreated
        ? groupCreated.reservationIds
        : soloResult
          ? [soloResult.id]
          : [];
      for (const id of idsToCancel) {
        try {
          await cancelOwnReservation(id, selectedPropertyId!, "payment_init_failed");
        } catch {
          // Sweeper will release the hold after 30 min if rollback fails.
        }
      }
      setError(
        err instanceof Error
          ? `Couldn't reach the payment gateway. Please try again.\n(${err.message})`
          : "Failed to create booking.",
      );
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
      </div>
    );
  }

  const nights = nightCount();
  // Tiered (per-person) pricing if the room type has it; else flat baseRate.
  // Rate periods + tour-operator discount both flow through resolveStayPricing
  // so this estimate matches the server-authoritative totalRoomCharges.
  const stayCalc =
    roomType && checkInDate && checkOutDate
      ? resolveStayPricing(
          {
            baseRate: roomType.baseRate,
            tieredPricing: roomType.tieredPricing ?? undefined,
            ratePeriods: roomType.ratePeriods ?? undefined,
          },
          checkInDate,
          checkOutDate,
          adults,
          children,
          0,
          discountPercent,
        )
      : null;
  const tieredCalc =
    roomType?.tieredPricing && checkInDate && checkOutDate
      ? calculateTieredStayTotal(
          roomType.tieredPricing,
          checkInDate,
          checkOutDate,
          adults,
          children,
        )
      : null;
  const totalCents = stayCalc
    ? stayCalc.total
    : roomType
      ? multiplyCents(roomType.baseRate, nights)
      : 0;
  const nightlyDisplay = stayCalc?.nightlyRate ?? tieredCalc?.nightlyRate ?? roomType?.baseRate ?? 0;
  const grossCents = stayCalc?.grossTotal ?? totalCents;
  // Mirror resolveStayPricing's rate resolution so the breakdown lines match
  // the tier actually charged: an active rate period overrides (tier or flat),
  // else the room's own standard/high tier.
  const activePeriod =
    roomType && checkInDate
      ? (roomType.ratePeriods ?? []).find(
          (p) => checkInDate >= p.start && checkInDate <= p.end,
        )
      : undefined;
  const breakdownTier = activePeriod
    ? (activePeriod.tier ?? null)
    : roomType?.tieredPricing && tieredCalc
      ? roomType.tieredPricing[tieredCalc.tier]
      : null;
  const breakdownTierLabel = activePeriod?.tier
    ? (activePeriod.name || "Rate period")
    : tieredCalc?.tier === "high"
      ? "High season"
      : "Standard season";

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

      <span className="eyebrow text-accent">Almost there</span>
      <h1 className="mb-8 mt-2 font-display text-3xl font-semibold text-foreground sm:text-4xl">
        Complete your booking
      </h1>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Room Info */}
          {roomType && (
            <div className="mb-6 rounded-2xl border border-border bg-surface p-6 shadow-soft">
              <h2 className="mb-1 font-display text-xl font-semibold text-foreground">
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
            <div className="mb-6 rounded-2xl border border-border bg-surface p-6 shadow-soft">
              <h2 className="mb-4 font-display text-lg font-semibold text-foreground">
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
            <div className="mb-6 rounded-2xl border border-border bg-surface p-6 shadow-soft">
              <h2 className="mb-4 font-display text-lg font-semibold text-foreground">
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
            <div className="mb-6 rounded-2xl border border-border bg-surface p-6 shadow-soft">
              <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
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
          <div className="sticky top-24 rounded-2xl border border-border bg-surface p-6 shadow-card">
            <h2 className="mb-4 font-display text-lg font-semibold text-foreground">
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
                  {breakdownTier ? (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>
                          {breakdownTierLabel} base ({breakdownTier.basePersonCount} person{breakdownTier.basePersonCount === 1 ? "" : "s"})
                        </span>
                        <span>
                          {formatCents(breakdownTier.baseRate)}
                          /night
                        </span>
                      </div>
                      {Math.max(0, adults - breakdownTier.basePersonCount) > 0 && (
                        <div className="flex justify-between">
                          <span>
                            {adults - breakdownTier.basePersonCount}{" "}
                            extra adult(s) @{" "}
                            {formatCents(breakdownTier.extraAdult)}
                            /night
                          </span>
                          <span>
                            {formatCents(
                              (adults - breakdownTier.basePersonCount) *
                                breakdownTier.extraAdult,
                            )}
                            /night
                          </span>
                        </div>
                      )}
                      {children > 0 && (
                        <div className="flex justify-between">
                          <span>
                            {children} child(ren)
                            {roomType.tieredPricing
                              ? ` under ${roomType.tieredPricing.childAgeMax + 1}`
                              : ""}{" "}
                            @ {formatCents(breakdownTier.extraChild)}
                            /night
                          </span>
                          <span>
                            {formatCents(children * breakdownTier.extraChild)}
                            /night
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1 font-medium text-foreground">
                        <span>
                          {formatCents(nightlyDisplay)} × {nights}{" "}
                          {nights === 1 ? "night" : "nights"}
                        </span>
                        <span>{formatCents(grossCents)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {formatCents(nightlyDisplay)} x {nights}{" "}
                        {nights === 1 ? "night" : "nights"}
                      </span>
                      <span className="font-medium text-foreground">
                        {formatCents(grossCents)}
                      </span>
                    </div>
                  )}

                  {stayCalc && stayCalc.discountAmount > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-leaf-foreground">
                        <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          Tour operator rate
                        </span>
                        −{discountPercent}%
                      </span>
                      <span className="font-medium text-leaf-foreground">
                        −{formatCents(stayCalc.discountAmount)}
                      </span>
                    </div>
                  )}

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
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground/40 border-t-accent-foreground" />
                  Confirming…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  Confirm &amp; Pay
                </>
              )}
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
