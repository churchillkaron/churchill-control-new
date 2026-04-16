"use client";

import { useEffect, useMemo, useState } from "react";

function formatCurrency(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatNumber(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-US").format(num);
}

function formatPercent(value) {
  const num = Number(value || 0);
  return `${num.toFixed(1)}%`;
}

function safeDivide(a, b) {
  const numA = Number(a || 0);
  const numB = Number(b || 0);
  if (!numB) return 0;
  return numA / numB;
}

function getArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.history)) return payload.history;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function extractRows(record) {
  if (Array.isArray(record?.dishes?.rows)) return record.dishes.rows;
  if (Array.isArray(record?.rows)) return record.rows;
  return [];
}

function extractMeta(record) {
  if (record?.dishes?.meta && typeof record.dishes.meta === "object") {
    return record.dishes.meta;
  }
  if (record?.meta && typeof record.meta === "object") {
    return record.meta;
  }
  return {};
}

function extractDate(record, index) {
  return (
    record?.businessDate ||
    record?.date ||
    record?.created_at ||
    record?.createdAt ||
    `Row ${index + 1}`
  );
}

function calculateDayMetrics(record, index) {
  const rows = extractRows(record);
  const meta = extractMeta(record);

  const rowRevenue = rows.reduce((sum, row) => sum + toNumber(row?.revenue), 0);
  const rowCost = rows.reduce(
    (sum, row) =>
      sum +
      (toNumber(row?.cogs) ||
        toNumber(row?.cost) * (toNumber(row?.soldQty) || 0)),
    0
  );
  const soldQty = rows.reduce((sum, row) => sum + toNumber(row?.soldQty), 0);

  const directRevenue =
    toNumber(record?.revenue) ||
    toNumber(record?.totalRevenue) ||
    toNumber(record?.sales) ||
    toNumber(record?.totalSales);

  const directCost =
    toNumber(record?.cost) ||
    toNumber(record?.totalCost) ||
    toNumber(record?.cogs) ||
    toNumber(record?.totalCogs);

  const covers =
    toNumber(meta?.covers) ||
    toNumber(record?.covers) ||
    toNumber(record?.guestCount);

  const revenue = directRevenue || rowRevenue;
  const cost = directCost || rowCost;
  const profit =
    toNumber(record?.profit) ||
    toNumber(record?.grossProfit) ||
    (revenue - cost);

  const salesCount =
    toNumber(record?.salesCount) ||
    toNumber(record?.transactionCount) ||
    toNumber(record?.ticketCount) ||
    toNumber(record?.ordersCount) ||
    soldQty;

  const avgTicket =
    toNumber(record?.avgTicket) ||
    toNumber(record?.averageTicket) ||
    (covers > 0 ? revenue / covers : salesCount > 0 ? revenue / salesCount : 0);

  const margin =
    toNumber(record?.margin) ||
    toNumber(record?.profitMargin) ||
    safeDivide(profit, revenue) * 100;

  return {
    id: record?.id || `${extractDate(record, index)}-${index}`,
    date: extractDate(record, index),
    revenue,
    salesCount,
    avgTicket,
    cost,
    profit,
    margin,
  };
}

function StatCard({ title, value, subValue }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg">
      <div className="text-xs uppercase tracking-[0.2em] text-white/50">
        {title}
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      {subValue ? <div className="mt-2 text-sm text-white/60">{subValue}</div> : null}
    </div>
  );
}

export default function PosControlPage() {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/history", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load history");
        }

        const payload = await response.json();
        const rawRows = getArrayPayload(payload);
        const mapped = rawRows.map(calculateDayMetrics).reverse();

        if (active) {
          setDays(mapped);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load POS control data");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    const totalRevenue = days.reduce((sum, day) => sum + toNumber(day.revenue), 0);
    const totalSalesCount = days.reduce(
      (sum, day) => sum + toNumber(day.salesCount),
      0
    );
    const totalCost = days.reduce((sum, day) => sum + toNumber(day.cost), 0);
    const totalProfit = days.reduce((sum, day) => sum + toNumber(day.profit), 0);
    const avgTicket = totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0;
    const margin = safeDivide(totalProfit, totalRevenue) * 100;

    return {
      totalRevenue,
      totalSalesCount,
      avgTicket,
      totalCost,
      totalProfit,
      margin,
    };
  }, [days]);

  const latestDay = days[0] || null;

  return (
    <div className="min-h-screen bg-[#0b1020] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-r from-white/10 to-white/5 p-6 shadow-2xl">
          <div className="text-xs uppercase tracking-[0.28em] text-white/50">
            Churchill Control System V6
          </div>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">POS Control</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/70 md:text-base">
            Revenue, sales count, average ticket, cost, profit, and margin from
            saved operating days. Clean read-only layer connected to the current
            history system.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
            Loading POS control data...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-red-200">
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                title="Revenue"
                value={formatCurrency(summary.totalRevenue)}
                subValue={
                  latestDay
                    ? `Latest day: ${formatCurrency(latestDay.revenue)}`
                    : "No saved days yet"
                }
              />
              <StatCard
                title="Sales Count"
                value={formatNumber(summary.totalSalesCount)}
                subValue={
                  latestDay
                    ? `Latest day: ${formatNumber(latestDay.salesCount)}`
                    : "No saved days yet"
                }
              />
              <StatCard
                title="Average Ticket"
                value={formatCurrency(summary.avgTicket)}
                subValue={
                  latestDay
                    ? `Latest day: ${formatCurrency(latestDay.avgTicket)}`
                    : "No saved days yet"
                }
              />
              <StatCard
                title="Cost"
                value={formatCurrency(summary.totalCost)}
                subValue={
                  latestDay
                    ? `Latest day: ${formatCurrency(latestDay.cost)}`
                    : "No saved days yet"
                }
              />
              <StatCard
                title="Profit"
                value={formatCurrency(summary.totalProfit)}
                subValue={
                  latestDay
                    ? `Latest day: ${formatCurrency(latestDay.profit)}`
                    : "No saved days yet"
                }
              />
              <StatCard
                title="Margin"
                value={formatPercent(summary.margin)}
                subValue={
                  latestDay
                    ? `Latest day: ${formatPercent(latestDay.margin)}`
                    : "No saved days yet"
                }
              />
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Recent POS Days</h2>
                    <p className="mt-1 text-sm text-white/60">
                      Latest saved operating data from the history route
                    </p>
                  </div>
                  <div className="text-sm text-white/50">
                    {days.length} saved {days.length === 1 ? "day" : "days"}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-white/50">
                        <th className="px-3 py-3 font-medium">Date</th>
                        <th className="px-3 py-3 font-medium">Revenue</th>
                        <th className="px-3 py-3 font-medium">Sales</th>
                        <th className="px-3 py-3 font-medium">Avg Ticket</th>
                        <th className="px-3 py-3 font-medium">Cost</th>
                        <th className="px-3 py-3 font-medium">Profit</th>
                        <th className="px-3 py-3 font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.length === 0 ? (
                        <tr>
                          <td
                            colSpan="7"
                            className="px-3 py-6 text-center text-white/50"
                          >
                            No saved history found yet.
                          </td>
                        </tr>
                      ) : (
                        days.map((day) => (
                          <tr
                            key={day.id}
                            className="border-b border-white/5 text-white/80"
                          >
                            <td className="px-3 py-4">{day.date}</td>
                            <td className="px-3 py-4">
                              {formatCurrency(day.revenue)}
                            </td>
                            <td className="px-3 py-4">
                              {formatNumber(day.salesCount)}
                            </td>
                            <td className="px-3 py-4">
                              {formatCurrency(day.avgTicket)}
                            </td>
                            <td className="px-3 py-4">
                              {formatCurrency(day.cost)}
                            </td>
                            <td className="px-3 py-4">
                              {formatCurrency(day.profit)}
                            </td>
                            <td className="px-3 py-4">
                              {formatPercent(day.margin)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
                <h2 className="text-xl font-semibold">Latest Day Snapshot</h2>
                <p className="mt-1 text-sm text-white/60">
                  Fast read of the newest saved result
                </p>

                {!latestDay ? (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-white/50">
                    No latest day available yet.
                  </div>
                ) : (
                  <div className="mt-6 space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                        Date
                      </div>
                      <div className="mt-2 text-lg font-medium">{latestDay.date}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                          Revenue
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {formatCurrency(latestDay.revenue)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                          Sales
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {formatNumber(latestDay.salesCount)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                          Cost
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {formatCurrency(latestDay.cost)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                          Profit
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {formatCurrency(latestDay.profit)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white/60">Average Ticket</span>
                        <span className="font-semibold">
                          {formatCurrency(latestDay.avgTicket)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm text-white/60">Margin</span>
                        <span className="font-semibold">
                          {formatPercent(latestDay.margin)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}