import { create } from "zustand";

interface BookingState {
  checkInDate: string | null;
  checkOutDate: string | null;
  adults: number;
  children: number;
  selectedRoomTypeId: string | null;
  setDates: (checkIn: string, checkOut: string) => void;
  setGuests: (adults: number, children: number) => void;
  setRoomType: (id: string) => void;
  reset: () => void;
}

export const useBookingStore = create<BookingState>()((set) => ({
  checkInDate: null,
  checkOutDate: null,
  adults: 1,
  children: 0,
  selectedRoomTypeId: null,
  setDates: (checkInDate, checkOutDate) => set({ checkInDate, checkOutDate }),
  setGuests: (adults, children) => set({ adults, children }),
  setRoomType: (selectedRoomTypeId) => set({ selectedRoomTypeId }),
  reset: () =>
    set({
      checkInDate: null,
      checkOutDate: null,
      adults: 1,
      children: 0,
      selectedRoomTypeId: null,
    }),
}));
