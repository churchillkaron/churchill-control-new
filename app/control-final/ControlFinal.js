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

function money(v) {
  return Number(v || 0).toFixed(0);
}

export default function ControlFinal() {
  const [rows, setRows] = useState([
    { dish: "", qty: 1, price: 0, cost: 0 },
  ]);
  const [search, setSearch] = useState("");
  const inputRefs = useRef([]);

  const filtered = DISHES.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  // 🔥 UPDATE DISH
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

  // 🔥 UPDATE QTY
  const updateQty = (i, val) => {
    const copy = [...rows];
    copy[i].qty = Number(val);
    setRows(copy);
  };

  // 🔥 ADD ROW
  const addRow = () => {
    setRows([...rows, { dish: "", qty: 1, price: 0, cost: 0 }]);
  };

  // 🔥 REMOVE LAST ROW
  const removeRow = () => {
    if (rows.length > 1) {
      setRows(rows.slice(0, -1));
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
      margin: revenue ? ((revenue - cost) / revenue) * 100 : 0,
      qty,
    };
  })();

  // 🔥 ANALYTICS (NO useMemo)
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
      foodCost: v.revenue ? (v.cost / v.revenue) * 100 : 0,
    }));

    list.sort((a, b) => b.qty - a.qty);

    return {
      top: list[0],
      bestProfit: [...list].sort((a, b) => b.profit - a.profit)[0],
      worstCost: [...list].sort((a, b) => b.foodCost - a.foodCost)[0],
    };
  })();

  // 🔥 AI MANAGER (STRONGER VERSION)
  const ai = (() => {
    const out = [];

    if (!totals.revenue) {
      out.push("⚠️ No data yet — start entering sales");
      return out;
    }

    if (totals.margin < 50) {
      out.push("🔴 Margin too low → increase prices or reduce cost immediately");
    }

    if (analytics.worstCost && analytics.worstCost.foodCost > 50) {
      out.push(
        `🟡 ${analytics.worstCost.name} has high food cost (${analytics.worstCost.foodCost.toFixed(
          1
        )}%)`
      );
    }

    if (analytics.bestProfit) {
      out.push(`🟢 Push ${analytics.bestProfit.name} (high profit dish)`);
    }

    if (analytics.top) {
      out.push(`🔵 ${analytics.top.name} sells most — consider upsell`);
    }

    return out;
  })();

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "Arial",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      {/* HEADER */}
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ marginBottom: 5 }}>Churchill Control Panel</h1>
        <div style={{ color: "#777" }}>Live Restaurant Intelligence</div>
      </div>

      {/* KPI SECTION */}
      <div
        style={{
          display: "flex",
          gap: 30,
          padding: 25,
          border: "1px solid #ddd",
          borderRadius: 10,
          marginBottom: 30,
          background: "#fafafa",
        }}
      >
        <div>
          <strong>Revenue</strong>
          <div>{money(totals.revenue)} THB</div>
        </div>

        <div>
          <strong>Profit</strong>
          <div>{money(totals.profit)} THB</div>
        </div>

        <div>
          <strong>Margin</strong>
          <div>{totals.margin.toFixed(1)}%</div>
        </div>

        <div>
          <strong>Dishes</strong>
          <div>{totals.qty}</div>
        </div>
      </div>

      {/* AI MANAGER */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 25,
          marginBottom: 30,
          background: "#fff",
        }}
      >
        <strong style={{ fontSize: 16 }}>AI Manager</strong>

        <div style={{ marginTop: 10 }}>
          {ai.map((msg, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              {msg}
            </div>
          ))}
        </div>
      </div>

      {/* INPUT PANEL */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 25,
          background: "#fff",
        }}
      >
        <input
          placeholder="Search dish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 15,
          }}
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
                    ref={(el) => (inputRefs.current[i] = el)}
                    value={r.dish}
                    onChange={(e) => updateDish(i, e.target.value)}
                    style={{ width: "100%" }}
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
                    style={{ width: 60 }}
                  />
                </td>

                <td>{money(r.price)}</td>
                <td>{money(r.cost)}</td>
                <td>{money(r.price * r.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ACTIONS */}
        <div style={{ marginTop: 20 }}>
          <button onClick={addRow} style={{ marginRight: 10 }}>
            Add Row
          </button>

          <button onClick={removeRow} style={{ marginRight: 10 }}>
            Remove Row
          </button>

          <button
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
      </div>
    </div>
  );
}