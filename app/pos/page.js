"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [table, setTable] = useState("T1");
  const [activeCategory, setActiveCategory] = useState("starter");

  const tables = ["T1", "T2", "T3", "T4", "T5", "T6"];

  const menu = {
    starter: [
      { name: "Beef Carpaccio", price: 320, station: "WESTERN", course: "starter" },
      { name: "Tom Yum Goong", price: 180, station: "THAI", course: "starter" },
    ],
    main: [
      { name: "Chili Prawns", price: 320, station: "THAI", course: "main" },
      { name: "Scallops", price: 520, station: "WESTERN", course: "main" },
    ],
    dessert: [
      { name: "Mango Sticky Rice", price: 180, station: "THAI", course: "dessert" },
      { name: "Chocolate Cake", price: 220, station: "WESTERN", course: "dessert" },
    ],
  };

  // 🔥 LIVE SYNC (handles cancel automatically)
  useEffect(() => {
    const load = () => {
      const stored = JSON.parse(localStorage.getItem("orders") || "[]");

      const tableOrders = stored.filter((o) => o.table === table);

      // flatten items → reflects cancel instantly
      const items = tableOrders.flatMap((o) => o.items || []);

      setExistingItems(items);
    };

    load();
    const interval = setInterval(load, 1000);
    return () => clearInterval(interval);
  }, [table]);

  const addItem = (item) => {
    setOrderItems((prev) => [
      ...prev,
      {
        ...item,
        id: Date.now() + Math.random(),
        status: "NEW",
      },
    ]);
  };

  const sendOrder = (mode) => {
    if (orderItems.length === 0) return;

    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const newOrder = {
      id: Date.now(),
      table,
      items: orderItems,
      total: orderItems.reduce((s, i) => s + i.price, 0),
      status: mode === "fire" ? "kitchen" : "hold",
      created_at: new Date().toISOString(),
    };

    stored.push(newOrder);
    localStorage.setItem("orders", JSON.stringify(stored));

    setOrderItems([]);
  };

  const fireHeld = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = stored.map((o) => {
      if (o.table !== table) return o;
      if (o.status !== "hold") return o;

      return {
        ...o,
        status: "kitchen",
      };
    });

    localStorage.setItem("orders", JSON.stringify(updated));
  };

  const total =
    existingItems.reduce((s, i) => s + i.price, 0) +
    orderItems.reduce((s, i) => s + i.price, 0);

  return (
    <AppShell showNav={true}>
      <div className="grid md:grid-cols-2 gap-10 text-white">

        {/* LEFT */}
        <div className="space-y-6">
          <h1>POS</h1>

          {/* TABLES */}
          <div className="grid grid-cols-3 gap-2">
            {tables.map((t) => (
              <button
                key={t}
                onClick={() => setTable(t)}
                className={`py-2 rounded ${
                  table === t ? "bg-orange-500" : "bg-white/10"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* CATEGORY */}
          <div className="flex gap-2">
            {Object.keys(menu).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 ${
                  activeCategory === cat ? "bg-orange-500" : "bg-white/10"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* MENU */}
          {menu[activeCategory].map((item, i) => (
            <div
              key={i}
              onClick={() => addItem(item)}
              className="p-3 bg-white/5 rounded cursor-pointer"
            >
              {item.name} - {item.price}
              <div className="text-xs text-white/40">
                {item.course}
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT */}
        <div className="bg-white/5 p-6 rounded space-y-4">

          <h2>Table {table}</h2>

          {/* 🔥 EXISTING (live sync incl. cancel) */}
          {existingItems.map((i) => (
            <div key={i.id} className="text-sm text-white/60">
              {i.name}
            </div>
          ))}

          {/* NEW */}
          {orderItems.map((i) => (
            <div key={i.id}>
              {i.name}
            </div>
          ))}

          <div>Total: {total}</div>

          <div className="flex gap-2">
            <button
              onClick={() => sendOrder("hold")}
              className="w-full bg-yellow-500 py-2 rounded text-black"
            >
              HOLD
            </button>

            <button
              onClick={() => sendOrder("fire")}
              className="w-full bg-green-500 py-2 rounded text-black"
            >
              FIRE
            </button>
          </div>

          <button
            onClick={fireHeld}
            className="w-full bg-blue-500 py-2 rounded text-black"
          >
            FIRE HELD
          </button>

        </div>

      </div>
    </AppShell>
  );
}