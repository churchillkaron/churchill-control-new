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

  // 🔥 DISH INTELLIGENCE
  const dishStats = useMemo(() => {
    const map = {};

    data.forEach(day => {
      try {
        const parsed = JSON.parse(day.dishes || "{}");
        const rows = parsed.rows || [];

        rows.forEach(d => {
          if (!map[d.name]) {
            map[d.name] = { sold: 0, revenue: 0 };
          }

          map[d.name].sold += Number(d.soldQty || 0);
          map[d.name].revenue += Number(d.soldQty || 0) * Number(d.price || 0);
        });

      } catch {}
    });

    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  const topDish = dishStats[0];
  const worstDish = dishStats[dishStats.length - 1];

  // 🔥 AI SCORE
  const ai = useMemo(() => {
    let score = 100;
    const issues = [];

    if (avgTicket < 400) {
      issues.push("Upsell failure");
      score -= 25;
    }

    if (drinksPerSale < 120) {
      issues.push("Drinks-first failure");
      score -= 25;
    }

    if (drinksPerSale < 80) {
      issues.push("Critical drink failure");
      score -= 30;
    }

    if (worstDish && worstDish.sold < 3) {
      issues.push("Weak dish not selling");
      score -= 10;
    }

    let status = "GOOD";
    if (score < 80) status = "WARNING";
    if (score < 60) status = "BAD";
    if (score < 40) status = "CRITICAL";

    return { score, status, issues };
  }, [avgTicket, drinksPerSale, worstDish]);

  // 🔥 SERVICE CHARGE ENGINE
  const service = useMemo(() => {
    if (ai.status === "GOOD") {
      return {
        color: "green",
        text: "Full service charge approved",
      };
    }

    if (ai.status === "WARNING") {
      return {
        color: "orange",
        text: "Reduced service charge — improve upselling and drinks",
      };
    }

    if (ai.status === "BAD") {
      return {
        color: "red",
        text: "Low service charge — staff underperforming",
      };
    }

    return {
      color: "red",
      text: "No service charge — system failure",
    };
  }, [ai]);

  if (loading) {
    return <div style={{ padding: 20, color: "white" }}>Loading...</div>;
  }

  return (
    <div style={{ background: "#0b0b0b", minHeight: "100vh", padding: 20, color: "white" }}>

      <h1>Churchill Control</h1>

      {/* 🔥 SERVICE CHARGE */}
      <div style={{
        background: "#131313",
        padding: 20,
        borderRadius: 14,
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 14, color: "#aaa" }}>Service Charge Decision</div>

        <div style={{
          fontSize: 22,
          fontWeight: "bold",
          color: service.color,
          marginTop: 10
        }}>
          {service.text}
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <Card title="Revenue" value={`THB ${totalRevenue}`} />
        <Card title="Sales" value={totalSales} />
        <Card title="Avg Ticket" value={`THB ${Math.round(avgTicket)}`} />
        <Card title="Drinks" value={`THB ${drinkRevenue}`} />
      </div>

      {/* AI */}
      <div style={{ background: "#131313", padding: 20, borderRadius: 14 }}>
        <div>AI Manager</div>

        <div style={{ marginTop: 10 }}>
          Status: {ai.status} ({ai.score})
        </div>

        <div style={{ marginTop: 10 }}>
          {ai.issues.map((t, i) => (
            <div key={i}>• {t}</div>
          ))}
        </div>

        {topDish && (
          <div style={{ marginTop: 10 }}>
            Top Dish: {topDish.name}
          </div>
        )}
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