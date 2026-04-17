"use client";

import { useState } from "react";
import AppShell from "../AppShell";

const MENU = [
  { name: "Pad Thai", price: 160 },
  { name: "Green Curry", price: 170 },
  { name: "Massaman Curry", price: 180 },
  { name: "Tom Yum Goong", price: 180 },
  { name: "Beef Carpaccio", price: 320 },
];

export default function POS() {
  const [table, setTable] = useState("");
  const [order, setOrder] = useState([]);

  const addItem = (item) => {
    setOrder([...order, item]);
  };

  const removeItem = (index) => {
    const updated = [...order];
    updated.splice(index, 1);
    setOrder(updated);
  };

  const total = order.reduce((sum, item) => sum + item.price, 0);

  const sendOrder = () => {
    if (!table) {
      alert("Enter table number");
      return;
    }

    if (order.length === 0) {
      alert("Add items first");
      return;
    }

    const existingOrders =
      JSON.parse(localStorage.getItem("orders")) || [];

    const newOrder = {
      id: Date.now(),
      table,
      items: order,
      total,
      status: "Active",
      time: new Date().toISOString(),
    };

    const updatedOrders = [...existingOrders, newOrder];

    localStorage.setItem("orders", JSON.stringify(updatedOrders));

    setOrder([]);
    setTable("");

    alert("Order sent");
  };

  return (
    <AppShell>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

        {/* LEFT SIDE */}
        <div className="space-y-6">

          <input
            placeholder="Table number"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="w-full p-4 rounded-xl bg-black/50 border border-white/10 backdrop-blur-xl"
          />

          <div className="rounded-2xl bg-white/[0.05] border border-white/10 backdrop-blur-xl p-5 space-y-3 min-h-[200px]">

            {order.length === 0 && (
              <div className="text-white/40">No items yet</div>
            )}

            {order.map((item, index) => (
              <div
                key={index}
                className="flex justify-between items-center p-3 rounded-lg bg-black/40"
              >
                <span>{item.name}</span>
                <div className="flex items-center gap-3">
                  <span>THB {item.price}</span>
                  <button
                    onClick={() => removeItem(index)}
                    className="text-red-400"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

          </div>

          <div className="text-2xl font-semibold">
            Total: THB {total}
          </div>

          <button
            onClick={sendOrder}
            className="w-full bg-[#ff7a00] p-4 rounded-xl text-black font-semibold hover:scale-[1.02] transition"
          >
            Send Order
          </button>

        </div>

        {/* RIGHT SIDE */}
        <div className="grid grid-cols-2 gap-5">

          {MENU.map((item, i) => (
            <button
              key={i}
              onClick={() => addItem(item)}
              className="p-6 rounded-xl bg-white/[0.08] border border-white/10 backdrop-blur-xl hover:bg-[#ff7a00]/20 transition text-left"
            >
              <div className="font-semibold text-lg">{item.name}</div>
              <div className="text-sm text-white/60">
                THB {item.price}
              </div>
            </button>
          ))}

        </div>

      </div>
    </AppShell>
  );
}