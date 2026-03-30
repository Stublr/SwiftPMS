import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  currentPage: string;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  navigate: (page: string) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  currentPage: "/",
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  navigate: (currentPage) => set({ currentPage }),
}));
