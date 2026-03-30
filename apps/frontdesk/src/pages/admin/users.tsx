import { UserRole } from "@swiftpms/shared";
import { useEffect, useState } from "react";

import type { Property } from "@swiftpms/shared";
import { getProperties } from "@/services/properties";
import type { UserWithProperties } from "@/services/users";
import { createUser, deleteUser, getUsers, resetUserPin, updateUser } from "@/services/users";
import type { CreateUserRequest, UpdateUserRequest } from "@swiftpms/shared";

type View = "list" | "create" | "edit";

const ROLE_OPTIONS = [
  { value: UserRole.SUPER_ADMIN, label: "Super Admin" },
  { value: UserRole.PROPERTY_MANAGER, label: "Property Manager" },
  { value: UserRole.FRONT_DESK, label: "Front Desk" },
  { value: UserRole.HOUSEKEEPING, label: "Housekeeping" },
  { value: UserRole.AUDITOR, label: "Auditor" },
];

export function UsersPage() {
  const [view, setView] = useState<View>("list");
  const [users, setUsers] = useState<UserWithProperties[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [editingUser, setEditingUser] = useState<UserWithProperties | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([getUsers(), getProperties()]);
      setUsers(u);
      setProperties(p);
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    setLoading(true);
    try {
      const u = await getUsers({ search: search || undefined });
      setUsers(u);
    } catch {
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(user: UserWithProperties) {
    setEditingUser(user);
    setView("edit");
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to deactivate this user?")) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      setError("Failed to deactivate user");
    }
  }

  if (view === "create") {
    return (
      <UserForm
        properties={properties}
        onSave={async (data) => {
          await createUser(data);
          await loadData();
          setView("list");
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "edit" && editingUser) {
    return (
      <UserEditForm
        user={editingUser}
        properties={properties}
        onSave={async (data) => {
          await updateUser(editingUser.id, data);
          await loadData();
          setView("list");
          setEditingUser(null);
        }}
        onCancel={() => {
          setView("list");
          setEditingUser(null);
        }}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Staff</h1>
        <button
          onClick={() => setView("create")}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add User
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
          placeholder="Search users..."
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
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium">{user.fullName}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs capitalize">
                        {user.role.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          user.isActive
                            ? "bg-success/10 text-success"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-primary hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-destructive hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserForm({
  properties,
  onSave,
  onCancel,
}: {
  properties: Property[];
  onSave: (data: CreateUserRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CreateUserRequest>({
    email: "",
    password: "",
    fullName: "",
    role: UserRole.FRONT_DESK,
    pin: "",
    propertyIds: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({
        ...form,
        pin: form.pin || undefined,
      });
    } catch {
      setError("Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Create User</h1>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-4">
        <div>
          <label className="block text-sm font-medium">Full Name</label>
          <input
            type="text"
            required
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Password</label>
          <input
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof form.role }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">PIN (optional, 4-6 digits)</label>
          <input
            type="text"
            maxLength={6}
            pattern="\d{0,6}"
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Properties</label>
          <div className="mt-1 space-y-1">
            {properties.map((property) => (
              <label key={property.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.propertyIds.includes(property.id)}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      propertyIds: e.target.checked
                        ? [...f.propertyIds, property.id]
                        : f.propertyIds.filter((id) => id !== property.id),
                    }));
                  }}
                />
                {property.name}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create User"}
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

function UserEditForm({
  user,
  properties,
  onSave,
  onCancel,
}: {
  user: UserWithProperties;
  properties: Property[];
  onSave: (data: UpdateUserRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<UpdateUserRequest>({
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    propertyIds: user.propertyIds,
  });
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pinMsg, setPinMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(form);
    } catch {
      setError("Failed to update user");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPin() {
    if (!newPin || !/^\d{4,6}$/.test(newPin)) {
      setPinMsg("PIN must be 4-6 digits");
      return;
    }
    try {
      await resetUserPin(user.id, newPin);
      setPinMsg("PIN updated");
      setNewPin("");
    } catch {
      setPinMsg("Failed to reset PIN");
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Edit User</h1>
      <p className="text-muted-foreground text-sm mt-1">ID: {user.id}</p>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-4">
        <div>
          <label className="block text-sm font-medium">Full Name</label>
          <input
            type="text"
            required
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof user.role }))}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium">Properties</label>
          <div className="mt-1 space-y-1">
            {properties.map((property) => (
              <label key={property.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.propertyIds?.includes(property.id) ?? false}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      propertyIds: e.target.checked
                        ? [...(f.propertyIds ?? []), property.id]
                        : (f.propertyIds ?? []).filter((id) => id !== property.id),
                    }));
                  }}
                />
                {property.name}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
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

      {/* Reset PIN section */}
      <div className="mt-6 max-w-lg border-t border-border pt-4">
        <h2 className="text-sm font-medium">Reset PIN</h2>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            maxLength={6}
            placeholder="New PIN (4-6 digits)"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
          />
          <button
            onClick={handleResetPin}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            Reset
          </button>
        </div>
        {pinMsg && (
          <p className="mt-1 text-xs text-muted-foreground">{pinMsg}</p>
        )}
      </div>
    </div>
  );
}
