import { useEffect } from "react";
import { useUIStore } from "@/stores/ui.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { initGuestAuthListener } from "@/services/auth";
import { GuestHeader } from "@/components/layout/guest-header";
import { HomePage } from "@/pages/home";
import { RoomsPage } from "@/pages/rooms";
import { BookingPage } from "@/pages/booking";
import { ConfirmationPage } from "@/pages/confirmation";
import { MyBookingsPage } from "@/pages/my-bookings";
import { LoginPage } from "@/pages/login";

function PageRouter() {
  const currentPage = useUIStore((s) => s.currentPage);

  switch (currentPage) {
    case "/rooms":
      return <RoomsPage />;
    case "/booking":
      return <BookingPage />;
    case "/confirmation":
      return <ConfirmationPage />;
    case "/my-bookings":
      return <MyBookingsPage />;
    case "/login":
      return <LoginPage />;
    default:
      return <HomePage />;
  }
}

export function App() {
  const isLoading = useGuestAuthStore((s) => s.isLoading);

  useEffect(() => {
    const unsub = initGuestAuthListener();
    return () => unsub();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <GuestHeader />
      <main>
        <PageRouter />
      </main>
    </div>
  );
}
