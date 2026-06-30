import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  currentPage: string;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  /**
   * Move to a new page. Pushes a real browser history entry so the hardware
   * back button on Android (and desktop browser back) walks the in-app
   * history instead of leaving the PWA entirely.
   */
  navigate: (page: string) => void;
  _syncFromHistory: (page: string) => void;
}

function initialPage(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export const useUIStore = create<UIState>()((set, get) => ({
  sidebarOpen: true,
  currentPage: initialPage(),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  navigate: (currentPage) => {
    if (typeof window !== "undefined" && get().currentPage !== currentPage) {
      try {
        window.history.pushState({ swiftpms: true }, "", currentPage);
      } catch {
        // ignore; store still updates
      }
    }
    set({ currentPage });
  },
  _syncFromHistory: (currentPage) => set({ currentPage }),
}));

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const path = window.location.pathname || "/";
    useUIStore.getState()._syncFromHistory(path);
  });
}
