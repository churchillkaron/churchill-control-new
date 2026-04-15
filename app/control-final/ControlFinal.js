"use client";

import { useState } from "react";

const DISHES = [
  { name: "Burger", price: 250, cost: 120 },
  { name: "Pizza", price: 300, cost: 150 },
  { name: "Pasta", price: 220, cost: 100 },
  { name: "Steak", price: 500, cost: 280 },
];

export default function ControlFinal() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState("");
  const [qty, setQty] = useState(1);

  const addDish = () => {
    const dish = DISHES.find((d) => d.name === selected);
    if (!dish) return;

    const newItem = {
      ...dish,
      qty,
      revenue: dish.price * qty,
      costTotal: dish.cost * qty,
      profit: dish.price * qty - dish.cost * qty,
    };

    setItems([...items, newItem]);
  };

  const revenue = items.reduce((sum, i) => sum + i.revenue, 0);
  const cost = items.reduce((sum, i) => sum + i.costTotal, 0);
  const profit = revenue - cost;
  const margin = revenue ? (profit / revenue) * 100 : 0;

  const getAIInsights = () => {
    let out = [];

    if (items.length === 0) {
      out.push("No sales data yet");
      return out;
    }

    if (margin > 30) {
      out.push("Strong margin performance");
    } else if (margin > 15) {
      out.push("Margin is acceptable but can improve");
    } else {
      out.push("Margin is low, review pricing or cost");
    }

    const dishStats = [...items].sort((a, b) => b.profit - a.profit);

    if (dishStats.length > 0) {
      out.push(`Top dish: ${dishStats[0].name}`);
    }

    return out;
  };

  return (
    <div style={{ padding: 30 }}>
      <h1>Churchill Control Panel</h1>

      <p>
        Revenue: {revenue} | Profit: {profit} | Margin: {margin.toFixed(1)}%
      </p>

      <h3>AI Manager</h3>
      {getAIInsights().map((msg, i) => (
        <p key={i}>{msg}</p>
      ))}

      <div style={{ marginTop: 20 }}>
        <label>Dish</label>
        <br />
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select</option>
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

      <div style={{ marginTop: 10 }}>
        <button onClick={addDish}>Add</button>
      </div>

      <div style={{ marginTop: 20 }}>
        <table border="1" cellPadding="8">
          <thead>
            <tr>
              <th>Dish</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Cost</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={idx}>
                <td>{i.name}</td>
                <td>{i.qty}</td>
                <td>{i.price}</td>
                <td>{i.cost}</td>
                <td>{i.revenue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 30 }}>Analytics</h3>

      <p>Revenue vs Cost vs Profit</p>

      <div style={{ background: "#ccc", height: 10, marginTop: 10 }}>
        <div
          style={{
            width: revenue ? `${(revenue / (revenue + cost)) * 100}%` : "0%",
            background: "green",
            height: "100%",
          }}
        />
      </div>

      <p style={{ marginTop: 10 }}>Cost</p>
      <div style={{ background: "#ccc", height: 10 }}>
        <div
          style={{
            width: revenue ? `${(cost / (revenue + cost)) * 100}%` : "0%",
            background: "red",
            height: "100%",
          }}
        />
      </div>

      <p style={{ marginTop: 10 }}>Profit</p>
      <div style={{ background: "#ccc", height: 10 }}>
        <div
          style={{
            width: revenue ? `${(profit / (revenue + cost)) * 100}%` : "0%",
            background: "blue",
            height: "100%",
          }}
        />
      </div>
    </div>
  );
}