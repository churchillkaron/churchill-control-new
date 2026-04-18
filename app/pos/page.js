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
    { name: "Spring Rolls", price: 120 },
    { name: "Garlic Bread", price: 100 },
  ],
  "Main Course": [
    { name: "Steak", price: 450 },
    { name: "Pasta", price: 280 },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 180 },
  ],
};

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState("Starter");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState("");

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.name === item.name);

      if (existing) {
        return prev.map((i) =>
          i.name === item.name ? { ...i, qty: i.qty + 1 } : i
        );
      }

      return [...prev, { ...item, qty: 1 }];
    });
  };

  const removeFromCart = (name) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.name === name
            ? { ...item, qty: item.qty - 1 }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  const currentMenu = menu[activeCategory] || [];

  return (
    <AppShell>
      <div className="space-y-6">

        <h1 className="text-3xl font-semibold">POS System</h1>

        {/* TABLE */}
        <input
          placeholder="Table (e.g. T1)"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="px-4 py-2 rounded bg-white/10"
        />

        {/* CATEGORIES */}
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded ${
                activeCategory === cat
                  ? "bg-[#ff7a00] text-black"
                  : "bg-white/10"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 🔥 FIXED LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_400px] gap-6 items-start">

          {/* MENU (LEFT) */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

            {currentMenu.length === 0 && (
              <div className="text-white/40">
                No items yet
              </div>
            )}

            {currentMenu.map((item) => (
              <button
                key={item.name}
                onClick={() => addToCart(item)}
                className="p-4 rounded-xl bg-white/10 text-left"
              >
                <div>{item.name}</div>
                <div className="text-white/60 text-sm">
                  THB {item.price}
                </div>
              </button>
            ))}

          </div>

          {/* 🔥 CART (RIGHT - FIXED + SCROLL) */}
          <div className="bg-white/5 p-4 rounded-xl h-[500px] flex flex-col">

            <h2 className="mb-3">Cart</h2>

            {/* SCROLL AREA */}
            <div className="flex-1 overflow-y-auto space-y-2">

              {cart.map((item) => (
                <div key={item.name} className="flex justify-between">
                  <span>
                    {item.name} x{item.qty}
                  </span>

                  <div className="flex gap-2">
                    <button onClick={() => removeFromCart(item.name)}>-</button>
                    <button onClick={() => addToCart(item)}>+</button>
                  </div>
                </div>
              ))}

            </div>

            {/* FIXED FOOTER */}
            <div className="mt-4 border-t border-white/10 pt-3">

              <div className="font-semibold mb-3">
                Total: THB {total}
              </div>

              <button className="w-full bg-[#ff7a00] py-2 rounded text-black">
                Send Order
              </button>

            </div>

          </div>

        </div>

      </div>
    </AppShell>
  );
}