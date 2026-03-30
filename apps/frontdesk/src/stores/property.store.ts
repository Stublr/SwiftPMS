import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PropertyState {
  tenantId: string | null;
  propertyId: string | null;
  propertyName: string | null;
  setProperty: (tenantId: string, propertyId: string, propertyName: string) => void;
  clearProperty: () => void;
}

export const usePropertyStore = create<PropertyState>()(
  persist(
    (set) => ({
      tenantId: null,
      propertyId: null,
      propertyName: null,
      setProperty: (tenantId, propertyId, propertyName) =>
        set({ tenantId, propertyId, propertyName }),
      clearProperty: () =>
        set({ tenantId: null, propertyId: null, propertyName: null }),
    }),
    { name: "swiftpms-property" },
  ),
);
