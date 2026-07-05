/**
 * Per-season pricing tier. Captures the typical SA campsite shape:
 *   "R{baseRate} base rate for {basePersonCount} person(s); R{extraAdult} per
 *    additional adult; R{extraChild} per additional child under {childAgeMax}"
 */
export interface PricingTier {
  baseRate: number; // cents — covers `basePersonCount` adults
  basePersonCount: number; // typically 1 or 2
  extraAdult: number; // cents per additional adult beyond basePersonCount
  extraChild: number; // cents per additional child under childAgeMax
  /**
   * Cents per pensioner per night. Flat rate — doesn't count against
   * basePersonCount, doesn't scale with base. When missing/undefined,
   * pensioners are billed as extra adults (defensive default). Only
   * applicable to staff-mediated bookings — the guest portal doesn't
   * expose a pensioner input, so ID can be verified at check-in.
   */
  extraSenior?: number;
}

export interface TieredPricing {
  childAgeMax: number; // typically 12 — children at-or-below this age use the child rate
  standard: PricingTier;
  high: PricingTier;
  /**
   * Date ranges [start, end] inclusive in YYYY-MM-DD when the `high` tier
   * applies. If a stay's check-in date falls inside any range, the entire
   * stay is priced at the high tier (industry convention for campsites).
   * Empty array = high tier never auto-applies; standard tier is used.
   */
  peakRanges: { start: string; end: string }[];
}

export interface RoomType {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  /**
   * Per-night flat rate (cents). For tiered-pricing room types this is the
   * standard-season single-adult rate, kept here as a backward-compatible
   * "headline" rate for legacy callers and UI display.
   */
  baseRate: number;
  /**
   * Optional tiered per-person pricing (campsite/per-person model). When
   * present, all reservation flows compute folio charges from this tier
   * structure instead of `baseRate * nights`.
   */
  tieredPricing?: TieredPricing;
  maxOccupancy: number;
  bedConfiguration: string;
  amenities: string[];
  imageUrls: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomTypeRequest {
  name: string;
  code: string;
  description?: string;
  baseRate: number;
  tieredPricing?: TieredPricing;
  maxOccupancy: number;
  bedConfiguration: string;
  amenities?: string[];
}

export interface UpdateRoomTypeRequest {
  name?: string;
  code?: string;
  description?: string;
  baseRate?: number;
  tieredPricing?: TieredPricing | null;
  maxOccupancy?: number;
  bedConfiguration?: string;
  amenities?: string[];
  isActive?: boolean;
}
