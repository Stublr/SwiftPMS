import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/ui.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { guestLogout } from "@/services/auth";
import { getAllProperties } from "@/services/property";

export function GuestHeader() {
  const navigate = useUIStore((s) => s.navigate);
  const currentPage = useUIStore((s) => s.currentPage);
  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);
  const firstName = useGuestAuthStore((s) => s.firstName);
  const lastName = useGuestAuthStore((s) => s.lastName);
  const [brandName, setBrandName] = useState("SwiftPMS");

  useEffect(() => {
    getAllProperties().then((props) => {
      if (props.length === 1) {
        setBrandName(props[0].name);
      } else if (props.length > 1) {
        // Use tenant name or generic
        setBrandName("Our Lodges");
      }
    }).catch(() => {});
  }, []);

  async function handleLogout() {
    await guestLogout();
    navigate("/");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-lg font-bold text-foreground transition-colors hover:text-primary"
        >
          <svg
            className="h-7 w-7 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
            />
          </svg>
          {brandName}
        </button>

        {/* Navigation */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <NavLink
            label="Home"
            active={currentPage === "/"}
            onClick={() => navigate("/")}
          />
          {isAuthenticated && (
            <NavLink
              label="My Bookings"
              active={currentPage === "/my-bookings"}
              onClick={() => navigate("/my-bookings")}
            />
          )}

          <div className="ml-2 h-6 w-px bg-border sm:ml-4" />

          {isAuthenticated ? (
            <div className="ml-2 flex items-center gap-2 sm:ml-4">
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {firstName} {lastName}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="ml-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:ml-4"
            >
              Sign In
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
          : "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      }
    >
      {label}
    </button>
  );
}
