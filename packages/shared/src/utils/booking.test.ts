import { describe, expect, it } from "vitest";

import { calculateTieredStayTotal, resolveStayPricing } from "./booking.js";
import type { TieredPricing } from "../types/room-type.js";

const tieredPricing: TieredPricing = {
  childAgeMax: 12,
  standard: { baseRate: 38000, basePersonCount: 2, extraAdult: 5000, extraChild: 2000 },
  high: { baseRate: 50000, basePersonCount: 2, extraAdult: 6000, extraChild: 2500 },
  peakRanges: [{ start: "2026-12-01", end: "2027-01-15" }],
};

describe("resolveStayPricing", () => {
  it("matches calculateTieredStayTotal when no ratePeriods are set (tiered)", () => {
    const roomType = { baseRate: 38000, tieredPricing };
    const calc = resolveStayPricing(roomType, "2026-08-01", "2026-08-03", 2, 1);
    const expected = calculateTieredStayTotal(tieredPricing, "2026-08-01", "2026-08-03", 2, 1);
    expect(calc.nightlyRate).toBe(expected.nightlyRate);
    expect(calc.total).toBe(expected.total);
    expect(calc.tier).toBe(expected.tier);
  });

  it("uses baseRate * nights when no ratePeriods and no tieredPricing (flat)", () => {
    const roomType = { baseRate: 45000 };
    const calc = resolveStayPricing(roomType, "2026-08-01", "2026-08-03", 2, 0);
    expect(calc.total).toBe(45000 * 2);
    expect(calc.tier).toBe("standard");
  });

  it("uses the rate period's tier when check-in falls inside the range", () => {
    const periodTier = { baseRate: 60000, basePersonCount: 2, extraAdult: 7000, extraChild: 3000 };
    const roomType = {
      baseRate: 38000,
      tieredPricing,
      ratePeriods: [{ id: "p1", name: "Festive", start: "2026-12-20", end: "2026-12-31", tier: periodTier }],
    };
    const calc = resolveStayPricing(roomType, "2026-12-25", "2026-12-27", 2, 0);
    expect(calc.tier).toBe("period");
    expect(calc.nightlyRate).toBe(60000);
  });

  it("applies the rate period's baseRate override on a flat room type", () => {
    const roomType = {
      baseRate: 45000,
      ratePeriods: [{ id: "p1", name: "Special", start: "2026-09-01", end: "2026-09-10", baseRate: 55000 }],
    };
    const calc = resolveStayPricing(roomType, "2026-09-05", "2026-09-07", 2, 0);
    expect(calc.tier).toBe("period");
    expect(calc.nightlyRate).toBe(55000);
  });

  it("applies a discount percent to the gross total", () => {
    const roomType = { baseRate: 45000 };
    const calc = resolveStayPricing(roomType, "2026-08-01", "2026-08-03", 2, 0, 0, 10);
    expect(calc.discountAmount).toBe(Math.round(calc.grossTotal * 0.1));
    expect(calc.total).toBe(calc.grossTotal - calc.discountAmount);
  });

  it("falls back to standard pricing when check-in is outside all rate periods", () => {
    const roomType = {
      baseRate: 45000,
      ratePeriods: [{ id: "p1", name: "Special", start: "2026-09-01", end: "2026-09-10", baseRate: 55000 }],
    };
    const calc = resolveStayPricing(roomType, "2026-10-01", "2026-10-03", 2, 0);
    expect(calc.tier).toBe("standard");
    expect(calc.nightlyRate).toBe(45000);
  });
});

describe("per-night season pricing", () => {
  // standard nightly (3 adults, 1 child): 38000 + 1*5000 + 1*2000 = 45000
  // high nightly     (3 adults, 1 child): 50000 + 1*6000 + 1*2500 = 58500
  const stdNightly = 45000;
  const peakNightly = 58500;

  it("splits a stay that enters peak mid-stay into per-season segments", () => {
    // 2026-11-29 → 2026-12-03: nights 11/29, 11/30 (standard) + 12/01, 12/02 (peak)
    const calc = calculateTieredStayTotal(tieredPricing, "2026-11-29", "2026-12-03", 3, 1);
    expect(calc.tier).toBe("mixed");
    expect(calc.total).toBe(2 * stdNightly + 2 * peakNightly);
    expect(calc.segments).toEqual([
      { tier: "standard", start: "2026-11-29", nights: 2, nightlyRate: stdNightly, subtotal: 2 * stdNightly },
      { tier: "high", start: "2026-12-01", nights: 2, nightlyRate: peakNightly, subtotal: 2 * peakNightly },
    ]);
  });

  it("prices only the nights inside a peak range at the high tier when a stay exits peak", () => {
    // 2027-01-14 → 2027-01-17: 01/14, 01/15 (peak, range ends 01/15) + 01/16 (standard)
    const calc = calculateTieredStayTotal(tieredPricing, "2027-01-14", "2027-01-17", 2, 0);
    expect(calc.tier).toBe("mixed");
    // 2 peak + 1 standard for 2 adults: 2*50000 + 1*38000
    expect(calc.total).toBe(2 * 50000 + 1 * 38000);
    expect(calc.segments.map((s) => s.tier)).toEqual(["high", "standard"]);
  });

  it("keeps a single segment for a stay entirely within one season", () => {
    const calc = calculateTieredStayTotal(tieredPricing, "2026-12-05", "2026-12-08", 2, 0);
    expect(calc.tier).toBe("high");
    expect(calc.segments).toHaveLength(1);
    expect(calc.total).toBe(3 * 50000);
  });

  it("segment subtotals always sum to the gross total (resolveStayPricing)", () => {
    const roomType = { baseRate: 38000, tieredPricing };
    const calc = resolveStayPricing(roomType, "2026-11-29", "2026-12-03", 3, 1);
    expect(calc.tier).toBe("mixed");
    expect(calc.segments.reduce((sum, s) => sum + s.subtotal, 0)).toBe(calc.grossTotal);
    expect(calc.grossTotal).toBe(2 * stdNightly + 2 * peakNightly);
  });
});

describe("effectiveFrom gate", () => {
  const gated: TieredPricing = { ...tieredPricing, effectiveFrom: "2026-09-01" };

  it("keeps the flat baseRate for check-ins before effectiveFrom (ignores tiers)", () => {
    const roomType = { baseRate: 38000, tieredPricing: gated };
    const calc = resolveStayPricing(roomType, "2026-08-20", "2026-08-22", 4, 0);
    expect(calc.tier).toBe("standard");
    expect(calc.nightlyRate).toBe(38000); // flat baseRate — the 4 adults do not add extra
    expect(calc.total).toBe(38000 * 2);
  });

  it("applies tiered pricing for check-ins on/after effectiveFrom", () => {
    const roomType = { baseRate: 38000, tieredPricing: gated };
    const calc = resolveStayPricing(roomType, "2026-09-05", "2026-09-07", 4, 0);
    // standard tier, 4 adults: 38000 + (4 - 2) * 5000 = 48000
    expect(calc.nightlyRate).toBe(48000);
    expect(calc.total).toBe(48000 * 2);
  });
});
