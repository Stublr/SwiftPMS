import { create } from "zustand";

interface GuestAuthState {
  guestId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  tenantId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (data: {
    guestId: string;
    email: string;
    firstName: string;
    lastName: string;
    tenantId: string;
  }) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useGuestAuthStore = create<GuestAuthState>()((set) => ({
  guestId: null,
  email: null,
  firstName: null,
  lastName: null,
  tenantId: null,
  isAuthenticated: false,
  isLoading: true,
  setAuth: (data) => set({ ...data, isAuthenticated: true, isLoading: false }),
  clearAuth: () =>
    set({
      guestId: null,
      email: null,
      firstName: null,
      lastName: null,
      tenantId: null,
      isAuthenticated: false,
      isLoading: false,
    }),
  setLoading: (isLoading) => set({ isLoading }),
}));
