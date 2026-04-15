"use client";

import { useEffect, useMemo, useState } from "react";

/* KEEP YOUR CATALOG EXACTLY SAME */
const DISH_CATALOG = [/* KEEP SAME DATA */];

function createInitialRows() {
  return DISH_CATALOG.map((item) => ({
    ...item,
    openingStock: 0,
    soldQty: 0,
    producedQty: 0,
  }));
}

/* 🔥 NEW: SAFE NORMALIZER */
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
  const [businessDate, setBusinessDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [loaded, setLoaded] = useState(false);

  /* 🔥 LOAD DATA ONCE */
  useEffect(() => {
    if (loaded) return;

    async function loadData() {
      try {
        const res = await fetch("/api/history");
        const data = await res.json();

        if (!data || !data.length) {
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
        console.error("Load failed:", err);
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
          ? {
              ...row,
              [field]: Number(value) || 0,
            }
          : row
      )
    );
  }

  /* KEEP ALL YOUR EXISTING LOGIC BELOW UNCHANGED */
}