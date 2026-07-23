import { useEffect, useState } from "react";

import {
  listTourOperators,
  addTourOperator,
  setTourOperatorActive,
  setDiscount,
  getDiscount,
  listTourOperatorApplications,
  reviewApplication,
  type TourOperator,
  type TourOperatorApplication,
} from "@/services/tour-operators";

export function TourOperatorsPage() {
  const [operators, setOperators] = useState<TourOperator[]>([]);
  const [applications, setApplications] = useState<TourOperatorApplication[]>([]);
  const [discountPercent, setDiscountPercent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [ops, discount, apps] = await Promise.all([
        listTourOperators(),
        getDiscount(),
        listTourOperatorApplications(),
      ]);
      setOperators(ops);
      setDiscountPercent(String(discount));
      setApplications(apps);
    } catch {
      setError("Failed to load tour operators");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(app: TourOperatorApplication, approve: boolean) {
    let note: string | undefined;
    if (!approve) {
      note = window.prompt("Reason for rejection (shown to the applicant, optional):") ?? undefined;
    }
    setReviewingId(app.id);
    setError("");
    try {
      await reviewApplication(app.id, approve, note);
      await loadData();
    } catch {
      setError("Failed to review application. Managers and admins only.");
    } finally {
      setReviewingId(null);
    }
  }

  async function handleAddEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAddingEmail(true);
    setError("");
    try {
      await addTourOperator(newEmail.trim());
      setNewEmail("");
      await loadData();
    } catch (err) {
      const isPermission = err && typeof err === "object" && "code" in err
        && (err as { code: string }).code === "permission-denied";
      setError(isPermission
        ? "You don't have permission to manage tour operators. Please log in as an admin."
        : "Failed to add tour operator");
    } finally {
      setAddingEmail(false);
    }
  }

  async function handleToggleActive(operator: TourOperator) {
    setError("");
    try {
      await setTourOperatorActive(operator.id, !operator.active);
      await loadData();
    } catch {
      setError("You don't have permission to manage tour operators. Please log in as an admin.");
    }
  }

  async function handleSaveDiscount(e: React.FormEvent) {
    e.preventDefault();
    setSavingDiscount(true);
    setError("");
    try {
      const percent = parseFloat(discountPercent) || 0;
      await setDiscount(percent);
    } catch (err) {
      const isPermission = err && typeof err === "object" && "code" in err
        && (err as { code: string }).code === "permission-denied";
      setError(isPermission
        ? "You don't have permission to set the discount. Managers and admins only."
        : "Failed to save discount");
    } finally {
      setSavingDiscount(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Tour Operators</h1>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4 max-w-md rounded-lg border border-border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Global tour-operator discount %</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Applied to guest-portal bookings made by a signed-in tour operator email.
        </p>
        <form onSubmit={handleSaveDiscount} className="mt-3 flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium">Discount %</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              className="mt-1 w-32 rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={savingDiscount}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {savingDiscount ? "Saving..." : "Save"}
          </button>
        </form>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          Applications
          {applications.some((a) => a.status === "pending") && (
            <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-dark">
              {applications.filter((a) => a.status === "pending").length} pending
            </span>
          )}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Submitted from the guest site. Approving adds the applicant's email to
          the operator list automatically.
        </p>

        {!loading && applications.length === 0 && (
          <div className="mt-3 rounded-lg border border-dashed border-border bg-secondary/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No applications yet.
          </div>
        )}

        {applications.length > 0 && (
          <div className="mt-3 space-y-3">
            {applications.map((app) => (
              <div key={app.id} className="rounded-lg border border-border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{app.companyName}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          app.status === "pending"
                            ? "bg-accent/15 text-accent-dark"
                            : app.status === "approved"
                              ? "bg-success/10 text-success"
                              : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {app.contactName} &middot; {app.email} &middot; {app.phone}
                    </div>
                    {(app.registrationNumber || app.website) && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {app.registrationNumber && <>Reg: {app.registrationNumber}</>}
                        {app.registrationNumber && app.website && " · "}
                        {app.website && <>Web: {app.website}</>}
                      </div>
                    )}
                    {app.message && (
                      <p className="mt-2 max-w-xl text-sm text-foreground/80">{app.message}</p>
                    )}
                    {app.status === "rejected" && app.reviewNote && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Rejection note: {app.reviewNote}
                      </p>
                    )}
                  </div>
                  {app.status === "pending" && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => handleReview(app, true)}
                        disabled={reviewingId === app.id}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {reviewingId === app.id ? "Saving..." : "Approve"}
                      </button>
                      <button
                        onClick={() => handleReview(app, false)}
                        disabled={reviewingId === app.id}
                        className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Operator emails</h2>
      </div>

      <form onSubmit={handleAddEmail} className="mt-3 flex max-w-md items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium">Add email</label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="operator@example.com"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={addingEmail}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {addingEmail ? "Adding..." : "Add"}
        </button>
      </form>

      {loading ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : operators.length === 0 ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">
          No tour operators yet. Add an email above.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {operators.map((op) => (
                <tr key={op.id}>
                  <td className="px-4 py-3 font-medium">{op.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        op.active
                          ? "bg-success/10 text-success"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {op.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggleActive(op)}
                      className="text-primary hover:underline"
                    >
                      {op.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
