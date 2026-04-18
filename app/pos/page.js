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

// TEMP MENU (we replace with your Excel next)
const menu = {
  Starter: [
    { name: "Spring Rolls", price: 120 },
    { name: "Garlic Bread", price: 100 },
  ],
  "Main Course": [
    { name: "Steak", price: 450 },
    { name: "Pasta", price: 280 },
  ],
  Dessert: [
    { name: "Ice Cream", price: 120 },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 180 },
  ],
  Beer: [
    { name: "Chang", price: 90 },
  ],
  "Soft Drink": [
    { name: "Coke", price: 50 },
  ],
  Wine: [
    { name: "House Wine", price: 250 },
  ],
  Cocktails: [
    { name: "Mojito", price: 180 },
  ],
  Spirit: [
    { name: "Whiskey", price: 200 },
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
          i.name === item.name
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      }

      return [...prev, { ...item, qty: 1 }];
    });
  };

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  const sendOrder = () => {
    if (!table || cart.length === 0) {
      alert("Select table and add items");
      return;
    }

    console.log("ORDER:", {
      table,
      items: cart,
      total,
    });

    // NEXT STEP: connect to Supabase

    setCart([]);
  };

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

        {/* MENU */}
        <div className="grid md:grid-cols-3 gap-4">
          {menu[activeCategory].map((item) => (
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

        {/* CART */}
        <div className="bg-white/5 p-4 rounded-xl">
          <h2 className="mb-3">Cart</h2>

          {cart.map((item) => (
            <div key={item.name} className="flex justify-between">
              <span>
                {item.name} x{item.qty}
              </span>
              <span>
                THB {item.price * item.qty}
              </span>
            </div>
          ))}

          <div className="mt-4 font-semibold">
            Total: THB {total}
          </div>

          <button
            onClick={sendOrder}
            className="mt-4 w-full bg-[#ff7a00] py-2 rounded text-black"
          >
            Send Order
          </button>
        </div>

      </div>
    </AppShell>
  );
}
