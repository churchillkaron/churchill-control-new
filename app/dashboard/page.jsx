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

  // 🔥 CHURCHILL SCORE ENGINE
  const ai = useMemo(() => {
    if (!data.length) return { list: [], score: 0, status: "NO DATA" };

    const totalCovers = data.reduce((sum, d) => sum + Number(d.dishes?.meta?.covers || 0), 0);
    const totalDrinkRevenue = data.reduce((sum, d) => sum + Number(d.dishes?.meta?.drinkRevenue || 0), 0);

    const revenuePerCover = totalCovers > 0 ? totalRevenue / totalCovers : 0;
    const drinksPerCover = totalCovers > 0 ? totalDrinkRevenue / totalCovers : 0;

    let score = 100;
    const list = [];

    if (revenuePerCover < 400) {
      list.push("Upselling weak — push starters and sides.");
      score -= 25;
    }

    if (drinksPerCover < 120) {
      list.push("Drinks-first weak — sell drinks immediately.");
      score -= 25;
    }

    if (drinksPerCover < 80) {
      list.push("Critical: very low drink conversion.");
      score -= 30;
    }

    if (foodCostPct > 60) {
      list.push("Food cost too high — control portions.");
      score -= 20;
    }

    let status = "GOOD";
    if (score < 80) status = "WARNING";
    if (score < 60) status = "BAD";
    if (score < 40) status = "CRITICAL";

    return { list, score, status, revenuePerCover, drinksPerCover };
  }, [data, totalRevenue, totalCost, foodCostPct]);

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

      {/* 📊 CHART */}
      <div style={{ background: "#131313", padding: 20, borderRadius: 14, marginBottom: 30 }}>
        <div style={{ color: "#aaa", marginBottom: 10 }}>Revenue Trend</div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 150 }}>
          {data.slice().reverse().map((d, i) => {
            const height = (d.revenue / maxRevenue) * 100;
            return (
              <div key={i}>
                <div style={{
                  width: 30,
                  height: `${height}%`,
                  background: "#f97316",
                  borderRadius: 4,
                }} />
                <div style={{ fontSize: 10 }}>{d.revenue}</div>
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

      {/* 🔥 AI MANAGER */}
      <div style={{
        background: "#131313",
        padding: 20,
        borderRadius: 14,
        marginBottom: 30,
      }}>
        <div style={{ color: "#aaa", marginBottom: 10 }}>AI Manager</div>

        <div style={{
          fontSize: 18,
          fontWeight: "bold",
          color:
            ai.status === "GOOD" ? "green" :
            ai.status === "WARNING" ? "orange" :
            "red"
        }}>
          {ai.status} (Score {ai.score})
        </div>

        <div style={{ marginTop: 10 }}>
          {ai.list.map((t, i) => (
            <div key={i}>• {t}</div>
          ))}
        </div>
      </div>

    </div>
  );
}

function Card({ title, value, highlight }) {
  return (
    <div style={{ background: "#131313", padding: 20, borderRadius: 14 }}>
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
    <div style={{ background: "#131313", padding: 20, borderRadius: 14 }}>
      <div style={{ color: "#aaa", fontSize: 12 }}>{title}</div>
      <div style={{ marginTop: 10 }}>
        <strong>{data.date}</strong><br />
        Revenue: {data.revenue}<br />
        Profit: {data.profit}
      </div>
    </div>
  );
}