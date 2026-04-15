"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [historyRes, summaryRes] = await Promise.all([
          fetch("/api/history", { cache: "no-store" }),
          fetch("/api/accounting-summary", { cache: "no-store" }),
        ]);

        const history = await historyRes.json();
        const summaryData = await summaryRes.json();

        setData(Array.isArray(history) ? history : []);
        setSummary(summaryData || {});
      } catch (err) {
        console.error(err);
        setData([]);
        setSummary({});
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const totalRevenue = summary?.revenue || 0;
  const totalSales = summary?.sales || 0;
  const avgTicket = summary?.avg || 0;
  const drinkRevenue = summary?.drinks || 0;

  const drinksPerSale = totalSales > 0 ? drinkRevenue / totalSales : 0;

  // 🔥 REAL AI ENGINE
  const ai = useMemo(() => {
    if (!summary) return { list: [], score: 0, status: "NO DATA" };

    let score = 100;
    const list = [];

    if (avgTicket < 400) {
      list.push("Low ticket size — staff must upsell mains, sides, and extras.");
      score -= 25;
    }

    if (drinksPerSale < 120) {
      list.push("Drinks-first weak — staff must push drinks immediately.");
      score -= 25;
    }

    if (drinksPerSale < 80) {
      list.push("Critical: very low drink conversion.");
      score -= 30;
    }

    if (avgTicket > 600 && drinksPerSale < 150) {
      list.push("Strong food but weak drinks — push second-round drinks.");
      score -= 15;
    }

    let status = "GOOD";
    if (score < 80) status = "WARNING";
    if (score < 60) status = "BAD";
    if (score < 40) status = "CRITICAL";

    return { list, score, status };
  }, [summary, avgTicket, drinksPerSale]);

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
        <Card title="Revenue" value={`THB ${totalRevenue}`} highlight />
        <Card title="Sales" value={totalSales} />
        <Card title="Avg Ticket" value={`THB ${Math.round(avgTicket)}`} />
        <Card title="Drink Revenue" value={`THB ${drinkRevenue}`} />
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