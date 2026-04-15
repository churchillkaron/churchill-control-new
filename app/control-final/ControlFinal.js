"use client";

import { useEffect, useMemo, useState } from "react";

const emptyDish = () => ({
  name: "",
  qty: "1",
  price: "",
  cost: "",
});

export default function ControlFinal() {
  const [reportDate, setReportDate] = useState(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  });

  const [dishes, setDishes] = useState([
    emptyDish(),
    emptyDish(),
    emptyDish(),
    emptyDish(),
  ]);

  const [dishLibrary, setDishLibrary] = useState([]);

  // 🔥 FETCH SAVED DISHES
  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then((data) => {
        const map = {};

        data.data?.forEach((report) => {
          report.dishes?.forEach((dish) => {
            if (!map[dish.name]) {
              map[dish.name] = dish.name;
            }
          });
        });

        setDishLibrary(Object.values(map));
      })
      .catch(() => {});
  }, []);

  const parsed = useMemo(() => {
    return dishes.map((d) => {
      const qty = Number(d.qty) || 0;
      const price = Number(d.price) || 0;
      const cost = Number(d.cost) || 0;

      const revenue = qty * price;
      const profit = revenue - qty * cost;

      return { ...d, qty, price, cost, revenue, profit };
    });
  }, [dishes]);

  const totals = useMemo(() => {
    return parsed.reduce(
      (acc, d) => {
        acc.revenue += d.revenue;
        acc.cost += d.qty * d.cost;
        acc.profit += d.profit;
        return acc;
      },
      { revenue: 0, cost: 0, profit: 0 }
    );
  }, [parsed]);

  const update = (i, field, value) => {
    setDishes((prev) =>
      prev.map((d, idx) =>
        idx === i ? { ...d, [field]: value } : d
      )
    );
  };

  const format = (v) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
    }).format(v || 0);

  const save = async () => {
    const clean = parsed.filter((d) => d.name);

    await fetch("/api/save-day", {
      method: "POST",
      body: JSON.stringify({
        date: reportDate,
        dishes: clean,
        revenue: totals.revenue,
        cost: totals.cost,
        profit: totals.profit,
      }),
    });

    alert("Saved");
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Control Panel</h1>

      <input
        type="date"
        value={reportDate}
        onChange={(e) => setReportDate(e.target.value)}
      />

      <div>
        {parsed.map((d, i) => (
          <div key={i} style={{ display: "flex", gap: 5 }}>
            {/* 🔥 FIXED INPUT */}
            <input
              value={d.name}
              onChange={(e) => update(i, "name", e.target.value)}
              placeholder="Dish name"
              autoComplete="off"
            />

            <input
              value={d.qty}
              onChange={(e) => update(i, "qty", e.target.value)}
            />
            <input
              value={d.price}
              onChange={(e) => update(i, "price", e.target.value)}
            />
            <input
              value={d.cost}
              onChange={(e) => update(i, "cost", e.target.value)}
            />

            <span>{format(d.revenue)}</span>
            <span>{format(d.profit)}</span>
          </div>
        ))}
      </div>

      {/* 🔥 CUSTOM DROPDOWN DISPLAY */}
      {dishLibrary.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <strong>Saved dishes:</strong>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {dishLibrary.map((name, i) => (
              <span
                key={i}
                style={{
                  padding: "5px 10px",
                  background: "#eee",
                  borderRadius: 6,
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <p>Revenue: {format(totals.revenue)}</p>
        <p>Cost: {format(totals.cost)}</p>
        <p>Profit: {format(totals.profit)}</p>
      </div>

      <button onClick={save}>Save Day</button>
    </div>
  );
}