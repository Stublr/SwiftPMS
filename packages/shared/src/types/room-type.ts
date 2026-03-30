export interface RoomType {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  baseRate: number; // cents per night
  maxOccupancy: number;
  bedConfiguration: string;
  amenities: string[];
  imageUrls: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomTypeRequest {
  name: string;
  code: string;
  description?: string;
  baseRate: number;
  maxOccupancy: number;
  bedConfiguration: string;
  amenities?: string[];
}

export interface UpdateRoomTypeRequest {
  name?: string;
  code?: string;
  description?: string;
  baseRate?: number;
  maxOccupancy?: number;
  bedConfiguration?: string;
  amenities?: string[];
  isActive?: boolean;
}
