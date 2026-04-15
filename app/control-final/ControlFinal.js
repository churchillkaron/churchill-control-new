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

export default function ControlFinal() {
  const [rows, setRows] = useState([
    { dish: "", qty: 1, price: 0, cost: 0 },
  ]);

  const inputRefs = useRef([]);
  const [search, setSearch] = useState("");

  // 🔥 FILTERED DISHES (SMART SEARCH)
  const filteredDishes = useMemo(() => {
    return DISHES.filter((d) =>
      d.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  // 🔥 AUTOFILL
  const handleDishChange = (index, value) => {
    const selected = DISHES.find((d) => d.name === value);

    const updated = [...rows];
    updated[index] = {
      ...updated[index],
      dish: value,
      price: selected ? selected.price : 0,
      cost: selected ? selected.cost : 0,
    };

    setRows(updated);
  };

  const handleQtyChange = (index, value) => {
    const updated = [...rows];
    updated[index].qty = Number(value);
    setRows(updated);
  };

  // 🔥 DELETE ROW (BACKSPACE ON EMPTY)
  const handleKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();

      if (index === rows.length - 1) {
        setRows([
          ...rows,
          { dish: "", qty: 1, price: 0, cost: 0 },
        ]);

        setTimeout(() => {
          inputRefs.current[index + 1]?.focus();
        }, 100);
      } else {
        inputRefs.current[index + 1]?.focus();
      }
    }

    if (e.key === "Backspace" && rows[index].dish === "") {
      if (rows.length > 1) {
        const updated = rows.filter((_, i) => i !== index);
        setRows(updated);

        setTimeout(() => {
          inputRefs.current[index - 1]?.focus();
        }, 100);
      }
    }
  };

  // 🔥 CALCULATIONS
  const totals = useMemo(() => {
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
      margin:
        revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
    };
  }, [rows]);

  // 🔥 TOP DISH PERFORMANCE
  const topDish = useMemo(() => {
    const map = {};

    rows.forEach((r) => {
      if (!r.dish) return;

      if (!map[r.dish]) {
        map[r.dish] = 0;
      }
      map[r.dish] += r.qty;
    });

    let best = "";
    let max = 0;

    Object.keys(map).forEach((k) => {
      if (map[k] > max) {
        max = map[k];
        best = k;
      }
    });

    return best;
  }, [rows]);

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1 style={{ marginBottom: 20 }}>Churchill Control Panel</h1>

      {/* 🔍 SEARCH */}
      <input
        placeholder="Search dish..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          marginBottom: 10,
          padding: 8,
          width: "100%",
        }}
      />

      {/* TABLE */}
      <table width="100%" style={{ borderCollapse: "collapse" }}>
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
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <select
                  ref={(el) => (inputRefs.current[i] = el)}
                  value={row.dish}
                  onChange={(e) => handleDishChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  style={{ width: "100%" }}
                >
                  <option value="">Select dish</option>
                  {filteredDishes.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name} ({d.category})
                    </option>
                  ))}
                </select>
              </td>

              <td>
                <input
                  type="number"
                  value={row.qty}
                  onChange={(e) => handleQtyChange(i, e.target.value)}
                  style={{ width: 60 }}
                />
              </td>

              <td>{row.price.toFixed(0)}</td>
              <td>{row.cost.toFixed(0)}</td>
              <td>{(row.price * row.qty).toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* TOTALS */}
      <div style={{ marginTop: 30 }}>
        <h2>Totals</h2>
        <p>Revenue: {totals.revenue.toFixed(0)} THB</p>
        <p>Cost: {totals.cost.toFixed(0)} THB</p>
        <p>Profit: {totals.profit.toFixed(0)} THB</p>
        <p>Margin: {totals.margin.toFixed(1)}%</p>
        <p>Top Dish: {topDish || "-"}</p>
      </div>

      {/* SAVE */}
      <button
        style={{
          marginTop: 20,
          padding: "10px 20px",
          fontSize: 16,
          cursor: "pointer",
        }}
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

          alert("Saved!");
        }}
      >
        Save Day
      </button>
    </div>
  );
}