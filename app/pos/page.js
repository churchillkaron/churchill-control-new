"use client";

import { useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [sending, setSending] = useState(false);
  const [activeCategory, setActiveCategory] = useState("starter");
  const [table, setTable] = useState("T1");
  const [success, setSuccess] = useState(false);

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

  const total = orderItems.reduce((sum, i) => sum + i.price, 0);

  const sendOrder = () => {
    if (orderItems.length === 0) return;

    setSending(true);

    const existingOrders = JSON.parse(localStorage.getItem("orders") || "[]");

    // 🔥 FIND EXISTING TABLE
    let tableOrder = existingOrders.find(
      (o) => o.table === table && o.status !== "closed"
    );

    if (tableOrder) {
      // 🔥 APPEND ITEMS TO EXISTING TABLE
      tableOrder.items = [...tableOrder.items, ...orderItems];
      tableOrder.total += total;
    } else {
      // 🔥 CREATE NEW TABLE ORDER
      tableOrder = {
        id: Date.now(),
        table,
        items: orderItems,
        total,
        status: "kitchen",
        created_at: new Date().toISOString(),
      };
      existingOrders.push(tableOrder);
    }

    localStorage.setItem("orders", JSON.stringify(existingOrders));

    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);

    setOrderItems([]);
    setSending(false);
  };

  return (
    <AppShell>
      <div className="grid md:grid-cols-2 gap-10 text-white">

        {/* LEFT */}
        <div className="space-y-6">
          <h1 className="text-2xl">POS</h1>

          {/* 🔥 TABLE SELECTOR */}
          <input
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="bg-white/10 p-2 rounded-xl"
            placeholder="Table (e.g. T1)"
          />

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
          <h2 className="text-xl">Order</h2>

          {orderItems.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.name}</span>
              <span>{item.price} THB</span>
            </div>
          ))}

          {orderItems.length === 0 && (
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

          {success && (
            <div className="text-green-400 text-center text-sm">
              Added to table {table} ✅
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}