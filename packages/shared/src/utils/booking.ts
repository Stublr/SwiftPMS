import type { PricingTier, TieredPricing, RatePeriod } from "../types/room-type.js";
import { multiplyCents, subtractCents } from "./currency.js";
import { calculateNights } from "./date.js";

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
 * Determine whether a check-in date falls inside any declared peak range.
 * Returns true if the stay should be priced at the high tier.
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
 * Total stay charge (cents) for a tiered-pricing room type.
 *
 * Peak/standard is decided at check-in (whole stay priced at that tier).
 * The folio line items distinguish the night rate, but this returns the
 * single total figure used to populate Folio.totalCharges.
 */
export function calculateTieredStayTotal(
  tiered: TieredPricing,
  checkIn: string,
  checkOut: string,
  adults: number,
  children: number,
  seniors = 0,
): { tier: "standard" | "high"; nightlyRate: number; total: number } {
  const isHigh = isPeakStay(tiered, checkIn);
  const tier = isHigh ? tiered.high : tiered.standard;
  const nightlyRate = calculateTieredNightlyRate(tier, adults, children, seniors);
  const nights = calculateNights(checkIn, checkOut);
  return {
    tier: isHigh ? "high" : "standard",
    nightlyRate,
    total: multiplyCents(nightlyRate, nights),
  };
}

/**
 * Resolve the effective nightly rate, tier, and total for a stay, accounting
 * for rate periods (override windows) and an optional operator discount.
 * Single lever all reservation-pricing callers should switch to.
 */
export function resolveStayPricing(
  roomType: { baseRate: number; tieredPricing?: TieredPricing; ratePeriods?: RatePeriod[] },
  checkIn: string, checkOut: string, adults: number, children: number, seniors = 0,
  discountPercent = 0,
): { tier: "standard"|"high"|"period"; nightlyRate: number; grossTotal: number; total: number; discountAmount: number } {
  const nights = calculateNights(checkIn, checkOut);
  const period = (roomType.ratePeriods ?? []).find(p => checkIn >= p.start && checkIn <= p.end);
  let tier: "standard"|"high"|"period"; let nightlyRate: number;
  if (period?.tier)      { nightlyRate = calculateTieredNightlyRate(period.tier, adults, children, seniors); tier = "period"; }
  else if (period)       { nightlyRate = period.baseRate ?? roomType.baseRate; tier = "period"; }
  else if (roomType.tieredPricing) { const c = calculateTieredStayTotal(roomType.tieredPricing, checkIn, checkOut, adults, children, seniors); nightlyRate = c.nightlyRate; tier = c.tier; }
  else                   { nightlyRate = roomType.baseRate; tier = "standard"; }
  const grossTotal = multiplyCents(nightlyRate, nights);
  const discountAmount = discountPercent > 0 ? Math.round(grossTotal * discountPercent / 100) : 0;
  return { tier, nightlyRate, grossTotal, total: grossTotal - discountAmount, discountAmount };
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
