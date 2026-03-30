import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

const TENANT_ID = import.meta.env.VITE_TENANT_ID || "demo-tenant";
const PROPERTY_ID = import.meta.env.VITE_PROPERTY_ID || "demo-property";

export interface AvailableRoomType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  baseRate: number;
  maxOccupancy: number;
  bedConfiguration: string;
  amenities: string[];
  imageUrls: string[];
  available: number;
}

export async function checkAvailability(
  checkInDate: string,
  checkOutDate: string,
  roomTypeId?: string | null,
): Promise<AvailableRoomType[]> {
  const fn = httpsCallable(functions, "checkAvailability");
  const payload: Record<string, unknown> = {
    tenantId: TENANT_ID,
    propertyId: PROPERTY_ID,
    checkInDate,
    checkOutDate,
  };
  // Only include roomTypeId if it's a non-empty string (avoid sending null)
  if (roomTypeId) {
    payload.roomTypeId = roomTypeId;
  }
  const result = await fn(payload);
  return (result.data as { roomTypes: AvailableRoomType[] }).roomTypes;
}
