"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ControlFinal() {
  const searchParams = useSearchParams();

  const [date, setDate] = useState("");
  const [dishes, setDishes] = useState([]);

  const [revenue, setRevenue] = useState(0);
  const [cost, setCost] = useState(0);
  const [profit, setProfit] = useState(0);

  // LOAD FROM HISTORY
  useEffect(() => {
    const dataParam = searchParams.get("data");

    if (!dataParam) return;

    try {
      const decoded = JSON.parse(decodeURIComponent(dataParam));

      if (decoded?.date) {
        setDate(decoded.date);
      }

      if (Array.isArray(decoded?.dishes)) {
        setDishes(decoded.dishes);
      }
    } catch (err) {
      console.error("Failed to parse incoming data:", err);
    }
  }, [searchParams]);

  // CALCULATE TOTALS
  useEffect(() => {
    let totalRevenue = 0;
    let totalCost = 0;

    dishes.forEach((d) => {
      const r = Number(d?.revenue ?? d?.total ?? 0);
      const c = Number(d?.cost ?? d?.totalCost ?? 0);

      totalRevenue += r;
      totalCost += c;
    });

    setRevenue(totalRevenue);
    setCost(totalCost);
    setProfit(totalRevenue - totalCost);
  }, [dishes]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Control Panel</h1>

      {/* DATE */}
      <div style={{ marginBottom: 20 }}>
        <label>Date:</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {/* DISHES */}
      <div>
        <h3>Dishes</h3>

        {dishes.map((dish, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <input
              placeholder="Dish name"
              value={dish.name || ""}
              onChange={(e) => {
                const updated = [...dishes];
                updated[index].name = e.target.value;
                setDishes(updated);
              }}
            />

            <input
              type="number"
              placeholder="Qty"
              value={dish.quantity || ""}
              onChange={(e) => {
                const updated = [...dishes];
                updated[index].quantity = Number(e.target.value);
                setDishes(updated);
              }}
            />

            <input
              type="number"
              placeholder="Revenue"
              value={dish.revenue || ""}
              onChange={(e) => {
                const updated = [...dishes];
                updated[index].revenue = Number(e.target.value);
                setDishes(updated);
              }}
            />

            <input
              type="number"
              placeholder="Cost"
              value={dish.cost || ""}
              onChange={(e) => {
                const updated = [...dishes];
                updated[index].cost = Number(e.target.value);
                setDishes(updated);
              }}
            />
          </div>
        ))}

        {/* ADD ROW */}
        <button
          onClick={() =>
            setDishes([
              ...dishes,
              { name: "", quantity: 0, revenue: 0, cost: 0 },
            ])
          }
        >
          + Add Dish
        </button>
      </div>

      {/* TOTALS */}
      <div style={{ marginTop: 20 }}>
        <div>Revenue: {revenue}</div>
        <div>Cost: {cost}</div>
        <div style={{ fontWeight: 700 }}>Profit: {profit}</div>
      </div>
    </div>
  );
}