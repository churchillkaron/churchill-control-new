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
  "Main Course": [
    { name: "Ribeye Steak", price: 890, modifiers: ["Rare", "Medium Rare", "Medium", "Well Done"] },
    { name: "Beef Tenderloin", price: 920, modifiers: ["Rare", "Medium Rare", "Medium", "Well Done"] },
  ],
  Starter: [
    { name: "Beef Carpaccio", price: 320 },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 160 },
  ],
};

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState("Main Course");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState("");

  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedModifier, setSelectedModifier] = useState("");

  const addToCart = () => {
    const item = {
      ...selectedItem,
      modifier: selectedModifier,
      qty: 1,
    };

    setCart((prev) => [...prev, item]);

    setSelectedItem(null);
    setSelectedModifier("");
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

    const existing = JSON.parse(localStorage.getItem("orders") || "[]");

    const newOrder = {
      id: Date.now(),
      table,
      items: cart,
      total,
      status: "Active",
    };

    localStorage.setItem("orders", JSON.stringify([...existing, newOrder]));

    setCart([]);
    alert("Order sent to kitchen");
  };

  const currentMenu = menu[activeCategory] || [];

  return (
    <AppShell>
      <div className="space-y-6">

        <h1 className="text-3xl">POS System</h1>

        <input
          placeholder="Table"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="px-4 py-2 bg-white/10 rounded"
        />

        {/* Categories */}
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-3 py-2 bg-white/10 rounded"
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[2fr_400px] gap-6">

          {/* MENU */}
          <div className="grid grid-cols-2 gap-4">
            {currentMenu.map((item) => (
              <button
                key={item.name}
                onClick={() => setSelectedItem(item)}
                className="p-4 bg-white/10 rounded"
              >
                {item.name} - {item.price}
              </button>
            ))}
          </div>

          {/* CART */}
          <div className="bg-white/5 p-4 rounded h-[500px] flex flex-col">

            <div className="flex-1 overflow-y-auto">
              {cart.map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span>
                    {item.name}
                    {item.modifier && ` (${item.modifier})`}
                  </span>
                  <span>{item.price}</span>
                </div>
              ))}
            </div>

            <div className="border-t pt-3">
              Total: {total}
              <button
                onClick={sendOrder}
                className="w-full bg-orange-500 mt-2 py-2 rounded"
              >
                Send Order
              </button>
            </div>

          </div>

        </div>

        {/* 🔥 MODIFIER POPUP */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center">

            <div className="bg-black p-6 rounded space-y-4">

              <h2>{selectedItem.name}</h2>

              {selectedItem.modifiers?.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedModifier(m)}
                  className={`block w-full ${
                    selectedModifier === m ? "bg-orange-500" : "bg-white/10"
                  } p-2 rounded`}
                >
                  {m}
                </button>
              ))}

              <button
                onClick={addToCart}
                className="bg-orange-500 w-full py-2 rounded"
              >
                Add to Cart
              </button>

              <button
                onClick={() => setSelectedItem(null)}
                className="text-white/50"
              >
                Cancel
              </button>

            </div>

          </div>
        )}

      </div>
    </AppShell>
  );
}