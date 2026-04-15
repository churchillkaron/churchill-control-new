"use client";

import { useState } from "react";

const DISHES = [
  { name: "Burger", price: 250, cost: 120 },
  { name: "Pizza", price: 300, cost: 150 },
  { name: "Pasta", price: 220, cost: 100 },
  { name: "Steak", price: 500, cost: 280 },
];

export default function ControlFinal() {
  const [selectedDish, setSelectedDish] = useState(null);
  const [qty, setQty] = useState(1);

  const price = selectedDish?.price || 0;
  const cost = selectedDish?.cost || 0;

  const revenue = price * qty;
  const totalCost = cost * qty;
  const profit = revenue - totalCost;
  const margin = revenue ? (profit / revenue) * 100 : 0;

  return (
    <div style={{ padding: 30 }}>
      <h1>Churchill Control Panel</h1>

      <p>
        Revenue: {revenue} | Profit: {profit} | Margin: {margin.toFixed(1)}%
      </p>

      <h3>AI Manager</h3>
      {revenue === 0 && <p>⚠️ No sales data yet</p>}

      <div style={{ marginTop: 20 }}>
        <label>Dish</label>
        <br />
        <select
          onChange={(e) =>
            setSelectedDish(
              DISHES.find((d) => d.name === e.target.value)
            )
          }
        >
          <option>Select</option>
          {DISHES.map((dish) => (
            <option key={dish.name}>{dish.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>Qty</label>
        <br />
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <p>Price: {price}</p>
        <p>Cost: {cost}</p>
        <p>Total: {revenue}</p>
      </div>

      <h3>Analytics</h3>
      <div style={{ height: 10, background: "#ccc", marginTop: 10 }} />
    </div>
  );
}