import { multiplyCents, subtractCents } from "./currency.js";

/**
 * Calculate tax for a tax-exclusive price (in cents).
 * The price does NOT include tax; tax is added on top.
 *
 * @param priceCents - The pre-tax price in cents
 * @param taxRate - The tax rate as a decimal (e.g., 0.15 for 15%)
 * @returns The tax amount in cents
 */
export function calculateTaxExclusive(
  priceCents: number,
  taxRate: number,
): number {
  return Math.round(priceCents * taxRate);
}

/**
 * Extract tax from a tax-inclusive price (in cents).
 * The price INCLUDES tax; we need to extract the tax portion.
 *
 * @param priceIncludingTaxCents - The price that already includes tax, in cents
 * @param taxRate - The tax rate as a decimal (e.g., 0.15 for 15%)
 * @returns The tax amount in cents
 */
export function calculateTaxInclusive(
  priceIncludingTaxCents: number,
  taxRate: number,
): number {
  return Math.round(priceIncludingTaxCents - priceIncludingTaxCents / (1 + taxRate));
}

/**
 * Calculate the line total for a transaction item (in cents).
 * Formula: (unitPriceCents * quantity) - discountAmountCents
 */
export function calculateLineTotal(
  unitPriceCents: number,
  quantity: number,
  discountAmountCents: number,
): number {
  const gross = multiplyCents(unitPriceCents, quantity);
  return subtractCents(gross, discountAmountCents);
}

/**
 * Calculate tax for a single line item (in cents).
 *
 * @param lineTotalCents - The line total after discount, in cents
 * @param taxRate - The tax rate as a decimal
 * @param taxInclusive - Whether the price already includes tax
 * @returns The tax amount in cents
 */
export function calculateLineTax(
  lineTotalCents: number,
  taxRate: number,
  taxInclusive: boolean,
): number {
  if (taxRate === 0) return 0;
  return taxInclusive
    ? calculateTaxInclusive(lineTotalCents, taxRate)
    : calculateTaxExclusive(lineTotalCents, taxRate);
}
