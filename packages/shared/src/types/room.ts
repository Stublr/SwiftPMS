import type { RoomStatus } from "../constants/room-status.js";

export interface Room {
  id: string;
  propertyId: string;
  roomNumber: string;
  roomTypeId: string;
  floor: number;
  status: RoomStatus;
  currentReservationId: string | null;
  imageUrls: string[];
  rateOverride: number | null; // cents — overrides room type baseRate if set
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface CreateRoomRequest {
  roomNumber: string;
  roomTypeId: string;
  floor: number;
  imageUrls?: string[];
  rateOverride?: number; // cents
  notes?: string;
}

export interface UpdateRoomRequest {
  roomNumber?: string;
  roomTypeId?: string;
  floor?: number;
  imageUrls?: string[];
  rateOverride?: number | null; // null to clear override
  notes?: string;
  isActive?: boolean;
}

export interface UpdateRoomStatusRequest {
  roomId: string;
  status: RoomStatus;
}
