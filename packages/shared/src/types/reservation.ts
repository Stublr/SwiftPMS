import type { ReservationStatus } from "../constants/reservation-status.js";

export interface Reservation {
  id: string;
  propertyId: string;
  /** Shared id for reservations booked together as a group. Undefined on solo bookings. */
  groupId?: string;
  /** Folio this reservation is billed against. For groups, N reservations share one folio. */
  folioId?: string;
  guestId: string;
  roomId: string | null;
  roomTypeId: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  nightCount: number;
  adults: number;
  children: number;
  /** Pensioners in the group (staff-mediated only — guest portal never sets this). */
  pensioners?: number;
  status: ReservationStatus;
  roomRate: number; // cents per night (snapshot at booking time)
  totalRoomCharges: number; // cents
  specialRequests: string | null;
  source: "front_desk" | "guest_portal";
  createdBy: string;
  checkedInAt: string | null;
  checkedInBy: string | null;
  checkedOutAt: string | null;
  checkedOutBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReservationRequest {
  guestId: string;
  roomTypeId: string;
  roomId?: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children?: number;
  /** Staff-mediated only. Guest portal rejects this — pensioners must show ID at reception. */
  pensioners?: number;
  specialRequests?: string;
}

export interface CheckInRequest {
  reservationId: string;
  roomId?: string;
}

export interface CheckOutRequest {
  reservationId: string;
}

export interface CancelReservationRequest {
  reservationId: string;
  reason?: string;
}
