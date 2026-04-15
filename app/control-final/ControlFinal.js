"use client";

import { useMemo, useRef, useState } from "react";

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
  { name: "Churchill Sambal Half Chicken", category: "Main", price: 590, cost: 133.87 },
  { name: "Veal Stew", category: "Main", price: 850, cost: 254.74 },

  { name: "Potato Gratin", category: "Side", price: 120, cost: 30.34 },
  { name: "Crispy Potato Wedges", category: "Side", price: 100, cost: 18.34 },
  { name: "Cauliflower Puree", category: "Side", price: 120, cost: 27.44 },

  { name: "Tom Yum Goong", category: "Soup", price: 180, cost: 94.4 },
  { name: "Tom Kha Gai", category: "Soup", price: 170, cost: 70.1 },

  { name: "Pad Thai", category: "Main", price: 160, cost: 56.55 },
  { name: "Pad Ka Prow", category: "Main", price: 150, cost: 36.91 },
  { name: "Chicken Cashew Nuts", category: "Main", price: 180, cost: 68.04 },
  { name: "Beef with Oyster Sauce", category: "Main", price: 220, cost: 160.53 },
  { name: "Massaman Curry", category: "Main", price: 180, cost: 90.96 },
  { name: "Green Curry", category: "Main", price: 170, cost: 80.77 },
  { name: "Panang Curry", category: "Main", price: 175, cost: 71.9 },
  { name: "Pineapple Fried Rice", category: "Main", price: 160, cost: 54.36 },
];

function formatMoney(v) {
  return Number(v || 0).toFixed(0);
}

export default function ControlFinal() {
  const [rows, setRows] = useState([
    { dish: "", qty: 1, price: 0, cost: 0 },
  ]);
  const [search, setSearch] = useState("");
  const inputRefs = useRef([]);

  const filteredDishes = DISHES.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDishChange = (i, value) => {
    const d = DISHES.find((x) => x.name === value);

    const updated = [...rows];
    updated[i] = {
      ...updated[i],
      dish: value,
      price: d ? d.price : 0,
      cost: d ? d.cost : 0,
    };
    setRows(updated);
  };

  const handleQtyChange = (i, value) => {
    const updated = [...rows];
    updated[i].qty = Number(value);
    setRows(updated);
  };

  const handleKeyDown = (e, i) => {
    if (e.key === "Enter") {
      e.preventDefault();

      if (i === rows.length - 1) {
        setRows([...rows, { dish: "", qty: 1, price: 0, cost: 0 }]);
        setTimeout(() => inputRefs.current[i + 1]?.focus(), 100);
      } else {
        inputRefs.current[i + 1]?.focus();
      }
    }

    if (e.key === "Backspace" && rows[i].dish === "" && rows.length > 1) {
      const updated = rows.filter((_, idx) => idx !== i);
      setRows(updated);
    }
  };

  // 🔥 TOTALS
  const totals = (() => {
    let revenue = 0;
    let cost = 0;
    let qty = 0;

    rows.forEach((r) => {
      revenue += r.price * r.qty;
      cost += r.cost * r.qty;
      qty += r.qty;
    });

    return {
      revenue,
      cost,
      profit: revenue - cost,
      margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
      qty,
    };
  })();

  // 🔥 ANALYTICS
  const analytics = (() => {
    const map = {};

    rows.forEach((r) => {
      if (!r.dish) return;

      if (!map[r.dish]) {
        map[r.dish] = { qty: 0, revenue: 0, cost: 0 };
      }

      map[r.dish].qty += r.qty;
      map[r.dish].revenue += r.price * r.qty;
      map[r.dish].cost += r.cost * r.qty;
    });

    const list = Object.entries(map).map(([name, v]) => ({
      name,
      ...v,
      profit: v.revenue - v.cost,
      foodCost: v.revenue > 0 ? (v.cost / v.revenue) * 100 : 0,
    }));

    list.sort((a, b) => b.qty - a.qty);

    return {
      list,
      top: list[0],
      bestProfit: [...list].sort((a, b) => b.profit - a.profit)[0],
      worstCost: [...list].sort((a, b) => b.foodCost - a.foodCost)[0],
    };
  })();

  // 🔥 AI MANAGER (NO useMemo — ALWAYS FRESH)
  const ai = (() => {
    const out = [];

    if (totals.revenue === 0) {
      out.push("⚠️ No data yet");
      return out;
    }

    if (totals.margin < 50) {
      out.push("🔴 Margin too low → increase prices or reduce cost");
    }

    if (analytics.worstCost && analytics.worstCost.foodCost > 50) {
      out.push(
        `🟡 ${analytics.worstCost.name} food cost too high (${analytics.worstCost.foodCost.toFixed(
          1
        )}%)`
      );
    }

    if (analytics.bestProfit) {
      out.push(`🟢 Push ${analytics.bestProfit.name} (best profit)`);
    }

    if (analytics.top) {
      out.push(`🔵 ${analytics.top.name} sells most`);
    }

    return out;
  })();

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>Churchill Control Panel</h1>
      <p style={{ color: "#666" }}>Live Restaurant Intelligence</p>

      {/* KPI STRIP */}
      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
        <div>Revenue: {formatMoney(totals.revenue)}</div>
        <div>Profit: {formatMoney(totals.profit)}</div>
        <div>Margin: {totals.margin.toFixed(1)}%</div>
        <div>Dishes: {totals.qty}</div>
      </div>

      {/* AI MANAGER */}
      <div style={{ marginTop: 20 }}>
        <h3>AI Manager</h3>
        {ai.map((m, i) => (
          <div key={i}>{m}</div>
        ))}
      </div>

      {/* SEARCH */}
      <input
        placeholder="Search dish..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: "100%", marginTop: 20 }}
      />

      {/* TABLE */}
      <table width="100%" style={{ marginTop: 10 }}>
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
                  ref={(el) => (inputRefs.current[i] = el)}
                  value={r.dish}
                  onChange={(e) => handleDishChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  style={{ width: "100%" }}
                >
                  <option value="">Select</option>
                  {filteredDishes.map((d) => (
                    <option key={d.name}>{d.name}</option>
                  ))}
                </select>
              </td>

              <td>
                <input
                  type="number"
                  value={r.qty}
                  onChange={(e) => handleQtyChange(i, e.target.value)}
                />
              </td>

              <td>{formatMoney(r.price)}</td>
              <td>{formatMoney(r.cost)}</td>
              <td>{formatMoney(r.price * r.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        style={{ marginTop: 20 }}
        onClick={async () => {
          await fetch("/api/save-day", {
            method: "POST",
            body: JSON.stringify({
              date: new Date().toISOString(),
              dishes: rows,
              revenue: totals.revenue,
              cost: totals.cost,
              profit: totals.profit,
            }),
          });
          alert("Saved");
        }}
      >
        Save Day
      </button>
    </div>
  );
}