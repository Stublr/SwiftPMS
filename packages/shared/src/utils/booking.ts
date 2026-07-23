import type { PricingTier, TieredPricing, RatePeriod } from "../types/room-type.js";
import { multiplyCents, subtractCents } from "./currency.js";
import { addDays, calculateNights } from "./date.js";

/**
 * Calculate total room charges for a stay.
 */
export function calculateRoomTotal(
  ratePerNight: number,
  checkIn: string,
  checkOut: string,
): number {
  const nights = calculateNights(checkIn, checkOut);
  return multiplyCents(ratePerNight, nights);
}

/**
 * Determine whether a given date falls inside any declared peak range.
 * Used per-night: a night is charged at the high tier when its date is
 * inside a peak range.
 */
export function isPeakStay(
  tiered: TieredPricing,
  checkIn: string,
): boolean {
  if (tiered.peakRanges.length === 0) return false;
  return tiered.peakRanges.some(
    (r) => checkIn >= r.start && checkIn <= r.end,
  );
}

/**
 * Per-night cents for a tier given the head count.
 *   total = baseRate
 *         + max(0, adults - basePersonCount) * extraAdult
 *         + children * extraChild
 *         + seniors * extraSenior   (if tier.extraSenior defined)
 *
 * If adults < basePersonCount the booking still pays the full base — the
 * base IS the minimum (matches Sugarloaf's "R380 base for 2 persons" rule).
 *
 * Seniors (pensioners) are a distinct guest category with their own flat
 * per-person rate. They don't count against basePersonCount (base always
 * charged). If the tier doesn't declare `extraSenior`, seniors are billed
 * at the adult rate — defensive default so a mis-configured room type
 * doesn't silently undercharge.
 */
export function calculateTieredNightlyRate(
  tier: PricingTier,
  adults: number,
  children: number,
  seniors = 0,
): number {
  const adultExtras = Math.max(0, adults - tier.basePersonCount);
  const seniorRate = tier.extraSenior ?? tier.extraAdult;
  return (
    tier.baseRate +
    adultExtras * tier.extraAdult +
    children * tier.extraChild +
    seniors * seniorRate
  );
}

/**
 * A run of consecutive nights charged at the same nightly rate. Stays that
 * cross a season boundary produce multiple segments; flat and single-season
 * stays produce one. Amounts are gross (before any discount).
 */
export interface StaySegment {
  tier: "standard" | "high" | "period";
  start: string; // YYYY-MM-DD of the first night in the run
  nights: number;
  nightlyRate: number; // cents per night
  subtotal: number; // nightlyRate * nights
}

/**
 * Total stay charge (cents) for a tiered-pricing room type, priced per night.
 *
 * Each night is charged at its own season's tier: a night whose date falls in
 * a peak range uses the `high` tier, otherwise `standard`. Consecutive nights
 * at the same rate are grouped into `segments` (used to build folio line
 * items). `tier` is "mixed" when a stay straddles a season boundary.
 */
export function calculateTieredStayTotal(
  tiered: TieredPricing,
  checkIn: string,
  checkOut: string,
  adults: number,
  children: number,
  seniors = 0,
): { tier: "standard" | "high" | "mixed"; nightlyRate: number; total: number; segments: StaySegment[] } {
  const nights = calculateNights(checkIn, checkOut);
  const segments: StaySegment[] = [];
  let total = 0;
  for (let i = 0; i < nights; i++) {
    const date = addDays(checkIn, i);
    const isHigh = isPeakStay(tiered, date);
    const nightTier: "standard" | "high" = isHigh ? "high" : "standard";
    const rate = calculateTieredNightlyRate(
      isHigh ? tiered.high : tiered.standard,
      adults,
      children,
      seniors,
    );
    total += rate;
    const last = segments[segments.length - 1];
    if (last && last.tier === nightTier && last.nightlyRate === rate) {
      last.nights += 1;
      last.subtotal += rate;
    } else {
      segments.push({ tier: nightTier, start: date, nights: 1, nightlyRate: rate, subtotal: rate });
    }
  }
  const seasons = new Set(segments.map((s) => s.tier));
  const tier: "standard" | "high" | "mixed" =
    seasons.size > 1 ? "mixed" : segments[0]?.tier === "high" ? "high" : "standard";
  return { tier, nightlyRate: segments[0]?.nightlyRate ?? 0, total, segments };
}

/**
 * Resolve the effective nightly rate, tier, total, and per-season segments for
 * a stay, accounting for rate periods (override windows) and an optional
 * operator discount. Single lever all reservation-pricing callers should use.
 *
 * `segments` breaks the stay into consecutive same-rate runs (gross, before
 * discount) — one entry for flat/period stays, more when a tiered stay
 * straddles a season boundary. `nightlyRate` is the first night's rate, kept
 * as a representative "headline" rate; `grossTotal` is the true per-night sum.
 *
 * Tiered pricing with an `effectiveFrom` set only applies to check-ins on or
 * after that date — earlier check-ins fall back to the flat `baseRate`.
 */
export function resolveStayPricing(
  roomType: { baseRate: number; tieredPricing?: TieredPricing; ratePeriods?: RatePeriod[] },
  checkIn: string, checkOut: string, adults: number, children: number, seniors = 0,
  discountPercent = 0,
): { tier: "standard"|"high"|"period"|"mixed"; nightlyRate: number; grossTotal: number; total: number; discountAmount: number; segments: StaySegment[] } {
  const nights = calculateNights(checkIn, checkOut);
  const period = (roomType.ratePeriods ?? []).find(p => checkIn >= p.start && checkIn <= p.end);
  let tier: "standard"|"high"|"period"|"mixed"; let nightlyRate: number; let grossTotal: number; let segments: StaySegment[];
  if (period?.tier) {
    nightlyRate = calculateTieredNightlyRate(period.tier, adults, children, seniors);
    grossTotal = multiplyCents(nightlyRate, nights);
    segments = [{ tier: "period", start: checkIn, nights, nightlyRate, subtotal: grossTotal }];
    tier = "period";
  } else if (period) {
    nightlyRate = period.baseRate ?? roomType.baseRate;
    grossTotal = multiplyCents(nightlyRate, nights);
    segments = [{ tier: "period", start: checkIn, nights, nightlyRate, subtotal: grossTotal }];
    tier = "period";
  } else if (
    roomType.tieredPricing &&
    (!roomType.tieredPricing.effectiveFrom || checkIn >= roomType.tieredPricing.effectiveFrom)
  ) {
    const c = calculateTieredStayTotal(roomType.tieredPricing, checkIn, checkOut, adults, children, seniors);
    nightlyRate = c.nightlyRate;
    grossTotal = c.total;
    segments = c.segments;
    tier = c.tier;
  } else {
    nightlyRate = roomType.baseRate;
    grossTotal = multiplyCents(nightlyRate, nights);
    segments = [{ tier: "standard", start: checkIn, nights, nightlyRate, subtotal: grossTotal }];
    tier = "standard";
  }
  const discountAmount = discountPercent > 0 ? Math.round(grossTotal * discountPercent / 100) : 0;
  return { tier, nightlyRate, grossTotal, total: grossTotal - discountAmount, discountAmount, segments };
}

/**
 * Calculate the outstanding balance on a folio.
 */
export function calculateFolioBalance(
  totalCharges: number,
  totalPayments: number,
): number {
  return subtractCents(totalCharges, totalPayments);
}

/**
 * Check if a check-in date is today or in the future.
 */
export function isCheckInDateValid(checkIn: string): boolean {
  const today = new Date().toISOString().split("T")[0]!;
  return checkIn >= today;
}

/**
 * Check if check-out is strictly after check-in.
 */
export function isCheckOutAfterCheckIn(
  checkIn: string,
  checkOut: string,
): boolean {
  return checkOut > checkIn;
}
