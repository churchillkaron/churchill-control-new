"use client";

import { useRef, useState } from "react";

const DISHES = [
  { name: "Beef Carpaccio", category: "Starter", price: 320, cost: 110.72 },
  { name: "Chili & Garlic Prawns", category: "Starter", price: 320, cost: 74.32 },
  { name: "Signature Bruschetta", category: "Starter", price: 280, cost: 62.38 },
  { name: "Seared Scallops", category: "Starter", price: 520, cost: 175.72 },
  { name: "Mango & Tomato Salad", category: "Light", price: 220, cost: 16.97 },

  { name: "Churchill Beef Short Ribs", category: "Main", price: 890, cost: 518.36 },
  { name: "Ribeye Steak", category: "Main", price: 890, cost: 206.36 },
  { name: "Beef Tenderloin", category: "Main", price: 920, cost: 265.69 },
  { name: "Pork Tenderloin", category: "Main", price: 460, cost: 76.54 },
  { name: "Salmon", category: "Main", price: 690, cost: 172.6 },

  { name: "Pad Thai", category: "Main", price: 160, cost: 56.55 },
  { name: "Pad Ka Prow", category: "Main", price: 150, cost: 36.91 },
];

const money = (v) => Number(v || 0).toFixed(0);
const percent = (v) => `${Number(v || 0).toFixed(1)}%`;

function BarChart({ revenue, cost, profit }) {
  const max = Math.max(revenue, cost, profit, 1);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ marginBottom: 5 }}>Revenue vs Cost vs Profit</div>

      {[
        { label: "Revenue", value: revenue },
        { label: "Cost", value: cost },
        { label: "Profit", value: profit },
      ].map((item) => (
        <div key={item.label} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12 }}>{item.label}</div>
          <div
            style={{
              height: 10,
              width: `${(item.value / max) * 100}%`,
              background: "#666",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function TopDishChart({ list }) {
  if (!list.length) return null;

  const max = Math.max(...list.map((d) => d.qty), 1);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ marginBottom: 5 }}>Top Dishes</div>

      {list.slice(0, 5).map((d) => (
        <div key={d.name} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12 }}>{d.name}</div>
          <div
            style={{
              height: 10,
              width: `${(d.qty / max) * 100}%`,
              background: "#999",
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default function ControlFinal() {
  const [rows, setRows] = useState([{ dish: "", qty: 1, price: 0, cost: 0 }]);
  const [search, setSearch] = useState("");
  const inputRefs = useRef([]);

  const filtered = DISHES.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

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
    let r = 0,
      c = 0,
      q = 0;

    rows.forEach((x) => {
      r += x.price * x.qty;
      c += x.cost * x.qty;
      q += x.qty;
    });

    return {
      revenue: r,
      cost: c,
      profit: r - c,
      margin: r ? ((r - c) / r) * 100 : 0,
      qty: q,
    };
  })();

  const analytics = (() => {
    const map = {};

    rows.forEach((r) => {
      if (!r.dish) return;

      if (!map[r.dish]) {
        map[r.dish] = { name: r.dish, qty: 0, revenue: 0, cost: 0 };
      }

      map[r.dish].qty += r.qty;
      map[r.dish].revenue += r.price * r.qty;
      map[r.dish].cost += r.cost * r.qty;
    });

    return Object.values(map).sort((a, b) => b.qty - a.qty);
  })();

  const ai = (() => {
    if (!totals.revenue) return ["⚠️ No sales data yet"];

    return [
      totals.margin < 50
        ? "🔴 Margin too low → adjust prices"
        : "🟢 Margin healthy",
    ];
  })();

  return (
    <div style={{ padding: 40, fontFamily: "Arial", maxWidth: 1100, margin: "0 auto" }}>
      <h1>Churchill Control Panel</h1>

      {/* KPI */}
      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
        <div>Revenue: {money(totals.revenue)}</div>
        <div>Profit: {money(totals.profit)}</div>
        <div>Margin: {percent(totals.margin)}</div>
        <div>Dishes: {totals.qty}</div>
      </div>

      {/* AI */}
      <div style={{ marginTop: 20 }}>
        <h3>AI Manager</h3>
        {ai.map((x, i) => (
          <div key={i}>{x}</div>
        ))}
      </div>

      {/* INPUT */}
      <div style={{ marginTop: 20 }}>
        <input
          placeholder="Search dish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", marginBottom: 10 }}
        />

        <table width="100%">
          <thead>
            <tr>
              <th align="left">Dish</th>
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
                    {filtered.map((d) => (
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

                <td>{money(r.price)}</td>
                <td>{money(r.cost)}</td>
                <td>{money(r.price * r.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 🔥 ANALYTICS BACK */}
      <div style={{ marginTop: 30 }}>
        <h2>Analytics</h2>

        <BarChart
          revenue={totals.revenue}
          cost={totals.cost}
          profit={totals.profit}
        />

        <TopDishChart list={analytics} />
      </div>
    </div>
  );
}