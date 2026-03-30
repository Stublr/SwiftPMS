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
