"use client";

import { useEffect, useMemo, useState } from "react";

function formatMoney(v) {
  return `฿${Number(v || 0).toLocaleString()}`;
}

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  return date.toLocaleDateString("en-GB");
}

export default function DashboardPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/history", {
          cache: "no-store",
        });

        const data = await res.json();

        const list = Array.isArray(data)
          ? data
          : data?.data || data?.reports || [];

        setReports(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const stats = useMemo(() => {
    if (reports.length === 0) return null;

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;

    let best = null;
    let worst = null;

    reports.forEach((r) => {
      const profit = Number(r.profit || 0);

      totalRevenue += Number(r.revenue || 0);
      totalCost += Number(r.cost || 0);
      totalProfit += profit;

      if (!best || profit > Number(best.profit)) {
        best = r;
      }

      if (!worst || profit < Number(worst.profit)) {
        worst = r;
      }
    });

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      avgProfit: totalProfit / reports.length,
      best,
      worst,
      days: reports.length,
    };
  }, [reports]);

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  if (!stats) return <div style={{ padding: 20 }}>No data yet</div>;

  return (
    <div style={{ padding: 24, background: "#f5f7fb", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>
        Owner Dashboard
      </h1>

      {/* TOP CARDS */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <Card title="Total Revenue" value={formatMoney(stats.totalRevenue)} />
        <Card title="Total Cost" value={formatMoney(stats.totalCost)} />
        <Card
          title="Total Profit"
          value={formatMoney(stats.totalProfit)}
          color={stats.totalProfit >= 0 ? "#15803d" : "#b91c1c"}
        />
        <Card
          title="Avg Profit / Day"
          value={formatMoney(stats.avgProfit)}
        />
      </div>

      {/* INSIGHTS */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <Insight
          title="Best Day"
          value={formatDate(stats.best?.date)}
          sub={`Profit: ${formatMoney(stats.best?.profit)}`}
        />

        <Insight
          title="Worst Day"
          value={formatDate(stats.worst?.date)}
          sub={`Profit: ${formatMoney(stats.worst?.profit)}`}
        />

        <Insight
          title="Days Tracked"
          value={stats.days}
        />
      </div>

      {/* DAILY LIST */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: 16,
        }}
      >
        <h3 style={{ marginBottom: 10 }}>Daily Overview</h3>

        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              <th align="left">Date</th>
              <th align="right">Revenue</th>
              <th align="right">Cost</th>
              <th align="right">Profit</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.date)}</td>
                <td align="right">{formatMoney(r.revenue)}</td>
                <td align="right">{formatMoney(r.cost)}</td>
                <td
                  align="right"
                  style={{
                    fontWeight: 700,
                    color:
                      Number(r.profit) >= 0
                        ? "#15803d"
                        : "#b91c1c",
                  }}
                >
                  {formatMoney(r.profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* COMPONENTS */

function Card({ title, value, color = "#111" }) {
  return (
    <div
      style={{
        flex: 1,
        background: "#fff",
        borderRadius: 12,
        padding: 16,
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280" }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>
        {value}
      </div>
    </div>
  );
}

function Insight({ title, value, sub }) {
  return (
    <div
      style={{
        flex: 1,
        background: "#fff",
        borderRadius: 12,
        padding: 16,
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280" }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 13, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}