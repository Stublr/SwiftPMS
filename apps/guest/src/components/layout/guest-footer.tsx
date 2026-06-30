import { useUIStore } from "@/stores/ui.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { Logo } from "@/components/brand/logo";

export function GuestFooter() {
  const navigate = useUIStore((s) => s.navigate);
  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-24 overflow-hidden bg-brand-gradient text-primary-foreground">
      {/* faint chevron motif */}
      <div
        className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 opacity-[0.06]"
        aria-hidden
      >
        <svg viewBox="0 0 48 44" fill="none" className="h-full w-full">
          <g strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 39 L24 8 L43 39" stroke="#ffffff" strokeWidth="5" />
            <path d="M13 39 L24 21 L35 39" stroke="#ffffff" strokeWidth="5" />
          </g>
        </svg>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo tone="light" showTagline />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-primary-foreground/70">
              Thoughtfully designed escapes in the heart of the bush. Direct
              booking, instant confirmation, and the best available rate —
              every time.
            </p>
          </div>

          <div>
            <h3 className="eyebrow mb-4 text-leaf">Explore</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <FooterLink label="Home" onClick={() => navigate("/")} />
              </li>
              <li>
                <FooterLink label="Find a Room" onClick={() => navigate("/rooms")} />
              </li>
              {isAuthenticated ? (
                <li>
                  <FooterLink
                    label="My Bookings"
                    onClick={() => navigate("/my-bookings")}
                  />
                </li>
              ) : (
                <li>
                  <FooterLink label="Sign In" onClick={() => navigate("/login")} />
                </li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="eyebrow mb-4 text-leaf">The Promise</h3>
            <ul className="space-y-2.5 text-sm text-primary-foreground/75">
              <li>Best rate guarantee</li>
              <li>Flexible cancellation</li>
              <li>Instant confirmation</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-xs text-primary-foreground/60 sm:flex-row sm:items-center">
          <p>&copy; {year} ALGAFUSION. The Architecture of Escape.</p>
          <p>Secure payments powered by Peach Payments.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-primary-foreground/75 transition-colors hover:text-leaf"
    >
      {label}
    </button>
  );
}
