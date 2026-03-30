/**
 * Convert a dollar amount to cents (integer).
 * e.g., 29.99 → 2999
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents (integer) to a dollar amount.
 * e.g., 2999 → 29.99
 */
export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Format cents as a display string with 2 decimal places.
 * e.g., 2999 → "R29.99"
 */
export function formatCents(cents: number): string {
  return `R${fromCents(cents).toFixed(2)}`;
}

/**
 * Add two cent values.
 */
export function addCents(a: number, b: number): number {
  return a + b;
}

/**
 * Subtract two cent values.
 */
export function subtractCents(a: number, b: number): number {
  return a - b;
}

/**
 * Multiply a cent amount by a whole quantity.
 */
export function multiplyCents(cents: number, quantity: number): number {
  return Math.round(cents * quantity);
}

/**
 * Calculate a percentage of a cent amount.
 * e.g., percentOfCents(10000, 15) → 1500 (15% of $100.00)
 */
export function percentOfCents(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}
