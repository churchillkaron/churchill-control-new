"use client";
import { runAIActions } from "../../lib/aiActions";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [table, setTable] = useState("T1");
  const [activeCategory, setActiveCategory] = useState("starter");

  // 🔥 ONLY REQUESTS NOW
  const [adjustRequests, setAdjustRequests] = useState([]);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustType, setAdjustType] = useState("discount");
  const [adjustMode, setAdjustMode] = useState("percent");
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

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

  const getCurrentUser = () => {
    return localStorage.getItem("currentUser") || "unknown";
  };

  useEffect(() => {
    const load = () => {
      const stored = JSON.parse(localStorage.getItem("orders") || "[]");
      const tableOrders = stored.filter((o) => o.table === table);
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

      // 🔥 SEND ONLY REQUESTS
      adjustmentRequests: adjustRequests,

      total: orderItems.reduce((s, i) => s + i.price, 0),
      status: mode === "fire" ? "kitchen" : "hold",
      created_at: new Date().toISOString(),
    };

    stored.push(newOrder);
    localStorage.setItem("orders", JSON.stringify(stored));

    setOrderItems([]);
    setAdjustRequests([]);
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

  // 🔥 PURE DISPLAY TOTAL (NO DISCOUNTS)
  const total =
    existingItems.reduce((s, i) => s + i.price, 0) +
    orderItems.reduce((s, i) => s + i.price, 0);

  // 🔥 REQUEST ONLY
  const requestAdjustment = () => {
    if (!adjustValue) return;

    setAdjustRequests((prev) => [
      ...prev,
      {
        id: Date.now(),
        type: adjustType,
        mode: adjustMode,
        value: Number(adjustValue),
        reason: adjustReason,
        requestedBy: getCurrentUser(),
        status: "pending",
        created_at: new Date().toISOString(),
      },
    ]);

    setAdjustValue("");
    setAdjustReason("");
    setShowAdjust(false);
  };

  return (
    <AppShell showNav={true}>
      <div className="grid md:grid-cols-2 gap-10 text-white">

        {/* LEFT */}
        <div className="space-y-6">
          <h1>POS</h1>

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

          {menu[activeCategory].map((item, i) => (
            <div
              key={i}
              onClick={() => addItem(item)}
              className="p-3 bg-white/5 rounded cursor-pointer"
            >
              {item.name} - {item.price}
            </div>
          ))}
        </div>

        {/* RIGHT */}
        <div className="bg-white/5 p-6 rounded space-y-4">

          <h2>Table {table}</h2>

          {existingItems.map((i) => (
            <div key={i.id} className="text-sm text-white/60">
              {i.name}
            </div>
          ))}

          {orderItems.map((i) => (
            <div key={i.id}>{i.name}</div>
          ))}

          {/* 🔥 REQUEST DISPLAY */}
          {adjustRequests.map((a) => (
            <div key={a.id} className="text-yellow-400 text-sm">
              REQUEST: {a.type} {a.value} ({a.reason})
            </div>
          ))}

          <div className="text-xl">Total: {total}</div>

          <button
            onClick={() => setShowAdjust(true)}
            className="w-full bg-purple-500 py-2 rounded"
          >
            REQUEST ADJUSTMENT
          </button>

          {showAdjust && (
            <div className="space-y-2 bg-black/40 p-3 rounded">
              <select onChange={(e) => setAdjustType(e.target.value)}>
                <option value="discount">Discount</option>
                <option value="comp">Comp</option>
              </select>

              <select onChange={(e) => setAdjustMode(e.target.value)}>
                <option value="percent">%</option>
                <option value="fixed">THB</option>
              </select>

              <input
                placeholder="Value"
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
                className="w-full text-black px-2"
              />

              <input
                placeholder="Reason"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full text-black px-2"
              />

              <button
                onClick={requestAdjustment}
                className="w-full bg-yellow-500 py-1"
              >
                SEND REQUEST
              </button>
            </div>
          )}

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