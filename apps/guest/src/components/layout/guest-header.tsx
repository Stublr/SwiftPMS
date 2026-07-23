import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/ui.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { guestLogout } from "@/services/auth";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export function GuestHeader() {
  const navigate = useUIStore((s) => s.navigate);
  const currentPage = useUIStore((s) => s.currentPage);
  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);
  const firstName = useGuestAuthStore((s) => s.firstName);
  const lastName = useGuestAuthStore((s) => s.lastName);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function handleLogout() {
    await guestLogout();
    navigate("/");
  }

  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-all duration-300",
        scrolled
          ? "border-border/80 bg-background/85 shadow-soft backdrop-blur-md"
          : "border-transparent bg-background/60 backdrop-blur-sm",
      )}
    >
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-4 sm:px-6">
        <button
          onClick={() => navigate("/")}
          className="group transition-transform duration-200 active:scale-[0.98]"
          aria-label="ALGAFUSION home"
        >
          <Logo
            showTagline
            markClassName="transition-transform duration-300 group-hover:-translate-y-0.5"
            className="[&_.text-accent]:hidden sm:[&_.text-accent]:block"
          />
        </button>

        <nav className="flex items-center gap-1 sm:gap-2">
          <NavLink
            label="Home"
            active={currentPage === "/"}
            onClick={() => navigate("/")}
          />
          <NavLink
            label="Tour Operators"
            active={currentPage === "/tour-operator"}
            onClick={() => navigate("/tour-operator")}
          />
          {isAuthenticated && (
            <NavLink
              label="My Bookings"
              active={currentPage === "/my-bookings"}
              onClick={() => navigate("/my-bookings")}
            />
          )}

          <div className="mx-1 h-6 w-px bg-border sm:mx-3" />

          {isAuthenticated ? (
            <div className="flex items-center gap-2.5">
              <span className="hidden items-center gap-2 sm:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials || "G"}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {firstName}
                </span>
              </span>
              <button
                onClick={handleLogout}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card active:scale-[0.98]"
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
      className={cn(
        "relative rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-accent transition-all duration-300",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}
