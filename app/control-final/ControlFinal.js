"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const nameRefs = useRef([]);

  // ✅ FETCH DISH MEMORY
  useEffect(() => {
    fetchDishLibrary();
  }, []);

  const fetchDishLibrary = async () => {
    try {
      const res = await fetch("/api/history");
      const data = await res.json();

      const map = {};

      data.data?.forEach((report) => {
        report.dishes?.forEach((dish) => {
          if (!map[dish.name]) {
            map[dish.name] = {
              name: dish.name,
              price: dish.price,
              cost: dish.cost,
            };
          }
        });
      });

      setDishLibrary(Object.values(map));
    } catch (err) {
      console.error(err);
    }
  };

  const parsedDishes = useMemo(() => {
    return dishes.map((dish, index) => {
      const qty = Number(dish.qty) || 0;
      const price = Number(dish.price) || 0;
      const cost = Number(dish.cost) || 0;

      const revenue = qty * price;
      const totalCost = qty * cost;
      const profit = revenue - totalCost;

      return {
        ...dish,
        index,
        qtyNumber: qty,
        priceNumber: price,
        costNumber: cost,
        revenue,
        totalCost,
        profit,
      };
    });
  }, [dishes]);

  const activeDishes = useMemo(() => {
    return parsedDishes.filter(
      (d) =>
        d.name.trim() !== "" ||
        d.qty !== "" ||
        d.price !== "" ||
        d.cost !== ""
    );
  }, [parsedDishes]);

  const totals = useMemo(() => {
    return activeDishes.reduce(
      (acc, d) => {
        acc.items += d.qtyNumber;
        acc.revenue += d.revenue;
        acc.cost += d.totalCost;
        acc.profit += d.profit;
        return acc;
      },
      { items: 0, revenue: 0, cost: 0, profit: 0 }
    );
  }, [activeDishes]);

  const formatMoney = (value) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
    }).format(value || 0);
  };

  // ✅ UPDATED WITH AUTO-FILL
  const updateDish = (index, field, value) => {
    setDishes((current) =>
      current.map((dish, i) => {
        if (i !== index) return dish;

        let updated = { ...dish, [field]: value };

        if (field === "name") {
          const match = dishLibrary.find(
            (d) => d.name.toLowerCase() === value.toLowerCase()
          );

          if (match) {
            updated.price = match.price;
            updated.cost = match.cost;
          }
        }

        return updated;
      })
    );
  };

  const addRow = () => {
    setDishes((current) => [...current, emptyDish()]);
  };

  const removeRow = (index) => {
    setDishes((current) => {
      if (current.length === 1) return [emptyDish()];
      return current.filter((_, i) => i !== index);
    });
  };

  const saveDay = async () => {
    const cleaned = activeDishes.map((d) => ({
      name: d.name,
      qty: d.qtyNumber,
      price: d.priceNumber,
      cost: d.costNumber,
      revenue: d.revenue,
      totalCost: d.totalCost,
      profit: d.profit,
    }));

    if (cleaned.length === 0) {
      setMessage("Add at least one dish.");
      setMessageType("error");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/save-day", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: reportDate,
          dishes: cleaned,
          revenue: totals.revenue,
          cost: totals.cost,
          profit: totals.profit,
        }),
      });

      if (!res.ok) throw new Error("Save failed");

      setMessage("Saved successfully");
      setMessageType("success");
    } catch (err) {
      setMessage(err.message);
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1>Control Panel</h1>

        <input
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          style={styles.date}
        />

        <div style={styles.table}>
          <div style={styles.header}>
            <span style={{ flex: 2 }}>Dish</span>
            <span>Qty</span>
            <span>Price</span>
            <span>Cost</span>
            <span>Revenue</span>
            <span>Profit</span>
            <span></span>
          </div>

          {parsedDishes.map((dish, i) => (
            <div key={i} style={styles.row}>
              <input
                list="dish-suggestions"
                value={dish.name}
                onChange={(e) => updateDish(i, "name", e.target.value)}
                style={{ flex: 2 }}
              />
              <input
                value={dish.qty}
                onChange={(e) => updateDish(i, "qty", e.target.value)}
              />
              <input
                value={dish.price}
                onChange={(e) => updateDish(i, "price", e.target.value)}
              />
              <input
                value={dish.cost}
                onChange={(e) => updateDish(i, "cost", e.target.value)}
              />

              <span>{formatMoney(dish.revenue)}</span>
              <span>{formatMoney(dish.profit)}</span>

              <button onClick={() => removeRow(i)}>x</button>
            </div>
          ))}
        </div>

        {/* AUTOCOMPLETE */}
        <datalist id="dish-suggestions">
          {dishLibrary.map((d, i) => (
            <option key={i} value={d.name} />
          ))}
        </datalist>

        <button onClick={addRow}>+ Add</button>

        <div style={styles.totals}>
          <p>Revenue: {formatMoney(totals.revenue)}</p>
          <p>Cost: {formatMoney(totals.cost)}</p>
          <p>Profit: {formatMoney(totals.profit)}</p>
        </div>

        <button onClick={saveDay} disabled={saving}>
          {saving ? "Saving..." : "Save Day"}
        </button>

        {message && <p>{message}</p>}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: 20 },
  container: { maxWidth: 900, margin: "0 auto" },
  date: { marginBottom: 10 },
  table: { border: "1px solid #eee" },
  header: {
    display: "flex",
    fontWeight: "bold",
    padding: 5,
  },
  row: {
    display: "flex",
    gap: 5,
    padding: 5,
    borderTop: "1px solid #eee",
  },
  totals: {
    marginTop: 15,
  },
};