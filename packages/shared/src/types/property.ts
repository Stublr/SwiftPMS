export interface Property {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  imageUrls: string[];
  amenities: string[];
  checkInTime: string;
  checkOutTime: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePropertyRequest {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  description?: string;
  amenities?: string[];
  checkInTime?: string;
  checkOutTime?: string;
}

export interface UpdatePropertyRequest {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  description?: string;
  amenities?: string[];
  checkInTime?: string;
  checkOutTime?: string;
  isActive?: boolean;
}
