import { create } from "zustand";

interface UIState {
  currentPage: string;
  navigate: (page: string) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  currentPage: "/",
  navigate: (page) => set({ currentPage: page }),
}));
