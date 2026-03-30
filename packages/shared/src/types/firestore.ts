import type { UserRole } from "../constants/roles.js";
import type { RoomStatus } from "../constants/room-status.js";
import type { ReservationStatus } from "../constants/reservation-status.js";
import type { FolioStatus } from "../constants/folio-status.js";
import type { ChargeCategory } from "../constants/charge-category.js";
import type { PaymentMethod } from "../constants/payment-methods.js";

// --- Tenant ---

export interface TenantDoc {
  name: string;
  settings: {
    currency: string;
    timezone: string;
    checkInTime: string;
    checkOutTime: string;
    taxRate: number;
    taxInclusive: boolean;
  };
  createdAt: unknown;
  updatedAt: unknown;
}

// --- Property ---

export interface PropertyDoc {
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
  createdAt: unknown;
  updatedAt: unknown;
}

// --- User ---

export interface UserDoc {
  email: string;
  fullName: string;
  role: UserRole;
  pinHash: string | null;
  propertyIds: string[];
  isActive: boolean;
  pinFailedAttempts?: number;
  pinLastFailedAt?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

// --- Room Type ---

export interface RoomTypeDoc {
  name: string;
  code: string;
  description: string | null;
  baseRate: number; // cents per night
  maxOccupancy: number;
  bedConfiguration: string;
  amenities: string[];
  imageUrls: string[];
  isActive: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

// --- Room ---

export interface RoomDoc {
  roomNumber: string;
  roomTypeId: string;
  floor: number;
  status: RoomStatus;
  currentReservationId: string | null;
  notes: string | null;
  isActive: boolean;
  updatedAt: unknown;
}

// --- Guest ---

export interface GuestCompanionEmbed {
  firstName: string;
  lastName: string;
  relationship: string;
  idType: string | null;
  idNumber: string | null;
  age: number | null;
}

export interface GuestDoc {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  idType: string | null;
  idNumber: string | null;
  address: string | null;
  notes: string | null;
  companions: GuestCompanionEmbed[];
  createdAt: unknown;
  updatedAt: unknown;
}

// --- Reservation ---

export interface ReservationDoc {
  guestId: string;
  roomId: string | null;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  nightCount: number;
  adults: number;
  children: number;
  status: ReservationStatus;
  roomRate: number; // cents per night
  totalRoomCharges: number; // cents
  specialRequests: string | null;
  source: "front_desk" | "guest_portal";
  createdBy: string;
  checkedInAt: unknown | null;
  checkedInBy: string | null;
  checkedOutAt: unknown | null;
  checkedOutBy: string | null;
  cancelledAt: unknown | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}

// --- Folio ---

export interface FolioChargeEmbed {
  id: string;
  category: ChargeCategory;
  description: string;
  amount: number; // cents
  quantity: number;
  total: number; // cents
  date: string;
  addedBy: string;
  addedAt: unknown;
}

export interface FolioPaymentEmbed {
  id: string;
  method: PaymentMethod;
  amount: number; // cents
  reference: string | null;
  processedBy: string;
  processedAt: unknown;
}

export interface FolioDoc {
  reservationId: string;
  guestId: string;
  charges: FolioChargeEmbed[];
  payments: FolioPaymentEmbed[];
  totalCharges: number; // cents
  totalPayments: number; // cents
  balance: number; // cents
  status: FolioStatus;
  createdAt: unknown;
  updatedAt: unknown;
}

// --- Daily Aggregate ---

export interface DailyAggregateDoc {
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number;
  arrivals: number;
  departures: number;
  revenue: number; // cents
  roomRevenue: number; // cents
  serviceRevenue: number; // cents
  cancellations: number;
}

// --- Audit Log ---

export interface AuditLogDoc {
  action: string;
  resource: string;
  resourceId: string;
  userId: string;
  userEmail: string;
  propertyId?: string;
  details?: Record<string, unknown>;
  createdAt: unknown;
}
