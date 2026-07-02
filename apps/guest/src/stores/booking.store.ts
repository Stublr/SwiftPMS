import { create } from "zustand";

interface BookingResult {
  reservationId: string;
  folioId: string | null;
  nightCount: number;
  roomRate: number;
  totalRoomCharges: number;
}

interface PendingPayment {
  paymentIntentId: string;
  amountCents: number;
}

/** One line item in a group booking — a single campsite with its own guest count. */
export interface GroupBookingItem {
  roomTypeId: string;
  roomTypeName: string;
  adults: number;
  children: number;
  /** Per-site total (cents) — computed client-side for the summary view; server re-prices authoritatively. */
  totalRoomCharges: number;
}

/** After a group booking is created server-side, we get back N reservation IDs. */
export interface GroupBookingResult {
  groupId: string;
  reservationIds: string[];
  folioId: string;
  nightCount: number;
  totalRoomCharges: number;
}

interface BookingState {
  checkInDate: string | null;
  checkOutDate: string | null;
  adults: number;
  children: number;
  selectedPropertyId: string | null;
  selectedRoomTypeId: string | null;
  result: BookingResult | null;
  /** Populated when the guest chose more than one site. Solo bookings keep this null. */
  groupItems: GroupBookingItem[] | null;
  groupResult: GroupBookingResult | null;
  pendingPayment: PendingPayment | null;
  setDates: (checkIn: string, checkOut: string) => void;
  setGuests: (adults: number, children: number) => void;
  setProperty: (id: string) => void;
  setRoomType: (id: string) => void;
  setResult: (result: BookingResult) => void;
  setGroupItems: (items: GroupBookingItem[] | null) => void;
  setGroupResult: (result: GroupBookingResult | null) => void;
  setPendingPayment: (p: PendingPayment | null) => void;
  /** Restore all fields from a persisted snapshot after a payment redirect. */
  restoreFromSnapshot: (snap: {
    checkInDate: string;
    checkOutDate: string;
    adults: number;
    children: number;
    selectedPropertyId: string;
    selectedRoomTypeId: string;
    reservationId: string;
    nightCount: number;
    roomRate: number;
    totalRoomCharges: number;
  }) => void;
  reset: () => void;
}

export const useBookingStore = create<BookingState>()((set) => ({
  checkInDate: null,
  checkOutDate: null,
  adults: 1,
  children: 0,
  selectedPropertyId: null,
  selectedRoomTypeId: null,
  result: null,
  groupItems: null,
  groupResult: null,
  pendingPayment: null,
  setDates: (checkInDate, checkOutDate) => set({ checkInDate, checkOutDate }),
  setGuests: (adults, children) => set({ adults, children }),
  setProperty: (selectedPropertyId) => set({ selectedPropertyId }),
  setRoomType: (selectedRoomTypeId) => set({ selectedRoomTypeId }),
  setResult: (result) => set({ result }),
  setGroupItems: (groupItems) => set({ groupItems }),
  setGroupResult: (groupResult) => set({ groupResult }),
  setPendingPayment: (pendingPayment) => set({ pendingPayment }),
  restoreFromSnapshot: (snap) =>
    set({
      checkInDate: snap.checkInDate,
      checkOutDate: snap.checkOutDate,
      adults: snap.adults,
      children: snap.children,
      selectedPropertyId: snap.selectedPropertyId,
      selectedRoomTypeId: snap.selectedRoomTypeId,
      result: {
        reservationId: snap.reservationId,
        folioId: null,
        nightCount: snap.nightCount,
        roomRate: snap.roomRate,
        totalRoomCharges: snap.totalRoomCharges,
      },
      // Group state is restored separately via setGroupItems / setGroupResult
      // from the pending-payment snapshot.
    }),
  reset: () =>
    set({
      checkInDate: null,
      checkOutDate: null,
      adults: 1,
      children: 0,
      selectedPropertyId: null,
      selectedRoomTypeId: null,
      result: null,
      groupItems: null,
      groupResult: null,
      pendingPayment: null,
    }),
}));
