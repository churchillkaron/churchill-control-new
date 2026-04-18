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

// 🔥 KEEP YOUR REAL MENU HERE (unchanged structure)
const menu = {
  Starter: [
    { name: "Beef Carpaccio", price: 320, station: "WESTERN" },
    { name: "Chili & Garlic Prawns", price: 320, station: "WESTERN" },
  ],
  "Main Course": [
    { name: "Ribeye Steak", price: 890, station: "WESTERN", needsModifiers: true },
    { name: "Beef Tenderloin", price: 920, station: "WESTERN", needsModifiers: true },
    { name: "Salmon", price: 690, station: "WESTERN" },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 160, station: "THAI" },
    { name: "Green Curry", price: 170, station: "THAI" },
  ],
  Beer: [
    { name: "Chang Beer", price: 90, station: "BAR" },
  ],
};

const donenessOptions = ["Rare", "Medium Rare", "Medium", "Well Done"];
const sideOptions = ["Fries", "Salad", "Mashed Potato"];
const sauceOptions = ["Pepper", "Mushroom", "BBQ"];

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState("Starter");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState("");

  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedModifier, setSelectedModifier] = useState("");
  const [selectedSide, setSelectedSide] = useState("");
  const [selectedSauce, setSelectedSauce] = useState("");

  const currentMenu = menu[activeCategory] || [];

  // 🔥 ADD SIMPLE ITEM
  const addSimpleItem = (item) => {
    setCart((prev) => [...prev, { ...item, qty: 1 }]);
  };

  // 🔥 ADD MODIFIED ITEM
  const addConfiguredItem = () => {
    const newItem = {
      name: selectedItem.name,
      price: selectedItem.price,
      station: selectedItem.station,
      qty: 1,
      modifier: selectedModifier,
      side: selectedSide,
      sauce: selectedSauce,
    };

    setCart((prev) => [...prev, newItem]);

    setSelectedItem(null);
    setSelectedModifier("");
    setSelectedSide("");
    setSelectedSauce("");
  };

  const handleClick = (item) => {
    if (item.needsModifiers) {
      setSelectedItem(item);
    } else {
      addSimpleItem(item);
    }
  };

  const increaseQty = (index) => {
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, qty: item.qty + 1 } : item
      )
    );
  };

  const decreaseQty = (index) => {
    setCart((prev) =>
      prev
        .map((item, i) =>
          i === index ? { ...item, qty: item.qty - 1 } : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  // 🔥 FIXED SEND ORDER (SPLIT BY STATION)
  const sendOrder = () => {
    if (!table || cart.length === 0) {
      alert("Select table and add items");
      return;
    }

    const staff = localStorage.getItem("staffName") || "Unknown";
    const existing = JSON.parse(localStorage.getItem("orders") || "[]");

    const grouped = {};

    cart.forEach((item) => {
      const station = item.station || "WESTERN";

      if (!grouped[station]) {
        grouped[station] = [];
      }

      grouped[station].push({
        name: item.name,
        qty: item.qty,
        station,
        modifier: item.modifier || "",
        side: item.side || "",
        sauce: item.sauce || "",
      });
    });

    const newOrders = Object.keys(grouped).map((station) => ({
      id: Date.now() + Math.random(),
      table,
      staff,
      station,
      status: "NEW",
      created_at: new Date().toISOString(),
      items: grouped[station],
    }));

    localStorage.setItem("orders", JSON.stringify([...existing, ...newOrders]));

    setCart([]);
    alert("Order sent");
  };

  return (
    <AppShell>
      <div className="space-y-6">

        <h1 className="text-3xl md:text-5xl font-semibold">
          POS System
        </h1>

        {/* TABLE */}
        <input
          placeholder="Table (T1)"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="px-4 py-3 rounded-xl bg-white/10 border border-white/10 w-full max-w-xs"
        />

        {/* CATEGORIES */}
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-xl ${
                activeCategory === cat
                  ? "bg-[#ff7a00] text-black"
                  : "bg-white/10 text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_400px] gap-6 items-start">

          {/* MENU */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {currentMenu.map((item) => (
              <button
                key={item.name}
                onClick={() => handleClick(item)}
                className="p-4 rounded-2xl bg-white/10 border border-white/10 text-left hover:bg-white/15"
              >
                <div className="font-medium">{item.name}</div>
                <div className="text-white/60 text-sm mt-1">
                  THB {item.price}
                </div>
              </button>
            ))}
          </div>

          {/* CART */}
          <div className="bg-white/5 border border-white/10 p-5 rounded-2xl h-[560px] flex flex-col">

            <div className="flex-1 overflow-y-auto space-y-3">
              {cart.map((item, index) => (
                <div key={index} className="border-b border-white/10 pb-2">

                  <div>{item.name}</div>

                  <div className="text-sm text-white/50">
                    {item.modifier && `• ${item.modifier} `}
                    {item.side && `• ${item.side} `}
                    {item.sauce && `• ${item.sauce}`}
                  </div>

                  <div className="flex gap-2 mt-1">
                    <button onClick={() => decreaseQty(index)}>-</button>
                    <span>{item.qty}</span>
                    <button onClick={() => increaseQty(index)}>+</button>
                  </div>

                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10">
              Total: THB {total}

              <button
                onClick={sendOrder}
                className="w-full bg-[#ff7a00] mt-3 py-3 rounded-xl text-black font-semibold"
              >
                Send Order
              </button>
            </div>

          </div>

        </div>

        {/* MODAL */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">

            <div className="bg-black p-6 rounded-2xl space-y-4 w-[300px]">

              <h2>{selectedItem.name}</h2>

              {donenessOptions.map((d) => (
                <button key={d} onClick={() => setSelectedModifier(d)}>
                  {d}
                </button>
              ))}

              {sideOptions.map((s) => (
                <button key={s} onClick={() => setSelectedSide(s)}>
                  {s}
                </button>
              ))}

              {sauceOptions.map((s) => (
                <button key={s} onClick={() => setSelectedSauce(s)}>
                  {s}
                </button>
              ))}

              <button onClick={addConfiguredItem} className="bg-orange-500 w-full py-2">
                Add
              </button>

              <button onClick={() => setSelectedItem(null)}>
                Cancel
              </button>

            </div>

          </div>
        )}

      </div>
    </AppShell>
  );
}