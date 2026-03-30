import { useState } from "react";

import { pinLogin } from "@/services/auth";
import { usePropertyStore } from "@/stores/property.store";

export function PinLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const tenantId = usePropertyStore((s) => s.tenantId);
  const propertyId = usePropertyStore((s) => s.propertyId);

  if (!propertyId || !tenantId) {
    return (
      <div className="rounded-md bg-secondary px-6 py-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          No property configured
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          A manager must log in via email and select a property first.
        </p>
      </div>
    );
  }

  function handleDigit(digit: string) {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
    }
  }

  function handleBackspace() {
    setPin((prev) => prev.slice(0, -1));
  }

  function handleClear() {
    setPin("");
    setError("");
  }

  async function handleSubmit() {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await pinLogin(pin, propertyId!, tenantId!);
      onSuccess();
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr?.error?.message ?? "Invalid PIN");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""];

  return (
    <div className="space-y-6">
      {/* PIN display */}
      <div className="flex justify-center gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`border-border flex h-12 w-12 items-center justify-center rounded-lg border-2 text-xl font-bold ${
              i < pin.length ? "border-primary bg-primary/5" : ""
            }`}
          >
            {i < pin.length ? "\u2022" : ""}
          </div>
        ))}
      </div>

      {error && (
        <div className="text-center text-sm text-red-600">{error}</div>
      )}

      {/* Numpad */}
      <div className="mx-auto grid max-w-[280px] grid-cols-3 gap-3">
        {digits.map((digit, i) => {
          if (digit === "" && i === 9) {
            return (
              <button
                key="clear"
                onClick={handleClear}
                className="rounded-lg bg-red-50 py-4 text-sm font-medium text-red-600 hover:bg-red-100"
              >
                Clear
              </button>
            );
          }
          if (digit === "" && i === 11) {
            return (
              <button
                key="back"
                onClick={handleBackspace}
                className="bg-secondary rounded-lg py-4 text-sm font-medium hover:bg-secondary/80"
              >
                Back
              </button>
            );
          }
          return (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              className="bg-secondary hover:bg-secondary/80 rounded-lg py-4 text-xl font-semibold transition-colors"
            >
              {digit}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || pin.length < 4}
        className="bg-primary text-primary-foreground w-full rounded-md px-4 py-3 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "Verifying..." : "Enter"}
      </button>
    </div>
  );
}
