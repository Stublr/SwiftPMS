import { useState } from "react";
import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";

import { useUIStore } from "@/stores/ui.store";

/**
 * Mobile QR scanner for staff. Decodes a booking QR which encodes a URL
 * shaped like:  https://swiftpms-prod.web.app/check-in?res=...&p=...&t=...
 *
 * On scan: parse the URL, push its query string into window.location.search
 * (so the existing CheckInPage can pick up the params), then route to
 * /check-in via the in-app navigator.
 */
export function ScanPage() {
  const navigate = useUIStore((s) => s.navigate);
  const [error, setError] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const [paused, setPaused] = useState(false);

  function applyAndCheckIn(res: string, p: string | null, t: string | null) {
    const qs = new URLSearchParams();
    qs.set("res", res);
    if (p) qs.set("p", p);
    if (t) qs.set("t", t);
    window.history.replaceState({}, "", `/check-in?${qs.toString()}`);
    navigate("/check-in");
  }

  function handleScan(detected: IDetectedBarcode[]) {
    if (!detected.length || paused) return;
    setPaused(true);
    const raw = detected[0]!.rawValue;
    try {
      // Most QRs encode the full check-in URL.
      const url = new URL(raw);
      const res = url.searchParams.get("res");
      const p = url.searchParams.get("p");
      const t = url.searchParams.get("t");
      if (res) {
        applyAndCheckIn(res, p, t);
        return;
      }
    } catch {
      // Not a URL — fall through to plain-token handling below
    }

    // Plain-token fallback: if QR just contains the reservation ID itself
    if (/^[A-Za-z0-9_-]{8,}$/.test(raw.trim())) {
      applyAndCheckIn(raw.trim(), null, null);
      return;
    }

    setError(
      `Unrecognised QR content: ${raw.slice(0, 80)}${raw.length > 80 ? "…" : ""}`,
    );
    setTimeout(() => {
      setError(null);
      setPaused(false);
    }, 2500);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualId.trim()) return;
    applyAndCheckIn(manualId.trim(), null, null);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Scan booking QR</h1>
        <button
          onClick={() => navigate("/")}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
        >
          Done
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-black">
        <Scanner
          onScan={handleScan}
          onError={(err) => {
            setError(
              err instanceof Error
                ? err.message
                : "Camera unavailable. Use manual entry below.",
            );
          }}
          paused={paused}
          formats={["qr_code"]}
          components={{
            finder: true,
            torch: true,
            tracker: undefined,
          }}
          styles={{ container: { width: "100%", paddingTop: "100%" } }}
        />
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Point at the booking QR on the guest's phone or printed confirmation.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {/* Manual fallback */}
      <details className="mt-6 rounded-lg border border-border bg-background p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Can't scan? Enter reservation ID
        </summary>
        <form onSubmit={handleManualSubmit} className="mt-3 flex gap-2">
          <input
            type="text"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="e.g. 6PJAtIYGiAfJ2i4tSn7i"
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!manualId.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Open
          </button>
        </form>
      </details>
    </div>
  );
}
