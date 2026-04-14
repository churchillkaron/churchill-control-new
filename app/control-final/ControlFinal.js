"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ControlFinal() {
  const searchParams = useSearchParams();

  const [date, setDate] = useState("");
  const [dishes, setDishes] = useState([
    { name: "", quantity: 0, revenue: 0, cost: 0 },
  ]);

  const [revenue, setRevenue] = useState(0);
  const [cost, setCost] = useState(0);
  const [profit, setProfit] = useState(0);

  // Load from history
  useEffect(() => {
    const dataParam = searchParams.get("data");

    if (!dataParam) return;

    try {
      const decoded = JSON.parse(decodeURIComponent(dataParam));
      if (decoded?.date) setDate(decoded.date);
      if (Array.isArray(decoded?.dishes)) setDishes(decoded.dishes);
    } catch (err) {
      console.error(err);
    }
  }, [searchParams]);

  // Calculate totals
  useEffect(() => {
    let totalRevenue = 0;
    let totalCost = 0;

    dishes.forEach((d) => {
      totalRevenue += Number(d.revenue || 0);
      totalCost += Number(d.cost || 0);
    });

    setRevenue(totalRevenue);
    setCost(totalCost);
    setProfit(totalRevenue - totalCost);
  }, [dishes]);

  function updateDish(index, field, value) {
    const updated = [...dishes];
    updated[index][field] = value;
    setDishes(updated);
  }

  function addDish() {
    setDishes([
      ...dishes,
      { name: "", quantity: 0, revenue: 0, cost: 0 },
    ]);
  }

  function saveDay() {
    fetch("/api/save-day", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date,
        dishes,
        revenue,
        cost,
        profit,
      }),
    });
  }

  return (
    <div style={{ maxWidth: 1000, margin: "40px auto", padding: 20 }}>
      <h1 style={{ marginBottom: 20 }}>Daily Control</h1>

      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        style={{
          padding: 10,
          borderRadius: 8,
          border: "1px solid #ddd",
          marginBottom: 20,
        }}
      />

      {/* Table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          fontWeight: "bold",
          marginBottom: 10,
        }}
      >
        <div>Dish</div>
        <div>Qty</div>
        <div>Revenue</div>
        <div>Cost</div>
      </div>

      {/* Rows */}
      {dishes.map((dish, index) => (
        <div
          key={index}
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <input
            placeholder="Dish name"
            value={dish.name}
            onChange={(e) =>
              updateDish(index, "name", e.target.value)
            }
          />

          <input
            type="number"
            value={dish.quantity}
            onChange={(e) =>
              updateDish(index, "quantity", Number(e.target.value))
            }
          />

          <input
            type="number"
            value={dish.revenue}
            onChange={(e) =>
              updateDish(index, "revenue", Number(e.target.value))
            }
          />

          <input
            type="number"
            value={dish.cost}
            onChange={(e) =>
              updateDish(index, "cost", Number(e.target.value))
            }
          />
        </div>
      ))}

      <button
        onClick={addDish}
        style={{
          marginTop: 10,
          padding: "10px 20px",
          background: "#111",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        + Add Dish
      </button>

      {/* Totals */}
      <div
        style={{
          marginTop: 30,
          padding: 20,
          border: "1px solid #eee",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <div>Revenue: ฿{revenue}</div>
        <div>Cost: ฿{cost}</div>
        <div
          style={{
            fontWeight: "bold",
            color: profit >= 0 ? "green" : "red",
          }}
        >
          Profit: ฿{profit}
        </div>

        <button
          onClick={saveDay}
          style={{
            marginTop: 20,
            width: "100%",
            padding: 15,
            background: "#16a34a",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Save Day
        </button>
      </div>
    </div>
  );
}