import { useEffect, useState } from "react";

import { type Reservation } from "@swiftpms/shared";

import {
  getArrivalsForDate,
  getDeparturesForDate,
  getInHouseForDate,
} from "@/services/reservations";
import { useUIStore } from "@/stores/ui.store";

type Bucket = "arrivals" | "inhouse" | "departures";

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

export function TodayPage() {
  const navigate = useUIStore((s) => s.navigate);
  const [arrivals, setArrivals] = useState<Reservation[]>([]);
  const [inhouse, setInhouse] = useState<Reservation[]>([]);
  const [departures, setDepartures] = useState<Reservation[]>([]);
  const [tab, setTab] = useState<Bucket>("arrivals");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const today = todayIso();
      // Three targeted queries in parallel — each is exact, none capped at 100
      // (the old single-getReservations call ordered by createdAt and would
      // miss bookings made months ago that happen to check in today).
      const [arr, dep, inh] = await Promise.all([
        getArrivalsForDate(today),
        getDeparturesForDate(today),
        getInHouseForDate(today),
      ]);
      setArrivals(arr);
      setDepartures(dep);
      setInhouse(inh);
    } finally {
      setLoading(false);
    }
  }

  const current =
    tab === "arrivals" ? arrivals : tab === "inhouse" ? inhouse : departures;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Today</h1>
      <p className="text-sm text-muted-foreground">
        {new Date().toLocaleDateString("en-ZA", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <TabButton active={tab === "arrivals"} onClick={() => setTab("arrivals")} count={arrivals.length} label="Arrivals" />
        <TabButton active={tab === "inhouse"} onClick={() => setTab("inhouse")} count={inhouse.length} label="In-house" />
        <TabButton active={tab === "departures"} onClick={() => setTab("departures")} count={departures.length} label="Departures" />
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : current.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing in this bucket today.
          </p>
        ) : (
          current.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/folio?res=${r.id}`)}
              className="w-full rounded-lg border border-border bg-white p-4 text-left shadow-sm hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-baseline justify-between">
                <div className="font-mono text-xs text-muted-foreground">
                  {r.id.slice(0, 8).toUpperCase()}
                </div>
                <StatusPill status={r.status} />
              </div>
              <div className="mt-1 text-sm">
                <span className="font-medium">
                  {r.adults} adult{r.adults !== 1 ? "s" : ""}
                  {r.children > 0 ? ` + ${r.children}` : ""}
                </span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {r.checkInDate} → {r.checkOutDate}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  label,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-center text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-white text-muted-foreground"
      }`}
    >
      <div className="text-lg font-bold">{count}</div>
      <div>{label}</div>
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    confirmed: "bg-blue-50 text-blue-700",
    checked_in: "bg-green-50 text-green-700",
    checked_out: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-50 text-red-700",
    no_show: "bg-amber-50 text-amber-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
        colors[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
