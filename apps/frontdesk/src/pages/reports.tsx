import { formatCents } from "@swiftpms/shared";
import { useEffect, useState } from "react";

import { getDailyAggregates } from "@/services/reports";

type Tab = "occupancy" | "revenue";

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().split("T")[0]!,
    endDate: end.toISOString().split("T")[0]!,
  };
}

interface AggregateRow {
  date: string;
  totalRooms?: number;
  occupiedRooms?: number;
  occupancyRate?: number;
  roomRevenue?: number;
  serviceRevenue?: number;
  totalRevenue?: number;
  [key: string]: unknown;
}

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("occupancy");
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AggregateRow[]>([]);

  useEffect(() => {
    setLoading(true);
    getDailyAggregates(dateRange.startDate, dateRange.endDate)
      .then((rows) => setData(rows as AggregateRow[]))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [dateRange]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "occupancy", label: "Occupancy" },
    { key: "revenue", label: "Revenue" },
  ];

  // Compute totals for revenue
  const revenueTotals = data.reduce(
    (acc, row) => ({
      roomRevenue: acc.roomRevenue + ((row.roomRevenue as number) ?? 0),
      serviceRevenue: acc.serviceRevenue + ((row.serviceRevenue as number) ?? 0),
      totalRevenue: acc.totalRevenue + ((row.totalRevenue as number) ?? 0),
    }),
    { roomRevenue: 0, serviceRevenue: 0, totalRevenue: 0 },
  );

  // Compute average occupancy
  const avgOccupancy =
    data.length > 0
      ? Math.round(
          data.reduce((sum, row) => sum + ((row.occupancyRate as number) ?? 0), 0) / data.length,
        )
      : 0;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      {/* Date range controls */}
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-muted-foreground block text-xs">Start Date</label>
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange((d) => ({ ...d, startDate: e.target.value }))}
            className="mt-1 rounded-md border border-border bg-white px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-muted-foreground block text-xs">End Date</label>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange((d) => ({ ...d, endDate: e.target.value }))}
            className="mt-1 rounded-md border border-border bg-white px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mt-8 text-center text-sm text-muted-foreground">Loading...</div>
      )}

      {/* Occupancy tab */}
      {!loading && activeTab === "occupancy" && (
        <div className="mt-4">
          {/* Summary */}
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-muted-foreground text-xs">Average Occupancy</p>
              <p className="mt-1 text-xl font-bold">{avgOccupancy}%</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-muted-foreground text-xs">Days Tracked</p>
              <p className="mt-1 text-xl font-bold">{data.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-muted-foreground text-xs">Peak Occupancy</p>
              <p className="mt-1 text-xl font-bold">
                {data.length > 0
                  ? `${Math.max(...data.map((r) => (r.occupancyRate as number) ?? 0))}%`
                  : "---"}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Total Rooms</th>
                  <th className="px-4 py-3 font-medium text-right">Occupied</th>
                  <th className="px-4 py-3 font-medium text-right">Occupancy Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No data for this period.
                    </td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.date}>
                      <td className="px-4 py-3 font-medium">{row.date}</td>
                      <td className="px-4 py-3 text-right">{row.totalRooms ?? 0}</td>
                      <td className="px-4 py-3 text-right">{row.occupiedRooms ?? 0}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            (row.occupancyRate ?? 0) >= 80
                              ? "bg-success/10 text-success"
                              : (row.occupancyRate ?? 0) >= 50
                                ? "bg-warning/10 text-warning"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {row.occupancyRate ?? 0}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Revenue tab */}
      {!loading && activeTab === "revenue" && (
        <div className="mt-4">
          {/* Summary */}
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-muted-foreground text-xs">Room Revenue</p>
              <p className="mt-1 text-xl font-bold">{formatCents(revenueTotals.roomRevenue)}</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-muted-foreground text-xs">Service Revenue</p>
              <p className="mt-1 text-xl font-bold">{formatCents(revenueTotals.serviceRevenue)}</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-muted-foreground text-xs">Total Revenue</p>
              <p className="mt-1 text-xl font-bold">{formatCents(revenueTotals.totalRevenue)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Room Revenue</th>
                  <th className="px-4 py-3 font-medium text-right">Service Revenue</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No data for this period.
                    </td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.date}>
                      <td className="px-4 py-3 font-medium">{row.date}</td>
                      <td className="px-4 py-3 text-right">
                        {formatCents((row.roomRevenue as number) ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCents((row.serviceRevenue as number) ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCents((row.totalRevenue as number) ?? 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
