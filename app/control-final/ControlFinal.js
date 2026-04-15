"use client";

import { useMemo, useState } from "react";

const emptyDish = () => ({
  name: "",
  qty: "1",
  price: "",
  cost: "",
});

export default function ControlFinal() {
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const [dishes, setDishes] = useState([
    emptyDish(),
    emptyDish(),
    emptyDish(),
    emptyDish(),
  ]);

  const [saving, setSaving] = useState(false);

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
      alert("Add at least one dish");
      return;
    }

    setSaving(true);

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

      if (!res.ok) throw new Error();

      alert("Saved!");

    } catch {
      alert("Save failed");
    }

    setSaving(false);
  };

  return (
    <div style={{ padding: 30 }}>
      <h1>Control Panel</h1>

      <input
        type="date"
        value={reportDate}
        onChange={(e) => setReportDate(e.target.value)}
      />

      {parsed.map((d, i) => (
        <div key={i} style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <input
            placeholder="Dish"
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
            placeholder="Price"
            value={d.price}
            onChange={(e) => update(i, "price", e.target.value)}
          />

          <input
            type="number"
            placeholder="Cost"
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
    </div>
  );
}