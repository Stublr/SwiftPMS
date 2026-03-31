import type { Property, CreatePropertyRequest } from "@swiftpms/shared";
import { useEffect, useState } from "react";

import { getProperties, createProperty, updateProperty } from "@/services/properties";

type View = "list" | "create" | "edit";

export function AdminPropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("list");
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  useEffect(() => {
    loadProperties();
  }, []);

  async function loadProperties() {
    setLoading(true);
    setError("");
    try {
      setProperties(await getProperties());
    } catch {
      setError("Failed to load properties");
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(property: Property) {
    setEditingProperty(property);
    setView("edit");
  }

  if (view === "create") {
    return (
      <PropertyForm
        onSave={async () => {
          setView("list");
          await loadProperties();
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "edit" && editingProperty) {
    return (
      <PropertyForm
        property={editingProperty}
        onSave={async () => {
          setView("list");
          await loadProperties();
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Properties</h1>
        <button
          onClick={() => setView("create")}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add Property
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : properties.length === 0 ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">
          No properties yet. Add your first property to get started.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-border bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.address && (
                    <p className="mt-1 text-sm text-muted-foreground">{p.address}</p>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.isActive
                      ? "bg-success/10 text-success"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {p.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                {p.phone && <p>Phone: {p.phone}</p>}
                {p.email && <p>Email: {p.email}</p>}
                <p>Check-in: {p.checkInTime} / Check-out: {p.checkOutTime}</p>
              </div>

              {p.amenities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.amenities.map((a) => (
                    <span
                      key={a}
                      className="rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleEdit(p)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  Edit
                </button>
                <button
                  onClick={async () => {
                    try {
                      await updateProperty(p.id, { isActive: !p.isActive });
                      await loadProperties();
                    } catch {
                      setError("You don't have permission to edit properties. Please log in as an admin.");
                    }
                  }}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  {p.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyForm({
  property,
  onSave,
  onCancel,
}: {
  property?: Property;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: property?.name ?? "",
    address: property?.address ?? "",
    phone: property?.phone ?? "",
    email: property?.email ?? "",
    description: property?.description ?? "",
    checkInTime: property?.checkInTime ?? "14:00",
    checkOutTime: property?.checkOutTime ?? "11:00",
    amenities: property?.amenities?.join(", ") ?? "",
    imageUrls: property?.imageUrls?.join("\n") ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Property name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const amenities = form.amenities
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const images = form.imageUrls.split("\n").map((u) => u.trim()).filter(Boolean);
      const data: CreatePropertyRequest & { imageUrls?: string[] } = {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        description: form.description.trim() || undefined,
        checkInTime: form.checkInTime,
        checkOutTime: form.checkOutTime,
        amenities,
        imageUrls: images,
      };
      if (property) {
        await updateProperty(property.id, data);
      } else {
        await createProperty(data);
      }
      await onSave();
    } catch (err) {
      const msg = err && typeof err === "object" && "code" in err
        && (err as { code: string }).code === "permission-denied"
        ? "You don't have permission to edit properties. Please log in as an admin."
        : "Failed to save property";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        {property ? "Edit Property" : "Add Property"}
      </h1>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-4">
        <div>
          <label className="block text-sm font-medium">Name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Lodge 1"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Address</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="123 Main Street, City"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+27 21 555 0100"
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="info@lodge.com"
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="A brief description of the property"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Check-in Time</label>
            <input
              type="time"
              value={form.checkInTime}
              onChange={(e) => setForm((f) => ({ ...f, checkInTime: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Check-out Time</label>
            <input
              type="time"
              value={form.checkOutTime}
              onChange={(e) => setForm((f) => ({ ...f, checkOutTime: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Amenities</label>
          <input
            type="text"
            value={form.amenities}
            onChange={(e) => setForm((f) => ({ ...f, amenities: e.target.value }))}
            placeholder="wifi, pool, parking, restaurant"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">Comma-separated list</p>
        </div>

        <div>
          <label className="block text-sm font-medium">Image URLs</label>
          <textarea
            value={form.imageUrls}
            onChange={(e) => setForm((f) => ({ ...f, imageUrls: e.target.value }))}
            rows={3}
            placeholder="One URL per line"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">Property photos shown on the guest portal. One URL per line.</p>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : property ? "Save Changes" : "Create Property"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
