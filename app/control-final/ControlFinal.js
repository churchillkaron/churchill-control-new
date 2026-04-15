"use client";

import { useEffect, useMemo, useState } from "react";

/* KEEP YOUR ORIGINAL DISH CATALOG EXACTLY */
const DISH_CATALOG = [
  // 🔥 KEEP YOUR FULL ORIGINAL LIST HERE (DO NOT CHANGE)
];

/* INITIAL STATE */
function createInitialRows() {
  return DISH_CATALOG.map((item) => ({
    ...item,
    openingStock: 0,
    soldQty: 0,
    producedQty: 0,
  }));
}

/* 🔥 SAFE NORMALIZER */
function normalizeRow(savedRow, baseRow) {
  return {
    name: baseRow.name,
    category: baseRow.category,
    price: baseRow.price,
    cost: baseRow.cost,
    par: savedRow?.par ?? baseRow.par ?? 0,
    openingStock: savedRow?.openingStock ?? 0,
    soldQty: savedRow?.soldQty ?? 0,
    producedQty: savedRow?.producedQty ?? 0,
  };
}

export default function ControlFinal() {
  const [rows, setRows] = useState(createInitialRows);
  const [businessDate, setBusinessDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [loaded, setLoaded] = useState(false);

  /* 🔥 LOAD DATA (ONLY ONCE) */
  useEffect(() => {
    if (loaded) return;

    async function loadData() {
      try {
        const res = await fetch("/api/history");
        const data = await res.json();

        if (!Array.isArray(data) || !data.length) {
          setLoaded(true);
          return;
        }

        const latest = data[0];

        if (!latest?.dishes) {
          setLoaded(true);
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(latest.dishes);
        } catch {
          setLoaded(true);
          return;
        }

        if (!parsed?.rows) {
          setLoaded(true);
          return;
        }

        const baseRows = createInitialRows();

        const merged = baseRows.map((baseRow) => {
          const savedRow = parsed.rows.find(
            (r) => r.name === baseRow.name
          );
          return normalizeRow(savedRow, baseRow);
        });

        setRows(merged);

        if (latest.date) {
          setBusinessDate(latest.date);
        }

      } catch (err) {
        console.error("Load error:", err);
      } finally {
        setLoaded(true);
      }
    }

    loadData();
  }, [loaded]);

  /* 🔥 SAFE UPDATE */
  function updateRow(index, field, value) {
    setRows((current) =>
      current.map((row, i) =>
        i === index
          ? { ...row, [field]: Number(value) || 0 }
          : row
      )
    );
  }

  /* 🔥 KEEP YOUR EXISTING CALCULATIONS BELOW */
  const totalRevenue = useMemo(
    () => rows.reduce((sum, r) => sum + r.soldQty * r.price, 0),
    [rows]
  );

  const totalCost = useMemo(
    () => rows.reduce((sum, r) => sum + r.soldQty * r.cost, 0),
    [rows]
  );

  const totalProfit = totalRevenue - totalCost;

  /* 🔥 SAVE DAY (UNCHANGED STRUCTURE) */
  async function handleSaveDay() {
    const payload = {
      date: businessDate,
      dishes: JSON.stringify({
        rows,
      }),
      revenue: totalRevenue,
      cost: totalCost,
      profit: totalProfit,
    };

    await fetch("/api/save-day", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Control Panel</h2>

      <button onClick={handleSaveDay}>Save Day</button>

      {rows.map((row, index) => (
        <div key={row.name} style={{ marginBottom: 10 }}>
          <strong>{row.name}</strong>

          <input
            type="number"
            value={row.soldQty}
            onChange={(e) =>
              updateRow(index, "soldQty", e.target.value)
            }
          />

          <input
            type="number"
            value={row.producedQty}
            onChange={(e) =>
              updateRow(index, "producedQty", e.target.value)
            }
          />

          <input
            type="number"
            value={row.openingStock}
            onChange={(e) =>
              updateRow(index, "openingStock", e.target.value)
            }
          />
        </div>
      ))}

      <h3>Total Revenue: {totalRevenue}</h3>
      <h3>Total Profit: {totalProfit}</h3>
    </div>
  );
}