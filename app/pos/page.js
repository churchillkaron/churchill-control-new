"use client";

import { useState } from "react";
import AppShell from "../AppShell";

const categories = [
  "Starter",
  "Main Course",
  "Dessert",
  "Thai Food",
  "Beer",
  "Soft Drink",
  "Wine",
  "Cocktails",
  "Spirit",
];

const menu = {
  Starter: [
    { name: "Beef Carpaccio", price: 320, station: "WESTERN", category: "Starter" },
    { name: "Chili & Garlic Prawns", price: 320, station: "WESTERN", category: "Starter" },
    { name: "Signature Bruschetta", price: 280, station: "WESTERN", category: "Starter" },
    { name: "Seared Scallops", price: 520, station: "WESTERN", category: "Starter" },
    { name: "Mango & Tomato Salad", price: 220, station: "WESTERN", category: "Starter" },
    { name: "Tom Yum Goong", price: 180, station: "THAI", category: "Starter" },
    { name: "Tom Kha Gai", price: 170, station: "THAI", category: "Starter" },
  ],
  "Main Course": [
    { name: "Churchill Beef Short Ribs", price: 890, station: "WESTERN", category: "Main" },
    { name: "Ribeye Steak", price: 890, station: "WESTERN", category: "Main" },
    { name: "Beef Tenderloin", price: 920, station: "WESTERN", category: "Main" },
    { name: "Pork Tenderloin", price: 460, station: "WESTERN", category: "Main" },
    { name: "Salmon", price: 690, station: "WESTERN", category: "Main" },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 160, station: "THAI", category: "Main" },
    { name: "Pad Ka Prow", price: 150, station: "THAI", category: "Main" },
  ],
  Dessert: [
    { name: "Chocolate Lava Cake", price: 220, station: "DESSERT", category: "Dessert" },
  ],
};

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState("Starter");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState("");

  const currentMenu = menu[activeCategory] || [];

  // addItem → add to cart with HOLD logic
  const addItem = (item) => {
    setCart((prev) => [
      ...prev,
      {
        ...item,
        qty: 1,
        hold: item.category !== "Starter", // 🔥 HOLD mains/dessert
      },
    ]);
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  // sendOrder → sends order with HOLD info
  const sendOrder = () => {
    if (!table || cart.length === 0) return;

    const existing = JSON.parse(localStorage.getItem("orders") || "[]");

    const newOrder = {
      id: Date.now(),
      table,
      status: "ACTIVE",
      total,
      created_at: new Date().toISOString(),

      items: cart.map((item, i) => ({
        id: Date.now() + i,
        name: item.name,
        price: item.price,
        qty: item.qty,
        station: item.station,
        category: item.category,
        hold: item.hold, // 🔥 IMPORTANT
        status: "NEW",
      })),
    };

    localStorage.setItem("orders", JSON.stringify([...existing, newOrder]));
    setCart([]);
  };

  return (
    <AppShell>
      <div className="space-y-6">

        <h1 className="text-3xl font-semibold">POS</h1>

        <input
          placeholder="Table"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="px-4 py-2 bg-white/10 rounded-xl"
        />

        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-3 py-1 bg-white/10 rounded-xl"
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {currentMenu.map((item) => (
            <button
              key={item.name}
              onClick={() => addItem(item)}
              className="p-4 bg-white/10 rounded-xl"
            >
              {item.name} - {item.price}
            </button>
          ))}
        </div>

        <div className="bg-white/5 p-4 rounded-xl">
          <h2>Cart</h2>

          {cart.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>
                {item.name} x{item.qty}
                {item.hold && <span className="ml-2 text-orange-400">(HOLD)</span>}
              </span>
              <span>{item.price}</span>
            </div>
          ))}

          <div className="mt-3 font-semibold">Total: {total}</div>

          <button
            onClick={sendOrder}
            className="mt-3 w-full bg-[#ff7a00] py-2 rounded-xl text-black"
          >
            Send Order
          </button>
        </div>

      </div>
    </AppShell>
  );
}