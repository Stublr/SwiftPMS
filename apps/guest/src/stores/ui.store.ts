import { create } from "zustand";

interface UIState {
  currentPage: string;
  /**
   * Move to a new page. Pushes a real browser history entry so the back
   * button works and a refresh preserves the current page. Pass an absolute
   * path like "/rooms".
   */
  navigate: (page: string) => void;
  /**
   * Internal helper used by the popstate listener — updates the store
   * WITHOUT pushing another history entry. Don't call this from app code.
   */
  _syncFromHistory: (page: string) => void;
}

function initialPage(): string {
  if (typeof window === "undefined") return "/";
  const p = window.location.pathname || "/";
  // Treat any unknown path as root; the app router maps to the appropriate
  // page from the `currentPage` value.
  return p;
}

export const useUIStore = create<UIState>()((set, get) => ({
  currentPage: initialPage(),
  navigate: (page) => {
    if (typeof window !== "undefined" && get().currentPage !== page) {
      try {
        window.history.pushState({ swiftpms: true }, "", page);
      } catch {
        // History API blocked (rare) — fall through, store still updates.
      }
    }
    set({ currentPage: page });
  },
  _syncFromHistory: (page) => set({ currentPage: page }),
}));

// Wire popstate so the browser back / forward buttons drive the store.
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const path = window.location.pathname || "/";
    useUIStore.getState()._syncFromHistory(path);
  });
}
