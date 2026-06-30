import type { PricingTier, TieredPricing } from "../types/room-type.js";
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
 *
 * If adults < basePersonCount the booking still pays the full base — the
 * base IS the minimum (matches Sugarloaf's "R380 base for 2 persons" rule).
 */
export function calculateTieredNightlyRate(
  tier: PricingTier,
  adults: number,
  children: number,
): number {
  const adultExtras = Math.max(0, adults - tier.basePersonCount);
  return (
    tier.baseRate +
    adultExtras * tier.extraAdult +
    children * tier.extraChild
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
): { tier: "standard" | "high"; nightlyRate: number; total: number } {
  const isHigh = isPeakStay(tiered, checkIn);
  const tier = isHigh ? tiered.high : tiered.standard;
  const nightlyRate = calculateTieredNightlyRate(tier, adults, children);
  const nights = calculateNights(checkIn, checkOut);
  return {
    tier: isHigh ? "high" : "standard",
    nightlyRate,
    total: multiplyCents(nightlyRate, nights),
  };
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
