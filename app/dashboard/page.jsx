"use client";

import { useEffect, useState } from "react";

const THEME = {
  bg: "#0b0b0b",
  panel: "#131313",
  border: "rgba(255,255,255,0.08)",
  text: "#f5f5f5",
  muted: "#b7b2a4",
  accent: "#f97316",
  green: "#22c55e",
  red: "#ef4444",
};

function formatCurrency(value) {
  return `THB ${Number(value || 0).toLocaleString()}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [grouped, setGrouped] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then((res) => {
        setData(res || []);
        processData(res || []);
        setLoading(false);
      });
  }, []);

  function processData(raw) {
    const days = {};

    raw.forEach((entry) => {
      const day = entry.date.split("T")[0];

      if (!days[day]) {
        days[day] = {
          date: day,
          revenue: 0,
          cost: 0,
          profit: 0,
          saves: 0,
          dishes: {},
        };
      }

      days[day].revenue += entry.revenue;
      days[day].cost += entry.cost;
      days[day].profit += entry.profit;
      days[day].saves += 1;

      try {
        const parsed = JSON.parse(entry.dishes);

        parsed.rows.forEach((dish) => {
          if (!days[day].dishes[dish.name]) {
            days[day].dishes[dish.name] = {
              name: dish.name,
              revenue: 0,
              cost: 0,
              profit: 0,
              sold: 0,
            };
          }

          days[day].dishes[dish.name].revenue += dish.revenue;
          days[day].dishes[dish.name].cost += dish.cogs;
          days[day].dishes[dish.name].profit += dish.profit;
          days[day].dishes[dish.name].sold += dish.soldQty;
        });
      } catch (e) {}
    });

    const result = Object.values(days).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    setGrouped(result);
  }

  if (loading) return <div style={{ padding: 40, color: "white" }}>Loading...</div>;

  const totalRevenue = grouped.reduce((sum, d) => sum + d.revenue, 0);
  const totalProfit = grouped.reduce((sum, d) => sum + d.profit, 0);
  const totalCost = grouped.reduce((sum, d) => sum + d.cost, 0);

  const bestDay = [...grouped].sort((a, b) => b.profit - a.profit)[0];
  const worstDay = [...grouped].sort((a, b) => a.profit - b.profit)[0];

  const dishMap = {};

  grouped.forEach((day) => {
    Object.values(day.dishes).forEach((dish) => {
      if (!dishMap[dish.name]) {
        dishMap[dish.name] = { ...dish };
      } else {
        dishMap[dish.name].revenue += dish.revenue;
        dishMap[dish.name].profit += dish.profit;
        dishMap[dish.name].sold += dish.sold;
      }
    });
  });

  const topDishes = Object.values(dishMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const worstDishes = Object.values(dishMap)
    .filter((d) => d.sold > 0)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  return (
    <div style={{ padding: 20, background: THEME.bg, minHeight: "100vh" }}>
      <h1 style={{ color: THEME.text }}>Dashboard</h1>

      {/* SUMMARY */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <Card title="Revenue" value={formatCurrency(totalRevenue)} />
        <Card title="Cost" value={formatCurrency(totalCost)} />
        <Card title="Profit" value={formatCurrency(totalProfit)} />
      </div>

      {/* BEST WORST */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <Card
          title="Best Day"
          value={`${formatDate(bestDay?.date)} | ${formatCurrency(
            bestDay?.profit
          )}`}
        />
        <Card
          title="Worst Day"
          value={`${formatDate(worstDay?.date)} | ${formatCurrency(
            worstDay?.profit
          )}`}
        />
      </div>

      {/* TOP DISHES */}
      <Section title="Top Dishes">
        {topDishes.map((d) => (
          <Row key={d.name} label={d.name} value={formatCurrency(d.revenue)} />
        ))}
      </Section>

      {/* WORST DISHES */}
      <Section title="Weakest Dishes">
        {worstDishes.map((d) => (
          <Row key={d.name} label={d.name} value={formatCurrency(d.profit)} />
        ))}
      </Section>

      {/* HISTORY */}
      <Section title="Business Days">
        {grouped.map((d) => (
          <Row
            key={d.date}
            label={`${formatDate(d.date)} (${d.saves} saves)`}
            value={`${formatCurrency(d.revenue)} / ${formatCurrency(d.profit)}`}
          />
        ))}
      </Section>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div
      style={{
        background: "#131313",
        padding: 20,
        borderRadius: 12,
        minWidth: 200,
      }}
    >
      <div style={{ color: "#aaa" }}>{title}</div>
      <div style={{ color: "white", fontSize: 22 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ color: "white" }}>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: 10,
        borderBottom: "1px solid #222",
        color: "white",
      }}
    >
      <div>{label}</div>
      <div>{value}</div>
    </div>
  );
}