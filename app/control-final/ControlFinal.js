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

function Bar({ value, max }) {
  if (!value || !max) return null;

  return (
    <div
      style={{
        height: 10,
        width: `${(value / max) * 100}%`,
        background: "#666",
        marginBottom: 6,
      }}
    />
  );
}

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

  // 🔥 FIXED ANALYTICS
  const analytics = (() => {
    const map = {};

    rows.forEach((r) => {
      if (!r.dish) return;

      if (!map[r.dish]) {
        map[r.dish] = { name: r.dish, qty: 0 };
      }

      map[r.dish].qty += r.qty;
    });

    const list = Object.values(map);

    const maxQty = Math.max(...list.map((d) => d.qty), 1);

    return {
      list,
      maxQty,
    };
  })();

  // 🔥 STRONG AI BACK
  const ai = (() => {
    if (!totals.revenue) return ["⚠️ No sales data yet"];

    const out = [];

    if (totals.margin < 50) {
      out.push("🔴 Margin too low — increase prices");
    } else {
      out.push("🟢 Margin healthy");
    }

    if (analytics.list.length > 0) {
      out.push(`🔵 Top dish: ${analytics.list[0].name}`);
    }

    return out;
  })();

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <h1>Churchill Control Panel</h1>

      <div style={{ marginTop: 10 }}>
        Revenue: {money(totals.revenue)} | Profit: {money(totals.profit)} |
        Margin: {totals.margin.toFixed(1)}%
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>AI Manager</h3>
        {ai.map((x, i) => (
          <div key={i}>{x}</div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <table width="100%">
          <thead>
            <tr>
              <th align="left">Dish</th>
              <th>Qty</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 🔥 FIXED ANALYTICS */}
      <div style={{ marginTop: 30 }}>
        <h2>Analytics</h2>

        <h4>Revenue vs Cost vs Profit</h4>

        <Bar value={totals.revenue} max={totals.revenue} />
        <Bar value={totals.cost} max={totals.revenue} />
        <Bar value={totals.profit} max={totals.revenue} />

        <h4 style={{ marginTop: 20 }}>Top Dishes</h4>

        {analytics.list.map((d) => (
          <div key={d.name}>
            {d.name}
            <Bar value={d.qty} max={analytics.maxQty} />
          </div>
        ))}
      </div>
    </div>
  );
}