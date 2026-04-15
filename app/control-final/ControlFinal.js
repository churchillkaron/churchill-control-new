"use client";

import { useMemo, useState, useEffect } from "react";

const COLORS = {
  bg: "#f4efe3",
  panel: "#fffaf0",
  line: "#c2b59b",
  text: "#3b3428",
  muted: "#756a57",
  khakiDark: "#8f7d56",
  white: "#ffffff",
  good: "#5f7a52",
  bad: "#9c5f4a",
};

const MENU = [
  { name: "Ribeye Steak", price: 890, cost: 206 },
  { name: "Beef Tenderloin", price: 920, cost: 265 },
  { name: "Salmon", price: 690, cost: 172 },
  { name: "Pad Thai", price: 160, cost: 56 },
];

export default function ControlFinal() {
  const [isMobile, setIsMobile] = useState(false);
  const [dish, setDish] = useState(MENU[0]);
  const [qty, setQty] = useState(1);
  const [items, setItems] = useState([]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const add = () => {
    setItems([...items, { ...dish, qty }]);
  };

  const revenue = items.reduce((s, i) => s + i.price * i.qty, 0);
  const cost = items.reduce((s, i) => s + i.cost * i.qty, 0);
  const profit = revenue - cost;

  return (
    <div style={{ padding: isMobile ? 16 : 30 }}>
      <h1 style={{ fontSize: isMobile ? 28 : 46 }}>
        Churchill Control
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 16,
        }}
      >
        <div>
          <select
            style={{ width: "100%", padding: 12 }}
            onChange={(e) =>
              setDish(
                MENU.find((d) => d.name === e.target.value)
              )
            }
          >
            {MENU.map((d) => (
              <option key={d.name}>{d.name}</option>
            ))}
          </select>

          <input
            type="number"
            value={qty}
            style={{ width: "100%", marginTop: 10, padding: 12 }}
            onChange={(e) => setQty(Number(e.target.value))}
          />

          <button
            onClick={add}
            style={{
              width: "100%",
              marginTop: 10,
              padding: 14,
              background: "#8f7d56",
              color: "#fff",
              border: "none",
              borderRadius: 10,
            }}
          >
            Add Dish
          </button>
        </div>

        <div>
          <p>Revenue: {revenue}</p>
          <p>Cost: {cost}</p>
          <p>Profit: {profit}</p>
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          overflowX: "auto",
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 400,
          }}
        >
          <thead>
            <tr>
              <th>Dish</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>

          <tbody>
            {items.map((i, idx) => (
              <tr key={idx}>
                <td>{i.name}</td>
                <td>{i.qty}</td>
                <td>{i.price * i.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}