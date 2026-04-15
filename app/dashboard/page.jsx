"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/accounting-summary", { cache: "no-store" });
        const json = await res.json();
        setSummary(json || {});
      } catch (err) {
        console.error(err);
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

  // 🔥 SERVICE CHARGE (5%)
  const baseService = revenue * 0.05;

  const adjustedService = useMemo(() => {
    if (ai.status === "GOOD") return baseService;
    if (ai.status === "WARNING") return baseService * 0.7;
    if (ai.status === "BAD") return baseService * 0.4;
    return 0;
  }, [ai, baseService]);

  // 🔥 TEAM SPLIT
  const split = {
    foh: adjustedService * 0.5,
    bar: adjustedService * 0.3,
    kitchen: adjustedService * 0.2,
  };

  if (loading) {
    return <div style={{ padding: 20, color: "white" }}>Loading...</div>;
  }

  return (
    <div style={{ background: "#0b0b0b", minHeight: "100vh", padding: 20, color: "white" }}>

      <h1>Service Charge Control</h1>

      {/* 🔥 TOTAL */}
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

      {/* 🔥 SPLIT */}
      <div style={{ display: "flex", gap: 16 }}>

        <Card title="FOH (50%)" value={`THB ${Math.round(split.foh)}`} />
        <Card title="Bar (30%)" value={`THB ${Math.round(split.bar)}`} />
        <Card title="Kitchen (20%)" value={`THB ${Math.round(split.kitchen)}`} />

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