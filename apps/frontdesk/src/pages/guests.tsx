import type { Guest, GuestCompanion } from "@swiftpms/shared";
import { COUNTRIES, getDialCodeByCountry } from "@swiftpms/shared";
import { useEffect, useState, useRef, useCallback } from "react";

import { getGuests, createGuest, updateGuest } from "@/services/guests";
import { loadGoogleMaps } from "@/lib/google-maps";

type View = "list" | "create" | "edit";

export function GuestsPage() {
  const [view, setView] = useState<View>("list");
  const [guests, setGuests] = useState<Guest[]>([]);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadGuests();
  }, []);

  async function loadGuests() {
    setLoading(true);
    try {
      const data = await getGuests();
      setGuests(data);
    } catch {
      setError("Failed to load guests");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    setLoading(true);
    try {
      const data = await getGuests(search || undefined);
      setGuests(data);
    } catch {
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(guest: Guest) {
    setEditingGuest(guest);
    setView("edit");
  }

  if (view === "create") {
    return (
      <GuestForm
        title="Add Guest"
        submitLabel="Create Guest"
        onSave={async (data) => {
          await createGuest(data);
          await loadGuests();
          setView("list");
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "edit" && editingGuest) {
    return (
      <GuestForm
        title="Edit Guest"
        submitLabel="Save Changes"
        initial={editingGuest}
        onSave={async (data) => {
          await updateGuest(editingGuest.id, data);
          await loadGuests();
          setView("list");
          setEditingGuest(null);
        }}
        onCancel={() => {
          setView("list");
          setEditingGuest(null);
        }}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Guests</h1>
        <button
          onClick={() => setView("create")}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add Guest
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          placeholder="Search guests by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm"
        />
        <button
          onClick={handleSearch}
          className="rounded-md border border-border bg-white px-4 py-2 text-sm hover:bg-secondary"
        >
          Search
        </button>
      </div>

      {loading ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Nationality</th>
                <th className="px-4 py-3 font-medium">Companions</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {guests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No guests found.
                  </td>
                </tr>
              ) : (
                guests.map((guest) => {
                  const country = COUNTRIES.find((c) => c.code === guest.nationality);
                  return (
                    <tr key={guest.id}>
                      <td className="px-4 py-3 font-medium">
                        {guest.firstName} {guest.lastName}
                      </td>
                      <td className="px-4 py-3">{guest.email ?? "---"}</td>
                      <td className="px-4 py-3">{guest.phone ?? "---"}</td>
                      <td className="px-4 py-3">
                        {country ? `${country.flag} ${country.name}` : guest.nationality ?? "---"}
                      </td>
                      <td className="px-4 py-3">
                        {(guest.companions?.length ?? 0) > 0
                          ? `${guest.companions.length} member${guest.companions.length > 1 ? "s" : ""}`
                          : "---"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleEdit(guest)}
                          className="text-primary hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Unified Guest Form (create + edit) ---

interface GuestFormProps {
  title: string;
  submitLabel: string;
  initial?: Guest;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

function GuestForm({ title, submitLabel, initial, onSave, onCancel }: GuestFormProps) {
  const [form, setForm] = useState({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    email: initial?.email ?? "",
    nationality: initial?.nationality ?? "",
    phone: initial?.phone ?? "",
    idType: initial?.idType ?? "",
    idNumber: initial?.idNumber ?? "",
    address: initial?.address ?? "",
    notes: initial?.notes ?? "",
  });
  const [companions, setCompanions] = useState<GuestCompanion[]>(initial?.companions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const addressRef = useRef<HTMLInputElement>(null);

  // Auto-set phone dial code when nationality changes
  const handleNationalityChange = useCallback((code: string) => {
    setForm((f) => {
      const dialCode = getDialCodeByCountry(code);
      const currentPhone = f.phone;
      // Only auto-set if phone is empty or starts with a dial code
      let newPhone = currentPhone;
      if (!currentPhone || currentPhone === getDialCodeByCountry(f.nationality)) {
        newPhone = dialCode;
      }
      return { ...f, nationality: code, phone: newPhone };
    });
  }, []);

  // Google Maps Places autocomplete
  useEffect(() => {
    if (!addressRef.current) return;
    const input = addressRef.current;

    loadGoogleMaps().then(() => {
      if (!(window as any).google?.maps?.places) return;
      const autocomplete = new (window as any).google.maps.places.Autocomplete(
        input,
        { types: ["address"] },
      );
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place?.formatted_address) {
          setForm((f) => ({ ...f, address: place.formatted_address }));
        }
      });
    });
  }, []);

  function addCompanion() {
    setCompanions((c) => [
      ...c,
      { firstName: "", lastName: "", relationship: "", idType: null, idNumber: null, age: null },
    ]);
  }

  function removeCompanion(index: number) {
    setCompanions((c) => c.filter((_, i) => i !== index));
  }

  function updateCompanion(index: number, field: string, value: unknown) {
    setCompanions((c) =>
      c.map((comp, i) => (i === index ? { ...comp, [field]: value } : comp)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName) {
      setError("First name and last name are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || null,
        nationality: form.nationality || null,
        phone: form.phone || null,
        idType: form.idType || null,
        idNumber: form.idNumber || null,
        address: form.address || null,
        notes: form.notes || null,
        companions: companions.filter((c) => c.firstName && c.lastName),
      };
      await onSave(data);
    } catch {
      setError("Failed to save guest");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "mt-1 w-full rounded-md border border-border px-3 py-2 text-sm";

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {initial && <p className="text-muted-foreground text-sm mt-1">ID: {initial.id}</p>}

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 max-w-2xl space-y-5">
        {/* Name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">First Name *</label>
            <input type="text" required value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium">Last Name *</label>
            <input type="text" required value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              className={inputClass} />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input type="email" value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={inputClass} />
        </div>

        {/* Nationality (dropdown) - BEFORE phone */}
        <div>
          <label className="block text-sm font-medium">Nationality</label>
          <select
            value={form.nationality}
            onChange={(e) => handleNationalityChange(e.target.value)}
            className={inputClass}
          >
            <option value="">Select country...</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Phone with auto dial code */}
        <div>
          <label className="block text-sm font-medium">
            Mobile Number
            {form.nationality && (
              <span className="ml-2 text-xs text-muted-foreground">
                {getDialCodeByCountry(form.nationality)}
              </span>
            )}
          </label>
          <input type="tel" value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder={form.nationality ? getDialCodeByCountry(form.nationality) : "+XX XXXXXXXXX"}
            className={inputClass} />
        </div>

        {/* ID */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">ID Type</label>
            <select value={form.idType}
              onChange={(e) => setForm((f) => ({ ...f, idType: e.target.value }))}
              className={inputClass}>
              <option value="">Select...</option>
              <option value="passport">Passport</option>
              <option value="id_card">National ID</option>
              <option value="drivers_license">Driver's License</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">ID Number</label>
            <input type="text" value={form.idNumber}
              onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))}
              className={inputClass} />
          </div>
        </div>

        {/* Address with Google Maps hint */}
        <div>
          <label className="block text-sm font-medium">Address</label>
          <input
            ref={addressRef}
            type="text"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Start typing to search..."
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Google Maps autocomplete will activate when a Maps API key is configured.
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium">Notes</label>
          <textarea value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2} className={inputClass} />
        </div>

        {/* Companions / Sub-members */}
        <div className="border-t border-border pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Companions / Family Members</h2>
              <p className="text-xs text-muted-foreground">
                Add spouse, children, or other members of the guest's party.
              </p>
            </div>
            <button
              type="button"
              onClick={addCompanion}
              className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              + Add Companion
            </button>
          </div>

          {companions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No companions added.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {companions.map((comp, i) => (
                <div key={i} className="rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      Companion {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCompanion(i)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="block text-xs font-medium">First Name *</label>
                      <input type="text" value={comp.firstName}
                        onChange={(e) => updateCompanion(i, "firstName", e.target.value)}
                        className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-xs" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Last Name *</label>
                      <input type="text" value={comp.lastName}
                        onChange={(e) => updateCompanion(i, "lastName", e.target.value)}
                        className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-xs" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Relationship *</label>
                      <select value={comp.relationship}
                        onChange={(e) => updateCompanion(i, "relationship", e.target.value)}
                        className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-xs">
                        <option value="">Select...</option>
                        <option value="spouse">Spouse</option>
                        <option value="partner">Partner</option>
                        <option value="child">Child</option>
                        <option value="sibling">Sibling</option>
                        <option value="parent">Parent</option>
                        <option value="friend">Friend</option>
                        <option value="colleague">Colleague</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Age</label>
                      <input type="number" min={0} max={150}
                        value={comp.age ?? ""}
                        onChange={(e) => updateCompanion(i, "age", e.target.value ? Number(e.target.value) : null)}
                        className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-xs" />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium">ID Type</label>
                      <select value={comp.idType ?? ""}
                        onChange={(e) => updateCompanion(i, "idType", e.target.value || null)}
                        className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-xs">
                        <option value="">Select...</option>
                        <option value="passport">Passport</option>
                        <option value="id_card">National ID</option>
                        <option value="drivers_license">Driver's License</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium">ID Number</label>
                      <input type="text" value={comp.idNumber ?? ""}
                        onChange={(e) => updateCompanion(i, "idNumber", e.target.value || null)}
                        className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-xs" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-3 border-t border-border pt-5">
          <button type="submit" disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving..." : submitLabel}
          </button>
          <button type="button" onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
