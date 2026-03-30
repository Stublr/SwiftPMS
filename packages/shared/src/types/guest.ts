export interface GuestCompanion {
  firstName: string;
  lastName: string;
  relationship: string;
  idType: string | null;
  idNumber: string | null;
  age: number | null;
}

export interface Guest {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null; // Country code e.g. "ZA"
  idType: string | null;
  idNumber: string | null;
  address: string | null;
  notes: string | null;
  companions: GuestCompanion[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateGuestRequest {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  nationality?: string;
  idType?: string;
  idNumber?: string;
  address?: string;
  notes?: string;
  companions?: GuestCompanion[];
}

export interface UpdateGuestRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  nationality?: string;
  idType?: string;
  idNumber?: string;
  address?: string;
  notes?: string;
  companions?: GuestCompanion[];
}
