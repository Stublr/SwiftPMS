import type { RoomStatus } from "../constants/room-status.js";

export interface Room {
  id: string;
  propertyId: string;
  roomNumber: string;
  roomTypeId: string;
  floor: number;
  status: RoomStatus;
  currentReservationId: string | null;
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface CreateRoomRequest {
  roomNumber: string;
  roomTypeId: string;
  floor: number;
  notes?: string;
}

export interface UpdateRoomRequest {
  roomNumber?: string;
  roomTypeId?: string;
  floor?: number;
  notes?: string;
  isActive?: boolean;
}

export interface UpdateRoomStatusRequest {
  roomId: string;
  status: RoomStatus;
}
