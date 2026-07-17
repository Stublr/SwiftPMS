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
