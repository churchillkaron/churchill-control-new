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

  const revenue = summary?.revenue || 0;
  const sales = summary?.sales || 0;
  const avgTicket = summary?.avg || 0;
  const drinks = summary?.drinks || 0;

  const drinksPerSale = sales > 0 ? drinks / sales : 0;

  // 🔥 AI SCORE
  const ai = useMemo(() => {
    let score = 100;

    if (avgTicket < 400) score -= 25;
    if (drinksPerSale < 120) score -= 25;
    if (drinksPerSale < 80) score -= 30;

    let status = "GOOD";
    if (score < 80) status = "WARNING";
    if (score < 60) status = "BAD";
    if (score < 40) status = "CRITICAL";

    return { score, status };
  }, [avgTicket, drinksPerSale]);

  // 🔥 SERVICE CHARGE POOL
  const baseService = revenue * 0.05;

  const adjustedService = useMemo(() => {
    if (ai.status === "GOOD") return baseService;
    if (ai.status === "WARNING") return baseService * 0.7;
    if (ai.status === "BAD") return baseService * 0.4;
    return 0;
  }, [ai, baseService]);

  if (loading) {
    return <div style={{ padding: 20, color: "white" }}>Loading...</div>;
  }

  return (
    <div style={{ background: "#0b0b0b", minHeight: "100vh", padding: 20, color: "white" }}>

      <h1>Churchill Control</h1>

      {/* 🔥 SERVICE CHARGE */}
      <div style={{ background: "#131313", padding: 20, borderRadius: 14, marginBottom: 20 }}>
        <div style={{ color: "#aaa" }}>Service Charge (5%)</div>

        <div style={{ fontSize: 22, marginTop: 10 }}>
          Base: THB {Math.round(baseService)}
        </div>

        <div style={{ fontSize: 22 }}>
          Adjusted: THB {Math.round(adjustedService)}
        </div>

        <div style={{
          marginTop: 10,
          fontWeight: "bold",
          color:
            ai.status === "GOOD" ? "green" :
            ai.status === "WARNING" ? "orange" :
            "red"
        }}>
          Status: {ai.status} ({ai.score})
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: "flex", gap: 16 }}>
        <Card title="Revenue" value={`THB ${revenue}`} />
        <Card title="Sales" value={sales} />
        <Card title="Avg Ticket" value={`THB ${Math.round(avgTicket)}`} />
        <Card title="Drinks" value={`THB ${drinks}`} />
      </div>

    </div>
  );
}

function Card({ title, value }) {
  return (
    <div style={{ background: "#131313", padding: 20, borderRadius: 14 }}>
      <div style={{ fontSize: 12, color: "#aaa" }}>{title}</div>
      <div style={{ fontSize: 20 }}>{value}</div>
    </div>
  );
}