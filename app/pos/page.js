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

// 🔥 IMPORTANT: EVERY ITEM HAS STATION
const menu = {
  Starter: [
    { name: "Beef Carpaccio", price: 320, station: "WESTERN" },
    { name: "Tom Yum Goong", price: 180, station: "THAI" },
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

  // 🔥 CLICK MENU ITEM
  const handleClick = (item) => {
    if (item.needsModifiers) {
      setSelectedItem(item);
    } else {
      addSimpleItem(item);
    }
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  // 🔥 SEND ORDER (FIXED)
  const sendOrder = () => {
    if (!table || cart.length === 0) {
      alert("Select table and add items");
      return;
    }

    const staff = localStorage.getItem("staffName") || "Unknown";
    const existing = JSON.parse(localStorage.getItem("orders") || "[]");

    const newOrder = {
      id: Date.now(),
      table,
      staff,
      created_at: new Date().toISOString(),
      status: "NEW",
      items: cart.map((item) => ({
        name: item.name,
        qty: item.qty,
        station: item.station, // 🔥 CRITICAL
        modifier: item.modifier || "",
        side: item.side || "",
        sauce: item.sauce || "",
      })),
    };

    localStorage.setItem("orders", JSON.stringify([...existing, newOrder]));

    setCart([]);
    alert("Order sent");
  };

  return (
    <AppShell>
      <div className="space-y-6">

        <h1 className="text-3xl font-semibold">POS System</h1>

        {/* TABLE */}
        <input
          placeholder="Table (T1)"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="px-4 py-2 bg-white/10 rounded"
        />

        {/* CATEGORIES */}
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

        {/* LAYOUT */}
        <div className="grid grid-cols-[2fr_400px] gap-6">

          {/* MENU */}
          <div className="grid grid-cols-2 gap-4">
            {currentMenu.map((item) => (
              <button
                key={item.name}
                onClick={() => handleClick(item)}
                className="p-4 bg-white/10 rounded text-left"
              >
                {item.name}
                <div className="text-sm text-white/60">{item.price} THB</div>
              </button>
            ))}
          </div>

          {/* CART */}
          <div className="bg-white/5 p-4 rounded h-[500px] flex flex-col">

            <div className="flex-1 overflow-y-auto">
              {cart.map((item, i) => (
                <div key={i} className="border-b pb-2">
                  {item.qty}x {item.name}
                  {item.modifier && ` (${item.modifier})`}
                  {item.side && ` + ${item.side}`}
                  {item.sauce && ` + ${item.sauce}`}
                </div>
              ))}
            </div>

            <div className="pt-3 border-t">
              <div>Total: {total} THB</div>

              <button
                onClick={sendOrder}
                className="w-full bg-orange-500 mt-2 py-2 rounded"
              >
                Send Order
              </button>
            </div>

          </div>

        </div>

        {/* MODAL */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center">

            <div className="bg-black p-6 rounded space-y-3 w-[300px]">

              <h2>{selectedItem.name}</h2>

              {donenessOptions.map((m) => (
                <button key={m} onClick={() => setSelectedModifier(m)}>
                  {m}
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

              <button
                onClick={addConfiguredItem}
                className="bg-orange-500 w-full py-2"
              >
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