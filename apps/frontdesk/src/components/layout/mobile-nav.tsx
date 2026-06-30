import { useUIStore } from "@/stores/ui.store";

const TABS = [
  { path: "/today", label: "Today", icon: "sun" },
  { path: "/scan", label: "Scan", icon: "qr" },
  { path: "/walk-in", label: "Walk-in", icon: "plus" },
  { path: "/", label: "Dashboard", icon: "grid" },
] as const;

export function MobileNav() {
  const currentPage = useUIStore((s) => s.currentPage);
  const navigate = useUIStore((s) => s.navigate);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white shadow-[0_-4px_8px_-2px_rgba(0,0,0,0.08)] md:hidden">
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active =
            currentPage === tab.path ||
            (tab.path === "/" && currentPage !== "/today" && currentPage !== "/scan" && currentPage !== "/walk-in");
          return (
            <li key={tab.path}>
              <button
                onClick={() => navigate(tab.path)}
                className={`flex w-full flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium transition-colors ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <NavIcon name={tab.icon} active={active} />
                <span>{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? 2.4 : 2;
  switch (name) {
    case "sun":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={stroke}>
          <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.95-6.95l-1.41 1.41M7.46 16.54l-1.41 1.41m0-12.49l1.41 1.41m9.08 9.08l1.41 1.41" />
        </svg>
      );
    case "qr":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={stroke}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5A1.5 1.5 0 014.5 3h4A1.5 1.5 0 0110 4.5v4A1.5 1.5 0 018.5 10h-4A1.5 1.5 0 013 8.5v-4zM14 4.5A1.5 1.5 0 0115.5 3h4A1.5 1.5 0 0121 4.5v4a1.5 1.5 0 01-1.5 1.5h-4A1.5 1.5 0 0114 8.5v-4zM3 15.5A1.5 1.5 0 014.5 14h4a1.5 1.5 0 011.5 1.5v4A1.5 1.5 0 018.5 21h-4A1.5 1.5 0 013 19.5v-4zM14 14h7M14 17h4v4h-4zM21 14v3" />
        </svg>
      );
    case "plus":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={stroke}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      );
    case "grid":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={stroke}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      );
    default:
      return null;
  }
}
