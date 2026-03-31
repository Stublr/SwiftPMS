import { usePropertyStore } from "@/stores/property.store";
import { useUIStore } from "@/stores/ui.store";

const mainNavItems = [
  { label: "Dashboard", path: "/", icon: "D" },
  { label: "Room Board", path: "/rooms", icon: "R" },
  { label: "Reservations", path: "/reservations", icon: "B" },
  { label: "Guests", path: "/guests", icon: "G" },
  { label: "Reports", path: "/reports", icon: "P" },
];

const adminNavItems = [
  { label: "Properties", path: "/admin/properties", icon: "P" },
  { label: "Room Setup", path: "/admin/rooms", icon: "S" },
  { label: "Staff", path: "/admin/users", icon: "U" },
];

export function Sidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const currentPage = useUIStore((s) => s.currentPage);
  const navigate = useUIStore((s) => s.navigate);
  const propertyName = usePropertyStore((s) => s.propertyName);

  function renderNavButton(item: { label: string; path: string; icon: string }) {
    return (
      <button
        key={item.path}
        onClick={() => navigate(item.path)}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          currentPage === item.path
            ? "bg-primary text-primary-foreground"
            : "hover:bg-primary/20"
        }`}
      >
        <span className="w-5 text-center text-xs font-bold">{item.icon}</span>
        {sidebarOpen && <span>{item.label}</span>}
      </button>
    );
  }

  return (
    <aside
      className={`bg-foreground text-background flex h-screen flex-col transition-all duration-200 ${
        sidebarOpen ? "w-60" : "w-16"
      }`}
    >
      <div className="flex h-14 items-center justify-center border-b border-white/10 px-4">
        <span className="text-lg font-bold">
          {sidebarOpen ? "SwiftPMS" : "S"}
        </span>
      </div>

      {/* Property info removed — now in header dropdown */}

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {mainNavItems.map(renderNavButton)}

        {/* Admin section divider */}
        {sidebarOpen && (
          <div className="px-3 pt-4 pb-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Admin
            </p>
          </div>
        )}
        {!sidebarOpen && <div className="my-2 border-t border-white/10" />}

        {adminNavItems.map(renderNavButton)}
      </nav>
    </aside>
  );
}
