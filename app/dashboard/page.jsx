"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        const json = await res.json();
        setData(Array.isArray(json) ? json : []);
      } catch (err) {
        console.error(err);
        setData([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const totalRevenue = useMemo(
    () => data.reduce((sum, d) => sum + Number(d.revenue || 0), 0),
    [data]
  );

  const totalCost = useMemo(
    () => data.reduce((sum, d) => sum + Number(d.cost || 0), 0),
    [data]
  );

  const totalProfit = useMemo(
    () => data.reduce((sum, d) => sum + Number(d.profit || 0), 0),
    [data]
  );

  const foodCostPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;

  const bestDay = useMemo(() => {
    if (!data.length) return null;
    return [...data].sort((a, b) => b.profit - a.profit)[0];
  }, [data]);

  const worstDay = useMemo(() => {
    if (!data.length) return null;
    return [...data].sort((a, b) => a.profit - b.profit)[0];
  }, [data]);

  const insights = useMemo(() => {
    if (!data.length) return [];

    const list = [];

    if (bestDay) {
      list.push(`Best business day was ${bestDay.date} with profit of THB ${bestDay.profit}.`);
    }

    if (worstDay) {
      list.push(`Weakest day was ${worstDay.date} with profit of THB ${worstDay.profit}.`);
    }

    if (foodCostPct > 60) {
      list.push(`Food cost is high at ${foodCostPct.toFixed(1)}%. Review portion control.`);
    } else {
      list.push(`Food cost is under control at ${foodCostPct.toFixed(1)}%.`);
    }

    return list;
  }, [data, bestDay, worstDay, foodCostPct]);

  const maxRevenue = Math.max(...data.map(d => d.revenue || 0), 1);

  if (loading) {
    return <div style={{ padding: 20, color: "white" }}>Loading...</div>;
  }

  return (
    <div style={{ background: "#0b0b0b", minHeight: "100vh", padding: 20, color: "white" }}>

      <h1 style={{ marginBottom: 20 }}>Dashboard</h1>

      {/* KPI */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16,
        marginBottom: 30,
      }}>
        <Card title="Total Revenue" value={`THB ${totalRevenue}`} highlight />
        <Card title="Total Cost" value={`THB ${totalCost}`} />
        <Card title="Gross Profit" value={`THB ${totalProfit}`} />
        <Card title="Food Cost %" value={`${foodCostPct.toFixed(1)}%`} />
      </div>

      {/* 🔥 REVENUE CHART */}
      <div style={{
        background: "#131313",
        padding: 20,
        borderRadius: 14,
        marginBottom: 30,
      }}>
        <div style={{ color: "#aaa", marginBottom: 10 }}>Revenue Trend</div>

        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          height: 150,
        }}>
          {data.slice().reverse().map((d, i) => {
            const height = (d.revenue / maxRevenue) * 100;

            return (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{
                  width: 30,
                  height: `${height}%`,
                  background: "#f97316",
                  borderRadius: 4,
                }} />
                <div style={{ fontSize: 10, marginTop: 4 }}>
                  {d.revenue}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BEST / WORST */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        marginBottom: 30,
      }}>
        <Box title="Best Day" data={bestDay} />
        <Box title="Worst Day" data={worstDay} />
      </div>

      {/* AI */}
      <div style={{
        background: "#131313",
        padding: 20,
        borderRadius: 14,
        marginBottom: 30,
      }}>
        <div style={{ color: "#aaa", marginBottom: 10 }}>AI Owner Insights</div>

        {insights.map((text, i) => (
          <div key={i}>• {text}</div>
        ))}
      </div>

    </div>
  );
}

function Card({ title, value, highlight }) {
  return (
    <div style={{
      background: "#131313",
      padding: 20,
      borderRadius: 14,
    }}>
      <div style={{ color: "#aaa", fontSize: 12 }}>{title}</div>
      <div style={{
        fontSize: 24,
        fontWeight: "bold",
        marginTop: 6,
        color: highlight ? "#f97316" : "white",
      }}>
        {value}
      </div>
    </div>
  );
}

function Box({ title, data }) {
  if (!data) return null;

  return (
    <div style={{
      background: "#131313",
      padding: 20,
      borderRadius: 14,
    }}>
      <div style={{ color: "#aaa", fontSize: 12 }}>{title}</div>
      <div style={{ marginTop: 10 }}>
        <strong>{data.date}</strong><br />
        Revenue: {data.revenue}<br />
        Profit: {data.profit}
      </div>
    </div>
  );
}