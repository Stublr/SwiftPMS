import { useEffect, useState } from "react";
import { ConnectivityIndicator } from "@/components/layout/connectivity-indicator";
import { logout } from "@/services/auth";
import { getProperties } from "@/services/properties";
import { useAuthStore } from "@/stores/auth.store";
import { usePropertyStore } from "@/stores/property.store";
import { useUIStore } from "@/stores/ui.store";
import type { Property } from "@swiftpms/shared";

export function Header() {
  const user = useAuthStore((s) => s.user);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const navigate = useUIStore((s) => s.navigate);
  const propertyId = usePropertyStore((s) => s.propertyId);
  const propertyName = usePropertyStore((s) => s.propertyName);
  const setProperty = usePropertyStore((s) => s.setProperty);
  const tenantId = usePropertyStore((s) => s.tenantId);

  const [properties, setProperties] = useState<Property[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (tenantId) {
      getProperties()
        .then(setProperties)
        .catch(() => {});
    }
  }, [tenantId]);

  function handleSelectProperty(p: Property) {
    setProperty(p.tenantId, p.id, p.name);
    setDropdownOpen(false);
    navigate("/");
  }

  async function handleLogout() {
    await logout();
  }

  return (
    <header
      className="flex min-h-14 items-center justify-between gap-2 border-b border-border bg-white px-3"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={toggleSidebar}
          className="rounded-md p-2 text-sm hover:bg-secondary md:inline hidden"
        >
          Menu
        </button>
        <ConnectivityIndicator />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {/* Property Switcher */}
        <div className="relative min-w-0">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex max-w-[55vw] items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm transition-colors hover:bg-secondary md:max-w-none"
          >
            <span className="truncate font-medium">
              {propertyName ?? "Select property"}
            </span>
            <svg
              className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-border bg-white py-1 shadow-lg">
                {properties.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProperty(p)}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-secondary ${
                      p.id === propertyId ? "bg-primary/5 font-medium text-primary" : ""
                    }`}
                  >
                    <div>
                      <p>{p.name}</p>
                      {p.address && (
                        <p className="text-xs text-muted-foreground">{p.address}</p>
                      )}
                    </div>
                    {p.id === propertyId && (
                      <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                ))}
                {properties.length === 0 && (
                  <p className="px-4 py-2 text-sm text-muted-foreground">No properties</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Desktop: full user badge + text logout. Mobile: compact icon button. */}
        <div className="hidden text-sm text-muted-foreground md:block">
          {user ? `${user.fullName} (${user.role.replace("_", " ")})` : "Not logged in"}
        </div>
        {user && (
          <button
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
            className="rounded-md p-2 text-red-600 hover:bg-red-50 md:px-3 md:py-1.5"
          >
            <span className="hidden md:inline text-sm">Logout</span>
            <svg
              className="h-5 w-5 md:hidden"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
