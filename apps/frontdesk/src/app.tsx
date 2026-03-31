import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { queryClient } from "@/lib/query-client";
import { AdminPropertiesPage } from "@/pages/admin/properties";
import { AdminRoomsPage } from "@/pages/admin/rooms";
import { UsersPage } from "@/pages/admin/users";
import { DashboardPage } from "@/pages/dashboard";
import { GuestsPage } from "@/pages/guests";
import { LoginPage } from "@/pages/login";
import { PropertySelectPage } from "@/pages/property-select";
import { ReportsPage } from "@/pages/reports";
import { ReservationsPage } from "@/pages/reservations";
import { RoomBoardPage } from "@/pages/room-board";
import { useAuthStore } from "@/stores/auth.store";
import { usePropertyStore } from "@/stores/property.store";
import { useUIStore } from "@/stores/ui.store";

function PageRouter() {
  const currentPage = useUIStore((s) => s.currentPage);

  switch (currentPage) {
    case "/rooms":
      return <RoomBoardPage />;
    case "/reservations":
      return <ReservationsPage />;
    case "/guests":
      return <GuestsPage />;
    case "/reports":
      return <ReportsPage />;
    case "/admin/properties":
      return <AdminPropertiesPage />;
    case "/admin/rooms":
      return <AdminRoomsPage />;
    case "/admin/users":
      return <UsersPage />;
    default:
      return <DashboardPage />;
  }
}

function AuthenticatedLayout() {
  const propertyId = usePropertyStore((s) => s.propertyId);

  // No property selected -- show property selection
  if (!propertyId) {
    return (
      <PropertySelectPage
        onPropertySelected={() => {
          // Force re-render happens via store update
        }}
      />
    );
  }

  // Property selected -- show main layout
  return (
    <div className="flex h-screen bg-secondary">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">
          <PageRouter />
        </main>
      </div>
    </div>
  );
}

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [, setForceRender] = useState(0);

  function handleLoginSuccess() {
    setForceRender((n) => n + 1);
  }

  return (
    <QueryClientProvider client={queryClient}>
      {isAuthenticated ? (
        <AuthenticatedLayout />
      ) : (
        <LoginPage onSuccess={handleLoginSuccess} />
      )}
    </QueryClientProvider>
  );
}
