import { httpsCallable } from "firebase/functions";
import type { TieredPricing } from "@swiftpms/shared";

import { functions } from "@/lib/firebase";
import { getTenantId } from "@/services/property";

export interface AvailableRoomType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  baseRate: number;
  tieredPricing: TieredPricing | null;
  maxOccupancy: number;
  bedConfiguration: string;
  amenities: string[];
  imageUrls: string[];
  available: number;
}

export async function checkAvailability(
  checkInDate: string,
  checkOutDate: string,
  propertyId: string,
  roomTypeId?: string | null,
): Promise<AvailableRoomType[]> {
  const fn = httpsCallable(functions, "checkAvailability");
  const payload: Record<string, unknown> = {
    tenantId: getTenantId(),
    propertyId,
    checkInDate,
    checkOutDate,
  };
  if (roomTypeId) {
    payload.roomTypeId = roomTypeId;
  }
  const result = await fn(payload);
  return (result.data as { roomTypes: AvailableRoomType[] }).roomTypes;
}
