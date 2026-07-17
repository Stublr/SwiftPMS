import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { UserRole } from "@swiftpms/shared";

import { Header } from "@/components/layout/header";
import { InstallPrompt } from "@/components/install-prompt";
import { Sidebar } from "@/components/layout/sidebar";
import { queryClient } from "@/lib/query-client";
import { AdminPropertiesPage } from "@/pages/admin/properties";
import { AdminRoomsPage } from "@/pages/admin/rooms";
import { TourOperatorsPage } from "@/pages/admin/tour-operators";
import { UsersPage } from "@/pages/admin/users";
import { CashupPage } from "@/pages/cashup";
import { CheckInPage } from "@/pages/check-in";
import { DashboardPage } from "@/pages/dashboard";
import { LegacyBookingPage } from "@/pages/legacy-booking";
import { GuestsPage } from "@/pages/guests";
import { LoginPage } from "@/pages/login";
import { PropertySelectPage } from "@/pages/property-select";
import { ReportsPage } from "@/pages/reports";
import { ReservationsPage } from "@/pages/reservations";
import { RoomBoardPage } from "@/pages/room-board";
import { ScanPage } from "@/pages/scan";
import { TodayPage } from "@/pages/today";
import { WalkInPage } from "@/pages/walk-in";
import { MobileFolioPage } from "@/pages/mobile-folio";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useAuthStore } from "@/stores/auth.store";
import { usePropertyStore } from "@/stores/property.store";
import { useUIStore } from "@/stores/ui.store";

// Roles absent from this map are unrestricted (existing behavior for all
// staff roles). A scanner is locked to the scan + check-in flow only.
const ROLE_ALLOWED_PATHS: Partial<Record<UserRole, string[]>> = {
  [UserRole.SCANNER]: ["/scan", "/check-in"],
};

function PageRouter() {
  const currentPage = useUIStore((s) => s.currentPage);
  const role = useAuthStore((s) => s.user?.role);

  const allowedPaths = role ? ROLE_ALLOWED_PATHS[role] : undefined;
  if (allowedPaths && !allowedPaths.includes(currentPage)) {
    // Render the scanner's home directly instead of navigating during
    // render (which would set up a render -> effect -> render loop).
    return <ScanPage />;
  }

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
    case "/tour-operators":
      return <TourOperatorsPage />;
    case "/cashup":
      return <CashupPage />;
    case "/legacy-booking":
      return <LegacyBookingPage />;
    case "/check-in":
      return <CheckInPage />;
    case "/scan":
      return <ScanPage />;
    case "/walk-in":
      return <WalkInPage />;
    case "/today":
      return <TodayPage />;
    case "/folio":
      return <MobileFolioPage />;
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

  // Property selected -- show main layout with desktop sidebar + mobile bottom-tab nav
  // Safe-area: pt on the header (below iPhone Dynamic Island / notch) is applied
  // inside Header itself; pb here reserves space for the MobileNav (~56px) plus
  // the iOS home-indicator safe area.
  return (
    <div className="flex h-screen bg-secondary">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main
          className="flex-1 overflow-auto md:pb-0"
          style={{
            paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <PageRouter />
        </main>
        <MobileNav />
      </div>
    </div>
  );
}

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  const currentPage = useUIStore((s) => s.currentPage);
  const navigate = useUIStore((s) => s.navigate);
  const [, setForceRender] = useState(0);

  // Deep-link routing — pick up the URL path on first load so:
  //   /check-in?res=...&p=...&t=...   → in-app CheckInPage (QR scan target)
  //   /scan                            → QR scanner
  //   /walk-in                         → walk-in booking form
  //   /today                           → today's arrivals/departures
  //   /folio?res=...                   → mobile folio view
  // If not logged in, LoginPage renders first; URL params survive login so
  // the deep-linked view picks them up on the next render.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    const known = ["/check-in", "/scan", "/walk-in", "/today", "/folio", "/cashup", "/legacy-booking"];
    if (known.includes(path)) {
      navigate(path);
    }
  }, [navigate]);

  // A scanner's home is /scan, not the Dashboard -- send them there directly
  // once authenticated so they never see a Dashboard flash before the
  // PageRouter gate would otherwise bounce them.
  useEffect(() => {
    if (isAuthenticated && role === UserRole.SCANNER && currentPage === "/") {
      navigate("/scan");
    }
  }, [isAuthenticated, role, currentPage, navigate]);

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
      {/* Renders on both auth states — install is useful whether the guest is
          logging in for the first time or already signed in. */}
      <InstallPrompt />
    </QueryClientProvider>
  );
}
