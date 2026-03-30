import { create } from "zustand";

interface ConnectivityState {
  isOnline: boolean;
  setOnline: (online: boolean) => void;
}

export const useConnectivityStore = create<ConnectivityState>()((set) => ({
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  setOnline: (isOnline) => set({ isOnline }),
}));

// Listen for online/offline events
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    useConnectivityStore.getState().setOnline(true);
  });
  window.addEventListener("offline", () => {
    useConnectivityStore.getState().setOnline(false);
  });
}
