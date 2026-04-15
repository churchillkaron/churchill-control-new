"use client";

import { useState } from "react";

const DISHES = [
  { name: "Beef Carpaccio", price: 320, cost: 110 },
  { name: "Chili & Garlic Prawns", price: 320, cost: 74 },
  { name: "Ribeye Steak", price: 890, cost: 206 },
  { name: "Salmon", price: 690, cost: 172 },
  { name: "Pad Thai", price: 160, cost: 56 },
];

const money = (v) => Number(v || 0).toFixed(0);

export default function ControlFinal() {
  const [rows, setRows] = useState([
    { dish: "", qty: 1, price: 0, cost: 0 },
  ]);

  const updateDish = (i, val) => {
    const d = DISHES.find((x) => x.name === val);
    const copy = [...rows];

    copy[i] = {
      ...copy[i],
      dish: val,
      price: d ? d.price : 0,
      cost: d ? d.cost : 0,
    };

    setRows(copy);
  };

  const updateQty = (i, val) => {
    const copy = [...rows];
    copy[i].qty = Number(val);
    setRows(copy);
  };

  const totals = (() => {
    let revenue = 0;
    let cost = 0;

    rows.forEach((r) => {
      revenue += r.price * r.qty;
      cost += r.cost * r.qty;
    });

    return {
      revenue,
      cost,
      profit: revenue - cost,
      margin: revenue ? ((revenue - cost) / revenue) * 100 : 0,
    };
  })();

  const dishStats = (() => {
    const map = {};
    rows.forEach((r) => {
      if (!r.dish) return;
      if (!map[r.dish]) map[r.dish] = { name: r.dish, qty: 0 };
      map[r.dish].qty += r.qty;
    });
    return Object.values(map);
  })();

  const maxQty = Math.max(...dishStats.map((d) => d.qty), 1);

  return (
    <div style={{ padding: 40, maxWidth: 1000, margin: "0 auto" }}>
      <h1>Churchill Control Panel</h1>

      <div>
        Revenue: {money(totals.revenue)} | Profit: {money(totals.profit)} |
        Margin: {totals.margin.toFixed(1)}%
      </div>

      <h3 style={{ marginTop: 20 }}>AI Manager</h3>
      {totals.revenue === 0 ? (
        <div>⚠️ No sales data yet</div>
      ) : (
        <div>
          {totals.margin < 50
            ? "🔴 Increase prices"
            : "🟢 Margin healthy"}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <table width="100%">
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
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <select
                    value={r.dish}
                    onChange={(e) => updateDish(i, e.target.value)}
                  >
                    <option value="">Select</option>
                    {DISHES.map((d) => (
                      <option key={d.name}>{d.name}</option>
                    ))}
                  </select>
                </td>

                <td>
                  <input
                    type="number"
                    value={r.qty}
                    onChange={(e) => updateQty(i, e.target.value)}
                  />
                </td>

                <td>{r.price}</td>
                <td>{r.cost}</td>
                <td>{r.price * r.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 30 }}>
        <h2>Analytics</h2>

        <div style={{ height: 10, background: "#666", width: "100%" }} />

        {dishStats.map((d) => (
          <div key={d.name}>
            {d.name}
            <div
              style={{
                height: 8,
                width: `${(d.qty / maxQty) * 100}%`,
                background: "#444",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}