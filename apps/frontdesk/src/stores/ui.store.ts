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

/** Strip query + hash so the switch(currentPage) in app.tsx matches. */
function pathOnly(url: string): string {
  return url.split("?")[0]!.split("#")[0]!;
}

export const useUIStore = create<UIState>()((set, get) => ({
  sidebarOpen: true,
  currentPage: initialPage(),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  navigate: (url) => {
    const path = pathOnly(url);
    if (typeof window !== "undefined") {
      // pushState the FULL url (with any query/hash) so window.location.search
      // reflects it. Deep-linked pages (mobile-folio, check-in) read from
      // window.location.search directly.
      const currentUrl = window.location.pathname + window.location.search + window.location.hash;
      if (currentUrl !== url) {
        try {
          window.history.pushState({ swiftpms: true }, "", url);
        } catch {
          // ignore; store still updates
        }
      }
    }
    // currentPage stays path-only so the app.tsx route switch keeps matching.
    if (get().currentPage !== path) {
      set({ currentPage: path });
    }
  },
  _syncFromHistory: (currentPage) => set({ currentPage: pathOnly(currentPage) }),
}));

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const path = window.location.pathname || "/";
    useUIStore.getState()._syncFromHistory(path);
  });
}
