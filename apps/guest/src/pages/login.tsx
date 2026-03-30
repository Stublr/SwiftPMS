import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { guestLogin, guestRegister } from "@/services/auth";

type AuthTab = "login" | "register";

export function LoginPage() {
  const navigate = useUIStore((s) => s.navigate);
  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);

  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) navigate("/my-bookings");
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === "login") {
        await guestLogin(email, password);
      } else {
        if (!firstName.trim() || !lastName.trim()) {
          setError("First name and last name are required.");
          setLoading(false);
          return;
        }
        await guestRegister(
          firstName.trim(),
          lastName.trim(),
          email,
          password,
          phone.trim() || undefined,
        );
      }
      navigate("/my-bookings");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Authentication failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {tab === "login" ? "Welcome Back" : "Create an Account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tab === "login"
              ? "Sign in to manage your bookings and reservations."
              : "Register to book rooms and manage your stays."}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm sm:p-8">
          {/* Tabs */}
          <div className="mb-6 flex border-b border-border">
            <button
              onClick={() => {
                setTab("login");
                setError(null);
              }}
              className={cn(
                "flex-1 pb-3 text-center text-sm font-medium transition-colors",
                tab === "login"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setTab("register");
                setError(null);
              }}
              className={cn(
                "flex-1 pb-3 text-center text-sm font-medium transition-colors",
                tab === "register"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {tab === "register" && (
              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="firstName"
                    className="mb-1 block text-sm font-medium text-foreground"
                  >
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label
                    htmlFor="lastName"
                    className="mb-1 block text-sm font-medium text-foreground"
                  >
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            <div className="mb-4">
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="mb-4">
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {tab === "register" && (
              <div className="mb-4">
                <label
                  htmlFor="phone"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Phone Number{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+27 82 123 4567"
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading
                ? "Please wait..."
                : tab === "login"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <button
            onClick={() => navigate("/")}
            className="font-medium text-primary hover:underline"
          >
            Back to Home
          </button>
        </p>
      </div>
    </div>
  );
}
