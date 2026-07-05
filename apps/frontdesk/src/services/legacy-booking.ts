import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";

/**
 * Import a reservation that was originally made on a legacy system
 * (St Lucia SA, Ezemvelo KZN Wildlife, etc.) before the SwiftPMS takeover.
 * The guest walks up with paperwork; the staff fills in this form so the
 * reservation, folio, and any pre-existing payment land in our system.
 */

export interface LegacyBookingInput {
  guestFirstName: string;
  guestLastName: string;
  guestEmail?: string;
  guestPhone?: string;
  roomTypeId: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  adults: number;
  children?: number;
  pensioners?: number;
  totalRoomChargesCents: number;
  amountAlreadyPaidCents?: number;
  paymentMethodOriginal?: "cash" | "card" | "eft" | "other";
  paymentReference?: string;
  paymentDateOriginal?: string;
  externalSource: string;
  externalReference?: string;
  notes?: string;
  clientRequestId?: string;
}

export interface LegacyBookingResult {
  id: string;
  guestId: string;
  folioId: string;
  nightCount: number;
  totalRoomCharges: number;
  amountPaid: number;
  balance: number;
}

export async function createLegacyReservation(
  input: LegacyBookingInput,
): Promise<LegacyBookingResult> {
  const { propertyId } = usePropertyStore.getState();
  if (!propertyId) throw new Error("No property selected");
  const fn = httpsCallable<
    LegacyBookingInput & { propertyId: string },
    LegacyBookingResult
  >(functions, "createLegacyReservation");
  const result = await fn({ ...input, propertyId });
  return result.data;
}
