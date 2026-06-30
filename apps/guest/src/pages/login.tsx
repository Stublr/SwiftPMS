import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import { guestLogin, guestRegister } from "@/services/auth";
import { BrandMark } from "@/components/brand/logo";

type AuthTab = "login" | "register";

const fieldInput =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

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
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="mb-5 h-12 w-12" />
          <span className="eyebrow text-accent">
            {tab === "login" ? "Welcome back" : "Join the escape"}
          </span>
          <h1 className="mt-2 font-display text-3xl font-semibold text-foreground">
            {tab === "login" ? "Sign in to ALGAFUSION" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tab === "login"
              ? "Access your itinerary and manage your reservations."
              : "Register to book rooms and keep track of your stays."}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
          {/* Tabs */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            <TabButton
              active={tab === "login"}
              onClick={() => {
                setTab("login");
                setError(null);
              }}
            >
              Sign In
            </TabButton>
            <TabButton
              active={tab === "register"}
              onClick={() => {
                setTab("register");
                setError(null);
              }}
            >
              Register
            </TabButton>
          </div>

          <form onSubmit={handleSubmit}>
            {tab === "register" && (
              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <Labeled label="First Name" htmlFor="firstName">
                  <input
                    id="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    className={fieldInput}
                  />
                </Labeled>
                <Labeled label="Last Name" htmlFor="lastName">
                  <input
                    id="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    className={fieldInput}
                  />
                </Labeled>
              </div>
            )}

            <div className="mb-4">
              <Labeled label="Email Address" htmlFor="email">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={fieldInput}
                />
              </Labeled>
            </div>

            <div className="mb-4">
              <Labeled label="Password" htmlFor="password">
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className={fieldInput}
                />
              </Labeled>
            </div>

            {tab === "register" && (
              <div className="mb-4">
                <Labeled
                  label="Phone Number (optional)"
                  htmlFor="phone"
                >
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+27 82 123 4567"
                    className={fieldInput}
                  />
                </Labeled>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card disabled:opacity-50"
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground/40 border-t-accent-foreground" />
              )}
              {loading
                ? "Please wait…"
                : tab === "login"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <button
            onClick={() => navigate("/")}
            className="font-medium text-primary transition-colors hover:text-accent"
          >
            &larr; Back to Home
          </button>
        </p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg py-2 text-sm font-semibold transition-all",
        active
          ? "bg-surface text-primary shadow-soft"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Labeled({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
