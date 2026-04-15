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

  // 🔥 DISH ANALYSIS
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

  // 🔥 AI ENGINE V7
  const ai = useMemo(() => {
    if (!summary) return { list: [], score: 0, status: "NO DATA" };

    let score = 100;
    const list = [];

    if (avgTicket < 400) {
      list.push("Low ticket size — staff must upsell mains and extras.");
      score -= 25;
    }

    if (drinksPerSale < 120) {
      list.push("Drinks-first weak — push drinks immediately.");
      score -= 25;
    }

    if (drinksPerSale < 80) {
      list.push("Critical: drink sales failing.");
      score -= 30;
    }

    if (topDish) {
      list.push(`Top dish: ${topDish.name} generating most revenue.`);
    }

    if (worstDish && worstDish.sold < 3) {
      list.push(`Weak dish: ${worstDish.name} — not selling. Staff not pushing or menu issue.`);
      score -= 10;
    }

    if (avgTicket > 600 && drinksPerSale < 150) {
      list.push("Strong food but weak drinks — focus on second round drinks.");
      score -= 15;
    }

    let status = "GOOD";
    if (score < 80) status = "WARNING";
    if (score < 60) status = "BAD";
    if (score < 40) status = "CRITICAL";

    return { list, score, status };
  }, [summary, avgTicket, drinksPerSale, topDish, worstDish]);

  if (loading) {
    return <div style={{ padding: 20, color: "white" }}>Loading...</div>;
  }

  return (
    <div style={{ background: "#0b0b0b", minHeight: "100vh", padding: 20, color: "white" }}>

      <h1>Dashboard</h1>

      {/* KPI */}
      <div style={{ display: "flex", gap: 16, marginBottom: 30 }}>
        <Card title="Revenue" value={`THB ${totalRevenue}`} />
        <Card title="Sales" value={totalSales} />
        <Card title="Avg Ticket" value={`THB ${Math.round(avgTicket)}`} />
        <Card title="Drinks" value={`THB ${drinkRevenue}`} />
      </div>

      {/* AI */}
      <div style={{ background: "#131313", padding: 20, borderRadius: 14 }}>
        <div style={{ marginBottom: 10 }}>AI Manager</div>

        <div style={{
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

      {/* DISH LIST */}
      <div style={{ marginTop: 30 }}>
        <h3>Top Dishes</h3>
        {dishStats.slice(0, 5).map((d, i) => (
          <div key={i}>{d.name} — {d.sold} sold</div>
        ))}

        <h3 style={{ marginTop: 20 }}>Weakest Dishes</h3>
        {dishStats.slice(-5).map((d, i) => (
          <div key={i}>{d.name} — {d.sold} sold</div>
        ))}
      </div>

    </div>
  );
}

function Card({ title, value }) {
  return (
    <div style={{ background: "#131313", padding: 20, borderRadius: 14 }}>
      <div style={{ fontSize: 12, color: "#aaa" }}>{title}</div>
      <div style={{ fontSize: 22 }}>{value}</div>
    </div>
  );
}