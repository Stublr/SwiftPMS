import { useEffect, useState } from "react";

import { useUIStore } from "@/stores/ui.store";
import { useGuestAuthStore } from "@/stores/auth.store";
import {
  applyTourOperator,
  getTourOperatorStatus,
  type TourOperatorStatus,
} from "@/services/tour-operators";

const fieldInput =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function TourOperatorPage() {
  const navigate = useUIStore((s) => s.navigate);
  const isAuthenticated = useGuestAuthStore((s) => s.isAuthenticated);
  const email = useGuestAuthStore((s) => s.email);

  const [status, setStatus] = useState<TourOperatorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getTourOperatorStatus()
      .then(setStatus)
      .catch(() => setError("Failed to load your tour operator status."))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await applyTourOperator({
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        phone: phone.trim(),
        registrationNumber: registrationNumber.trim() || undefined,
        website: website.trim() || undefined,
        message: message.trim() || undefined,
      });
      const fresh = await getTourOperatorStatus();
      setStatus(fresh);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit your application.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <span className="eyebrow text-accent">Partner with us</span>
      <h1 className="mt-2 font-display text-3xl font-semibold text-foreground sm:text-4xl">
        Become a tour operator
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Registered tour operators receive discounted rates on all bookings made
        through this site. Tell us about your business below — our team reviews
        every application, and once approved your operator rate applies
        automatically whenever you're signed in.
      </p>

      {!isAuthenticated ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
          <p className="text-sm text-muted-foreground">
            Please sign in (or create an account) with your business email to
            apply.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="mt-4 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card"
          >
            Sign In
          </button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
        </div>
      ) : status?.isTourOperator ? (
        <div className="mt-8 rounded-2xl border border-leaf/30 bg-leaf-soft/40 p-8 shadow-soft">
          <span className="rounded-full bg-leaf-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-leaf-foreground">
            Approved operator
          </span>
          <h2 className="mt-3 font-display text-xl font-semibold text-foreground">
            You're an official tour operator
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Bookings made while signed in as{" "}
            <span className="font-medium text-foreground">{email}</span> receive
            a {status.discountPercent}% operator discount automatically.
          </p>
          <button
            onClick={() => navigate("/rooms")}
            className="mt-5 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card"
          >
            Browse rooms
          </button>
        </div>
      ) : status?.applicationStatus === "pending" ? (
        <div className="mt-8 rounded-2xl border border-accent/30 bg-accent-soft/40 p-8 shadow-soft">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-dark">
            Under review
          </span>
          <h2 className="mt-3 font-display text-xl font-semibold text-foreground">
            Your application is being reviewed
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Thanks for applying — our team is reviewing your details. You'll
            see your operator rates here as soon as you're approved.
          </p>
        </div>
      ) : (
        <>
          {status?.applicationStatus === "rejected" && (
            <div className="mt-8 rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
              <p className="text-sm font-medium text-destructive">
                Your previous application wasn't approved.
              </p>
              {status.reviewNote && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Reviewer note: {status.reviewNote}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                You're welcome to update your details and apply again below.
              </p>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-soft sm:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Company name *
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={fieldInput}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Contact person *
                </label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={fieldInput}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Phone *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={fieldInput}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Company registration no.{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="text"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className={fieldInput}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Website <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://"
                  className={fieldInput}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Tell us about your business{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Group sizes, how often you bring guests, the areas you operate in…"
                  className={`${fieldInput} resize-none`}
                />
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Your application is linked to{" "}
              <span className="font-medium text-foreground">{email}</span> — once
              approved, operator rates apply to bookings made with this account.
            </p>

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground shadow-soft transition-all hover:bg-accent-dark hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
