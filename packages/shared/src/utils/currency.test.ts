import { describe, expect, it } from "vitest";

import {
  toCents,
  fromCents,
  formatCents,
  addCents,
  subtractCents,
  multiplyCents,
  percentOfCents,
} from "./currency.js";

describe("toCents", () => {
  it("converts dollars to cents", () => {
    expect(toCents(29.99)).toBe(2999);
    expect(toCents(100)).toBe(10000);
    expect(toCents(0.01)).toBe(1);
    expect(toCents(0)).toBe(0);
  });

  it("rounds to nearest cent", () => {
    // Note: 1.005 * 100 = 100.4999... in floating-point, so rounds to 100
    expect(toCents(1.005)).toBe(100);
    expect(toCents(1.006)).toBe(101);
    expect(toCents(1.004)).toBe(100);
  });
});

describe("fromCents", () => {
  it("converts cents to dollars", () => {
    expect(fromCents(2999)).toBe(29.99);
    expect(fromCents(10000)).toBe(100);
    expect(fromCents(1)).toBe(0.01);
  });
});

describe("formatCents", () => {
  it("formats cents as ZAR string", () => {
    expect(formatCents(2999)).toBe("R29.99");
    expect(formatCents(10000)).toBe("R100.00");
    expect(formatCents(10)).toBe("R0.10");
    expect(formatCents(0)).toBe("R0.00");
  });
});

describe("addCents", () => {
  it("adds two cent values", () => {
    expect(addCents(2999, 1001)).toBe(4000);
    expect(addCents(0, 500)).toBe(500);
  });
});

describe("subtractCents", () => {
  it("subtracts two cent values", () => {
    expect(subtractCents(10000, 2999)).toBe(7001);
    expect(subtractCents(500, 500)).toBe(0);
  });
});

describe("multiplyCents", () => {
  it("multiplies cents by quantity", () => {
    expect(multiplyCents(2999, 3)).toBe(8997);
    expect(multiplyCents(1050, 2)).toBe(2100);
  });
});

describe("percentOfCents", () => {
  it("calculates percentage of cent amount", () => {
    expect(percentOfCents(10000, 15)).toBe(1500);
    expect(percentOfCents(2999, 10)).toBe(300);
  });

  it("rounds to nearest cent", () => {
    expect(percentOfCents(1000, 33)).toBe(330);
    expect(percentOfCents(999, 15)).toBe(150);
  });
});
