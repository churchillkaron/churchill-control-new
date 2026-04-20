"use client";

import { useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [sending, setSending] = useState(false);

  const menu = [
    { name: "Beef Carpaccio", price: 320 },
    { name: "Chili & Garlic Prawns", price: 320 },
    { name: "Signature Bruschetta", price: 280 },
    { name: "Seared Scallops", price: 520 },
    { name: "Mango & Tomato Salad", price: 220 },
    { name: "Tom Yum Goong", price: 180 },
  ];

  const addItem = (item) => {
    setOrderItems([...orderItems, item]);
  };

  const total = orderItems.reduce((sum, i) => sum + i.price, 0);

  // 🔥 SEND ORDER TO SYSTEM
  const sendOrder = async () => {
    if (orderItems.length === 0) return;

    setSending(true);

    await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        table: "T1",
        staff: "FOH",
        items: orderItems,
      }),
    });

    setOrderItems([]);
    setSending(false);
  };

  return (
    <AppShell>
      <div className="grid md:grid-cols-2 gap-10 text-white">

        {/* MENU */}
        <div className="space-y-4">
          <h1 className="text-2xl">POS</h1>

          {menu.map((item, i) => (
            <div
              key={i}
              onClick={() => addItem(item)}
              className="bg-white/5 border border-white/10 p-4 rounded-xl cursor-pointer hover:bg-white/10"
            >
              <div>{item.name}</div>
              <div className="text-sm text-white/50">{item.price} THB</div>
            </div>
          ))}
        </div>

        {/* ORDER */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="text-xl">Order</h2>

          {orderItems.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
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
        </div>

      </div>
    </AppShell>
  );
}