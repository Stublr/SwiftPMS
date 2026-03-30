/**
 * Format a date as YYYY-MM-DD.
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

/**
 * Format a date as a human-readable date+time string.
 */
export function formatDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").substring(0, 19);
}

/**
 * Get the start of a day (midnight) in UTC.
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of a day (23:59:59.999) in UTC.
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Calculate the number of nights between two dates (YYYY-MM-DD strings).
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  const msPerDay = 86_400_000;
  const start = new Date(checkIn).getTime();
  const end = new Date(checkOut).getTime();
  return Math.max(0, Math.round((end - start) / msPerDay));
}

/**
 * Check if a date string falls within a range (inclusive).
 */
export function isDateInRange(
  date: string,
  start: string,
  end: string,
): boolean {
  return date >= start && date <= end;
}

/**
 * Generate an array of date strings (YYYY-MM-DD) from start to end (inclusive).
 */
export function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    dates.push(formatDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Add days to a date string, returning a new YYYY-MM-DD string.
 */
export function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}
