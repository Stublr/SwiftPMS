import { ConnectivityIndicator } from "@/components/layout/connectivity-indicator";
import { logout } from "@/services/auth";
import { useAuthStore } from "@/stores/auth.store";
import { useUIStore } from "@/stores/ui.store";

export function Header() {
  const user = useAuthStore((s) => s.user);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  async function handleLogout() {
    await logout();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-white px-4">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="rounded-md p-2 text-sm hover:bg-secondary"
        >
          Menu
        </button>
        <ConnectivityIndicator />
      </div>
      <div className="flex items-center gap-4">
        <div className="text-sm text-muted-foreground">
          {user ? `${user.fullName} (${user.role.replace("_", " ")})` : "Not logged in"}
        </div>
        {user && (
          <button
            onClick={handleLogout}
            className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Logout
          </button>
        )}
      </div>
    </header>
  );
}
