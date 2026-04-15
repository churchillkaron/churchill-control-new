"use client";

import { useEffect, useMemo, useState } from "react";

/* ✅ KEEP FULL ORIGINAL DISH CATALOG */
const DISH_CATALOG = [
  { name: "Beef Carpaccio", category: "Starter", price: 320, cost: 110.72, par: 10 },
  { name: "Chili & Garlic Prawns", category: "Starter", price: 320, cost: 74.32, par: 10 },
  { name: "Signature Bruschetta", category: "Starter", price: 280, cost: 62.38, par: 10 },
  { name: "Seared Scallops", category: "Starter", price: 520, cost: 175.72, par: 10 },
  { name: "Mango & Tomato Salad", category: "Light", price: 220, cost: 16.97, par: 10 },
  { name: "Churchill Beef Short Ribs", category: "Main", price: 690, cost: 200.02, par: 10 },
  { name: "Ribeye Steak", category: "Main", price: 950, cost: 356.77, par: 10 },
  { name: "Beef Tenderloin", category: "Main", price: 950, cost: 311.16, par: 10 },
  { name: "Pork Tenderloin", category: "Main", price: 490, cost: 162.91, par: 10 },
  { name: "Salmon", category: "Main", price: 620, cost: 235.93, par: 10 },
  { name: "Churchill Sambal Half Chicken", category: "Main", price: 420, cost: 128.07, par: 10 },
  { name: "Veal Stew", category: "Main", price: 620, cost: 168.29, par: 10 },
];

function createInitialRows() {
  return DISH_CATALOG.map((item) => ({
    ...item,
    openingStock: 0,
    soldQty: 0,
    producedQty: 0,
  }));
}

/* 🔥 NORMALIZE */
function normalizeRow(savedRow, baseRow) {
  return {
    ...baseRow,
    openingStock: savedRow?.openingStock ?? 0,
    soldQty: savedRow?.soldQty ?? 0,
    producedQty: savedRow?.producedQty ?? 0,
    par: savedRow?.par ?? baseRow.par,
  };
}

export default function ControlFinal() {
  const [rows, setRows] = useState(createInitialRows);
  const [loaded, setLoaded] = useState(false);

  /* 🔥 LOAD FIX */
  useEffect(() => {
    if (loaded) return;

    async function load() {
      try {
        const res = await fetch("/api/history");
        const data = await res.json();

        if (!Array.isArray(data) || !data.length) return;

        const latest = data[0];

        if (!latest?.dishes) return;

        let parsed;
        try {
          parsed = JSON.parse(latest.dishes);
        } catch {
          return;
        }

        if (!parsed?.rows) return;

        const base = createInitialRows();

        const merged = base.map((b) => {
          const saved = parsed.rows.find(r => r.name === b.name);
          return normalizeRow(saved, b);
        });

        setRows(merged);

      } catch (e) {
        console.error(e);
      } finally {
        setLoaded(true);
      }
    }

    load();
  }, [loaded]);

  function updateRow(index, field, value) {
    setRows(r =>
      r.map((row, i) =>
        i === index ? { ...row, [field]: Number(value) || 0 } : row
      )
    );
  }

  async function handleSaveDay() {
    const payload = {
      date: new Date().toISOString().slice(0, 10),
      dishes: JSON.stringify({ rows }),
      revenue: rows.reduce((s, r) => s + r.soldQty * r.price, 0),
      cost: rows.reduce((s, r) => s + r.soldQty * r.cost, 0),
      profit: 0,
    };

    await fetch("/api/save-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Control Panel</h2>

      <button onClick={handleSaveDay}>Save Day</button>

      {rows.map((row, i) => (
        <div key={row.name}>
          {row.name}

          <input value={row.soldQty} onChange={e => updateRow(i, "soldQty", e.target.value)} />
          <input value={row.producedQty} onChange={e => updateRow(i, "producedQty", e.target.value)} />
          <input value={row.openingStock} onChange={e => updateRow(i, "openingStock", e.target.value)} />
        </div>
      ))}
    </div>
  );
}