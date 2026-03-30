import { describe, expect, it } from "vitest";

import {
  calculateLineTax,
  calculateLineTotal,
  calculateTaxExclusive,
  calculateTaxInclusive,
} from "./tax.js";

describe("calculateTaxExclusive", () => {
  it("calculates 15% tax on 10000 cents ($100)", () => {
    expect(calculateTaxExclusive(10000, 0.15)).toBe(1500);
  });

  it("calculates 15% tax on 2999 cents ($29.99)", () => {
    expect(calculateTaxExclusive(2999, 0.15)).toBe(450);
  });

  it("returns 0 for 0% rate", () => {
    expect(calculateTaxExclusive(10000, 0)).toBe(0);
  });
});

describe("calculateTaxInclusive", () => {
  it("extracts 15% tax from 11500 cents ($115)", () => {
    expect(calculateTaxInclusive(11500, 0.15)).toBe(1500);
  });

  it("extracts 15% tax from 2999 cents ($29.99)", () => {
    // 2999 / 1.15 = 2607.83 => tax = 2999 - 2608 = 391
    expect(calculateTaxInclusive(2999, 0.15)).toBe(391);
  });

  it("returns 0 for 0% rate", () => {
    expect(calculateTaxInclusive(10000, 0)).toBe(0);
  });
});

describe("calculateLineTotal", () => {
  it("calculates total without discount", () => {
    expect(calculateLineTotal(2999, 2, 0)).toBe(5998);
  });

  it("calculates total with discount", () => {
    expect(calculateLineTotal(2999, 2, 500)).toBe(5498);
  });

  it("handles single quantity", () => {
    expect(calculateLineTotal(10000, 1, 1000)).toBe(9000);
  });
});

describe("calculateLineTax", () => {
  it("calculates exclusive tax", () => {
    expect(calculateLineTax(10000, 0.15, false)).toBe(1500);
  });

  it("calculates inclusive tax", () => {
    expect(calculateLineTax(11500, 0.15, true)).toBe(1500);
  });

  it("returns 0 for zero rate", () => {
    expect(calculateLineTax(10000, 0, false)).toBe(0);
    expect(calculateLineTax(10000, 0, true)).toBe(0);
  });
});
