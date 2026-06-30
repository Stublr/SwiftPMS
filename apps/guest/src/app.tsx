import { useEffect } from "react";
import { useUIStore } from "@/stores/ui.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { initGuestAuthListener } from "@/services/auth";
import { GuestHeader } from "@/components/layout/guest-header";
import { GuestFooter } from "@/components/layout/guest-footer";
import { BrandMark } from "@/components/brand/logo";
import { HomePage } from "@/pages/home";
import { RoomsPage } from "@/pages/rooms";
import { BookingPage } from "@/pages/booking";
import { ConfirmationPage } from "@/pages/confirmation";
import { MyBookingsPage } from "@/pages/my-bookings";
import { LoginPage } from "@/pages/login";
import { PaymentResultPage } from "@/pages/payment-result";

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
    case "/payment-result":
      return <PaymentResultPage />;
    default:
      return <HomePage />;
  }
}

export function App() {
  const isLoading = useGuestAuthStore((s) => s.isLoading);
  const navigate = useUIStore((s) => s.navigate);

  // Peach hosted-checkout return: when the browser lands on
  // /?payment_return=1, route into the in-app payment-result view and strip
  // the query string so a refresh doesn't loop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment_return") === "1") {
      navigate("/payment-result");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [navigate]);

  useEffect(() => {
    const unsub = initGuestAuthListener();
    return () => unsub();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-5">
          <BrandMark className="h-12 w-12 animate-float-slow" />
          <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 animate-[float-slow_1.4s_ease-in-out_infinite] rounded-full bg-accent" />
          </div>
          <p className="eyebrow text-muted-foreground">Preparing your escape</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <GuestHeader />
      <main className="flex-1">
        <PageRouter />
      </main>
      <GuestFooter />
    </div>
  );
}
