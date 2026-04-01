import { create } from "zustand";

interface BookingResult {
  reservationId: string;
  nightCount: number;
  roomRate: number;
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
  setDates: (checkIn: string, checkOut: string) => void;
  setGuests: (adults: number, children: number) => void;
  setProperty: (id: string) => void;
  setRoomType: (id: string) => void;
  setResult: (result: BookingResult) => void;
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
  setDates: (checkInDate, checkOutDate) => set({ checkInDate, checkOutDate }),
  setGuests: (adults, children) => set({ adults, children }),
  setProperty: (selectedPropertyId) => set({ selectedPropertyId }),
  setRoomType: (selectedRoomTypeId) => set({ selectedRoomTypeId }),
  setResult: (result) => set({ result }),
  reset: () =>
    set({
      checkInDate: null,
      checkOutDate: null,
      adults: 1,
      children: 0,
      selectedPropertyId: null,
      selectedRoomTypeId: null,
      result: null,
    }),
}));
