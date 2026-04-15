"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const emptyDish = () => ({
  name: "",
  qty: "1",
  price: "",
  cost: "",
});

export default function ControlFinal() {
  const [reportDate, setReportDate] = useState(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  });

  const [dishes, setDishes] = useState([
    emptyDish(),
    emptyDish(),
    emptyDish(),
    emptyDish(),
  ]);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const parsed = useMemo(() => {
    return dishes.map((d) => {
      const qty = Number(d.qty) || 0;
      const price = Number(d.price) || 0;
      const cost = Number(d.cost) || 0;

      const revenue = qty * price;
      const totalCost = qty * cost;
      const profit = revenue - totalCost;

      return { ...d, qty, price, cost, revenue, totalCost, profit };
    });
  }, [dishes]);

  const totals = useMemo(() => {
    return parsed.reduce(
      (acc, d) => {
        acc.revenue += d.revenue;
        acc.cost += d.totalCost;
        acc.profit += d.profit;
        return acc;
      },
      { revenue: 0, cost: 0, profit: 0 }
    );
  }, [parsed]);

  const update = (i, field, value) => {
    setDishes((prev) =>
      prev.map((d, idx) =>
        idx === i ? { ...d, [field]: value } : d
      )
    );
  };

  const format = (v) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
    }).format(v || 0);

  const save = async () => {
    const clean = parsed.filter((d) => d.name.trim() !== "");

    if (clean.length === 0) {
      setMessage("Add at least one dish");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/save-day", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: reportDate,
          dishes: clean,
          revenue: totals.revenue,
          cost: totals.cost,
          profit: totals.profit,
        }),
      });

      if (!res.ok) throw new Error("Save failed");

      setMessage("Saved successfully");
    } catch (err) {
      setMessage("Error saving");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Control Panel</h1>

      <input
        type="date"
        value={reportDate}
        onChange={(e) => setReportDate(e.target.value)}
      />

      {parsed.map((d, i) => (
        <div key={i} style={{ display: "flex", gap: 5, marginTop: 5 }}>
          <input
            placeholder="Dish name"
            value={d.name}
            onChange={(e) => update(i, "name", e.target.value)}
          />
          <input
            type="number"
            value={d.qty}
            onChange={(e) => update(i, "qty", e.target.value)}
          />
          <input
            type="number"
            value={d.price}
            onChange={(e) => update(i, "price", e.target.value)}
          />
          <input
            type="number"
            value={d.cost}
            onChange={(e) => update(i, "cost", e.target.value)}
          />

          <span>{format(d.revenue)}</span>
          <span>{format(d.profit)}</span>
        </div>
      ))}

      <div style={{ marginTop: 20 }}>
        <p>Revenue: {format(totals.revenue)}</p>
        <p>Cost: {format(totals.cost)}</p>
        <p>Profit: {format(totals.profit)}</p>
      </div>

      <button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Day"}
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}