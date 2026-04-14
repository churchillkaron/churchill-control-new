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

  // LOAD FROM HISTORY
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

  // CALCULATE TOTALS
  useEffect(() => {
    let totalRevenue = 0;
    let totalCost = 0;

    dishes.forEach((d) => {
      const r = Number(d?.revenue ?? 0);
      const c = Number(d?.cost ?? 0);

      totalRevenue += r;
      totalCost += c;
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

  return (
    <div
      style={{
        maxWidth: 1000,
        margin: "40px auto",
        padding: 20,
      }}
    >
      <h1 style={{ marginBottom: 20 }}>Daily Control</h1>

      {/* DATE */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            padding: 10,
            fontSize: 16,
            borderRadius: 8,
            border: "1px solid #ddd",
          }}
        />
      </div>

      {/* TABLE HEADER */}
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

      {/* DISH ROWS */}
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

      {/* ADD BUTTON */}
      <button
        onClick={addDish}
        style={{
          marginTop: 10,
          padding: "10px 20px",
          borderRadius: 8,
          border: "none",
          background: "#111",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        + Add Dish
      </button>

      {/* TOTALS */}
      <div
        style={{
          marginTop: 30,
          padding: 20,
          borderRadius: 12,
          background: "#fff",
          border: "1px solid #eee",
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
          style={{
            marginTop: 20,
            width: "100%",
            padding: 15,
            borderRadius: 10,
            border: "none",
            background: "#16a34a",
            color: "#fff",
            fontWeight: "bold",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Save Day
        </button>
      </div>
    </div>
  );
}