"use client";

import { useEffect, useState } from "react";

const EMPTY_DISHES = {
  meta: {
    covers: 0,
    drinkRevenue: 0,
    avgTicketTime: 0,
    secondRoundRate: 0,
    complaints: 0,
    managerNotes: "",
    ownerStatus: "",
  },
  rows: [],
  insights: [],
};

function validateDishes(data) {
  if (!data || typeof data !== "object") return EMPTY_DISHES;

  return {
    meta: data.meta || EMPTY_DISHES.meta,
    rows: Array.isArray(data.rows) ? data.rows : [],
    insights: Array.isArray(data.insights) ? data.insights : [],
  };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem("cc_dishes");
    if (!raw) return null;
    return validateDishes(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveLocal(data) {
  try {
    localStorage.setItem("cc_dishes", JSON.stringify(data));
  } catch {}
}

export default function ControlFinal() {
  const [dishes, setDishes] = useState(EMPTY_DISHES);
  const [loading, setLoading] = useState(true);

  // LOAD SYSTEM (SAFE)
  useEffect(() => {
    async function loadData() {
      try {
        // 1. Try API (Supabase)
        const res = await fetch("/api/history");
        if (res.ok) {
          const json = await res.json();

          if (json && json.length > 0) {
            const latest = json[0];
            const safe = validateDishes(latest.dishes || latest);

            setDishes(safe);
            saveLocal(safe);
            setLoading(false);
            return;
          }
        }
      } catch {}

      // 2. Fallback local
      const local = loadLocal();
      if (local) {
        setDishes(local);
        setLoading(false);
        return;
      }

      // 3. Final fallback
      setDishes(EMPTY_DISHES);
      setLoading(false);
    }

    loadData();
  }, []);

  // AUTO SAVE LOCAL (SAFE)
  useEffect(() => {
    if (!loading) {
      saveLocal(dishes);
    }
  }, [dishes, loading]);

  // ADD DISH (SAFE)
  function addDish() {
    const newDish = {
      name: "New Dish",
      category: "",
      price: 0,
      cost: 0,
      soldQty: 0,
      revenue: 0,
      cogs: 0,
      profit: 0,
    };

    setDishes((prev) => ({
      ...prev,
      rows: [...prev.rows, newDish],
    }));
  }

  // UPDATE DISH (SAFE)
  function updateDish(index, field, value) {
    setDishes((prev) => {
      const updated = [...prev.rows];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };

      return {
        ...prev,
        rows: updated,
      };
    });
  }

  // SAVE DAY (API)
  async function saveDay() {
    try {
      await fetch("/api/save-day", {
        method: "POST",
        body: JSON.stringify({
          dishes,
          date: new Date().toISOString(),
        }),
      });

      alert("Saved successfully");
    } catch {
      alert("Save failed");
    }
  }

  if (loading) {
    return <div className="p-6 text-white">Loading system...</div>;
  }

  return (
    <div className="min-h-screen bg-[#3a342d] text-[#f5f1e8] p-6">
      <h1 className="text-2xl mb-6">Control Final</h1>

      <button
        onClick={addDish}
        className="mb-4 px-4 py-2 bg-[#2f2a24] rounded"
      >
        Add Dish
      </button>

      <div className="space-y-4">
        {dishes.rows.map((dish, i) => (
          <div
            key={i}
            className="p-4 bg-[#1e1b17] rounded border border-[#4a443b]"
          >
            <input
              value={dish.name}
              onChange={(e) => updateDish(i, "name", e.target.value)}
              className="bg-transparent border-b border-[#555] w-full"
            />

            <input
              type="number"
              value={dish.price}
              onChange={(e) =>
                updateDish(i, "price", Number(e.target.value))
              }
              className="mt-2 bg-transparent border-b border-[#555]"
            />
          </div>
        ))}
      </div>

      <button
        onClick={saveDay}
        className="mt-6 px-4 py-2 bg-[#2f2a24] rounded"
      >
        Save Day
      </button>
    </div>
  );
}