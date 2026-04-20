"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [sending, setSending] = useState(false);
  const [activeCategory, setActiveCategory] = useState("starter");
  const [table, setTable] = useState("T1");

  const tables = ["T1", "T2", "T3", "T4", "T5", "T6"];

  const menu = {
    starter: [
      { name: "Beef Carpaccio", price: 320, station: "WESTERN" },
      { name: "Signature Bruschetta", price: 280, station: "WESTERN" },
      { name: "Mango & Tomato Salad", price: 220, station: "WESTERN" },
      { name: "Tom Yum Goong", price: 180, station: "THAI" },
    ],
    main: [
      { name: "Chili & Garlic Prawns", price: 320, station: "THAI" },
      { name: "Seared Scallops", price: 520, station: "WESTERN" },
    ],
  };

  // 🔥 LOAD EXISTING TABLE DATA
  useEffect(() => {
    const load = () => {
      const stored = JSON.parse(localStorage.getItem("orders") || "[]");

      const tableOrder = stored.find(
        (o) => o.table === table && o.status !== "closed"
      );

      setExistingItems(tableOrder ? tableOrder.items : []);
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

  const newTotal = orderItems.reduce((sum, i) => sum + i.price, 0);
  const existingTotal = existingItems.reduce((sum, i) => sum + i.price, 0);
  const total = newTotal + existingTotal;

  const sendOrder = () => {
    if (orderItems.length === 0) return;

    setSending(true);

    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    let tableOrder = stored.find(
      (o) => o.table === table && o.status !== "closed"
    );

    if (tableOrder) {
      tableOrder.items = [...tableOrder.items, ...orderItems];
      tableOrder.total += newTotal;
    } else {
      tableOrder = {
        id: Date.now(),
        table,
        items: orderItems,
        total: newTotal,
        status: "kitchen",
        created_at: new Date().toISOString(),
      };
      stored.push(tableOrder);
    }

    localStorage.setItem("orders", JSON.stringify(stored));

    setOrderItems([]);
    setSending(false);
  };

  return (
    <AppShell showNav={true}>
      <div className="grid md:grid-cols-2 gap-10 text-white">

        {/* LEFT */}
        <div className="space-y-6">
          <h1 className="text-2xl">POS</h1>

          {/* TABLES */}
          <div className="grid grid-cols-3 gap-2">
            {tables.map((t) => (
              <button
                key={t}
                onClick={() => setTable(t)}
                className={`py-2 rounded-xl ${
                  table === t
                    ? "bg-[#ff7a00]"
                    : "bg-white/10"
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
                className={`px-4 py-2 rounded-xl ${
                  activeCategory === cat
                    ? "bg-[#ff7a00]"
                    : "bg-white/10"
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
              className="bg-white/5 border border-white/10 p-4 rounded-xl cursor-pointer"
            >
              <div>{item.name}</div>
              <div className="text-sm text-white/50">{item.price} THB</div>
            </div>
          ))}
        </div>

        {/* RIGHT */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <h2 className="text-xl">Table {table}</h2>

          {/* 🔥 EXISTING ITEMS */}
          {existingItems.map((item) => (
            <div key={item.id} className="flex justify-between text-sm text-white/60">
              <span>{item.name}</span>
              <span>{item.price}</span>
            </div>
          ))}

          {/* 🔥 NEW ITEMS */}
          {orderItems.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.name}</span>
              <span>{item.price}</span>
            </div>
          ))}

          {existingItems.length === 0 && orderItems.length === 0 && (
            <div className="text-white/40 text-sm">No items</div>
          )}

          <div className="border-t border-white/10 pt-4 flex justify-between">
            <span>Total</span>
            <span>{total} THB</span>
          </div>

          <button
            onClick={sendOrder}
            disabled={sending}
            className="w-full bg-[#ff7a00] py-3 rounded-xl"
          >
            {sending ? "Sending..." : "Send Order"}
          </button>

        </div>

      </div>
    </AppShell>
  );
}