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

// 🔥 YOUR REAL MENU (from Excel — unchanged)
const menu = {
  Starter: [
    { name: "Beef Carpaccio", price: 320 },
    { name: "Chili & Garlic Prawns", price: 320 },
    { name: "Signature Bruschetta", price: 280 },
    { name: "Seared Scallops", price: 520 },
    { name: "Mango & Tomato Salad", price: 220 },
    { name: "Tom Yum Goong", price: 180 },
    { name: "Tom Kha Gai", price: 170 },
    { name: "Potato Gratin", price: 120 },
    { name: "Crispy Potato Wedges", price: 100 },
    { name: "Cauliflower Puree", price: 120 },
  ],
  "Main Course": [
    { name: "Churchill Beef Short Ribs", price: 890 },
    { name: "Ribeye Steak", price: 890 },
    { name: "Beef Tenderloin", price: 920 },
    { name: "Pork Tenderloin", price: 460 },
    { name: "Salmon", price: 690 },
    { name: "Churchill Sambal Half Chicken", price: 590 },
    { name: "Veal Stew", price: 850 },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 160 },
    { name: "Pad Ka Prow", price: 150 },
    { name: "Stir-Fried Chicken with Cashew Nuts", price: 180 },
    { name: "Beef with Oyster Sauce", price: 220 },
    { name: "Massaman Curry", price: 180 },
    { name: "Green Curry", price: 170 },
    { name: "Panang Curry", price: 175 },
    { name: "Pineapple Fried Rice", price: 160 },
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

          {/* MENU */}
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

          {/* 🔥 CART (FIXED HEIGHT + SCROLL) */}
          <div className="bg-white/5 p-4 rounded-xl h-[500px] flex flex-col">

            <h2 className="mb-3">Cart</h2>

            <div className="flex-1 overflow-y-auto space-y-2">

              {cart.map((item) => (
                <div key={item.name} className="flex justify-between items-center">
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