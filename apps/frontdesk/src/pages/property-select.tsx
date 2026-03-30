import type { Property } from "@swiftpms/shared";
import { useEffect, useState } from "react";

import { getProperties } from "@/services/properties";
import { useAuthStore } from "@/stores/auth.store";
import { usePropertyStore } from "@/stores/property.store";

interface PropertySelectPageProps {
  onPropertySelected: () => void;
}

export function PropertySelectPage({ onPropertySelected }: PropertySelectPageProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const user = useAuthStore((s) => s.user);
  const setProperty = usePropertyStore((s) => s.setProperty);

  useEffect(() => {
    if (!user) return;

    // Store tenantId so getProperties() can read it
    usePropertyStore.getState().setProperty(user.tenantId, "", "");

    getProperties()
      .then((props) => {
        // Filter to properties the user has access to
        const accessible = user.propertyIds.length > 0
          ? props.filter((p) => user.propertyIds.includes(p.id))
          : props;
        setProperties(accessible);
      })
      .catch(() => setError("Failed to load properties"))
      .finally(() => setLoading(false));
  }, [user]);

  function handleSelectProperty(property: Property) {
    setProperty(user!.tenantId, property.id, property.name);
    onPropertySelected();
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-secondary">
        <p className="text-muted-foreground">Loading properties...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-white p-8">
        <h1 className="text-2xl font-bold">Select Property</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a property to manage.
        </p>

        {error && (
          <div className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-2">
          {properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">No properties available.</p>
          ) : (
            properties.map((property) => (
              <button
                key={property.id}
                onClick={() => handleSelectProperty(property)}
                className="flex w-full items-center justify-between rounded-md border border-border px-4 py-3 text-left transition-colors hover:bg-secondary"
              >
                <div>
                  <p className="font-medium">{property.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {property.address ?? "No address set"}
                  </p>
                </div>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    property.isActive
                      ? "bg-success/10 text-success"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {property.isActive ? "Active" : "Inactive"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
