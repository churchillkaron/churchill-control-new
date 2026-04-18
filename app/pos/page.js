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
    {
      name: "Ribeye Steak",
      price: 890,
      modifiers: ["Rare", "Medium Rare", "Medium", "Well Done"],
      sides: ["Fries", "Salad", "Mashed Potato"],
      sauces: ["Pepper", "Mushroom", "BBQ"],
    },
    {
      name: "Beef Tenderloin",
      price: 920,
      modifiers: ["Rare", "Medium Rare", "Medium", "Well Done"],
      sides: ["Fries", "Salad"],
      sauces: ["Pepper", "Red Wine"],
    },
  ],
};

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState("Main Course");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState("");

  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedModifier, setSelectedModifier] = useState("");
  const [selectedSide, setSelectedSide] = useState("");
  const [selectedSauce, setSelectedSauce] = useState("");

  const addToCart = () => {
    const item = {
      ...selectedItem,
      modifier: selectedModifier,
      side: selectedSide,
      sauce: selectedSauce,
      qty: 1,
    };

    setCart((prev) => [...prev, item]);

    setSelectedItem(null);
    setSelectedModifier("");
    setSelectedSide("");
    setSelectedSauce("");
  };

  const total = cart.reduce((sum, item) => sum + item.price, 0);

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
    alert("Order sent");
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
          className="px-4 py-2 bg-black/40 rounded border border-white/10"
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

        {/* 🔥 FIXED LAYOUT */}
        <div className="grid grid-cols-[2fr_400px] gap-6 items-start">

          {/* MENU */}
          <div className="grid grid-cols-2 gap-4">
            {currentMenu.map((item) => (
              <button
                key={item.name}
                onClick={() => setSelectedItem(item)}
                className="p-6 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-xl hover:bg-black/60"
              >
                <div className="text-lg">{item.name}</div>
                <div className="text-white/60">{item.price} THB</div>
              </button>
            ))}
          </div>

          {/* CART (LOCKED HEIGHT) */}
          <div className="bg-black/50 border border-white/10 rounded-2xl p-4 h-[500px] flex flex-col backdrop-blur-xl">

            <div className="flex-1 overflow-y-auto space-y-2">
              {cart.map((item, i) => (
                <div key={i} className="text-sm border-b border-white/10 pb-2">
                  {item.name}
                  {item.modifier && ` (${item.modifier})`}
                  {item.side && ` + ${item.side}`}
                  {item.sauce && ` + ${item.sauce}`}
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-3">
              <div>Total: {total} THB</div>

              <button
                onClick={sendOrder}
                className="w-full bg-[#ff7a00] mt-3 py-2 rounded-xl text-black"
              >
                Send Order
              </button>
            </div>

          </div>

        </div>

        {/* 🔥 MODAL */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center">

            <div className="bg-black p-6 rounded-2xl space-y-4 w-[300px]">

              <h2 className="text-lg">{selectedItem.name}</h2>

              {/* DONENESS */}
              {selectedItem.modifiers && (
                <>
                  <div className="text-sm text-white/60">Doneness</div>
                  {selectedItem.modifiers.map((m) => (
                    <button
                      key={m}
                      onClick={() => setSelectedModifier(m)}
                      className={`w-full p-2 rounded ${
                        selectedModifier === m
                          ? "bg-[#ff7a00] text-black"
                          : "bg-white/10"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </>
              )}

              {/* SIDES */}
              {selectedItem.sides && (
                <>
                  <div className="text-sm text-white/60 mt-2">Side</div>
                  {selectedItem.sides.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSide(s)}
                      className={`w-full p-2 rounded ${
                        selectedSide === s
                          ? "bg-[#ff7a00] text-black"
                          : "bg-white/10"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </>
              )}

              {/* SAUCE */}
              {selectedItem.sauces && (
                <>
                  <div className="text-sm text-white/60 mt-2">Sauce</div>
                  {selectedItem.sauces.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSauce(s)}
                      className={`w-full p-2 rounded ${
                        selectedSauce === s
                          ? "bg-[#ff7a00] text-black"
                          : "bg-white/10"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </>
              )}

              <button
                onClick={addToCart}
                className="bg-[#ff7a00] w-full py-2 rounded-xl text-black mt-4"
              >
                Add to Cart
              </button>

              <button
                onClick={() => setSelectedItem(null)}
                className="text-white/40 w-full"
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