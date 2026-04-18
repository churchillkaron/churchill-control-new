"use client";

import { useState } from "react";
import AppShell from "../AppShell";

const categories = [
  "Starter",
  "Main Course",
  "Thai Food",
  "Beer",
];

const menu = {
  Starter: [
    { name: "Beef Carpaccio", price: 320, station: "WESTERN" },
  ],
  "Main Course": [
    { name: "Ribeye Steak", price: 890, station: "WESTERN", needsModifiers: true },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 160, station: "THAI" },
  ],
  Beer: [
    { name: "Chang Beer", price: 90, station: "BAR" },
  ],
};

const donenessOptions = ["Rare", "Medium Rare", "Medium", "Well Done"];
const sideOptions = ["Fries", "Salad"];
const sauceOptions = ["Pepper", "Mushroom"];

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState("Starter");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState("");

  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedModifier, setSelectedModifier] = useState("");
  const [selectedSide, setSelectedSide] = useState("");
  const [selectedSauce, setSelectedSauce] = useState("");

  const addItem = (item) => {
    if (item.needsModifiers) {
      setSelectedItem(item);
    } else {
      setCart((prev) => [...prev, { ...item, qty: 1 }]);
    }
  };

  const addConfigured = () => {
    setCart((prev) => [
      ...prev,
      {
        name: selectedItem.name,
        price: selectedItem.price,
        station: selectedItem.station,
        qty: 1,
        modifier: selectedModifier,
        side: selectedSide,
        sauce: selectedSauce,
      },
    ]);

    setSelectedItem(null);
  };

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  // 🔥 SPLIT ORDER BY STATION
  const sendOrder = () => {
    if (!table || cart.length === 0) {
      alert("Missing table or items");
      return;
    }

    const existing = JSON.parse(localStorage.getItem("orders") || "[]");

    const grouped = {};

    cart.forEach((item) => {
      if (!grouped[item.station]) {
        grouped[item.station] = [];
      }
      grouped[item.station].push(item);
    });

    const newOrders = Object.keys(grouped).map((station) => ({
      id: Date.now() + Math.random(),
      table,
      station,
      status: "NEW",
      created_at: new Date().toISOString(),
      items: grouped[station],
    }));

    localStorage.setItem("orders", JSON.stringify([...existing, ...newOrders]));

    setCart([]);
    alert("Orders sent to all kitchens");
  };

  const currentMenu = menu[activeCategory] || [];

  return (
    <AppShell>
      <div className="space-y-6">

        <h1 className="text-3xl">POS</h1>

        <input
          placeholder="Table"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="px-4 py-2 bg-white/10 rounded"
        />

        <div className="flex gap-2">
          {categories.map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat)}>
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[2fr_400px] gap-6">

          <div className="grid grid-cols-2 gap-4">
            {currentMenu.map((item) => (
              <button key={item.name} onClick={() => addItem(item)}>
                {item.name} - {item.price}
              </button>
            ))}
          </div>

          <div className="bg-white/10 p-4 rounded h-[500px] flex flex-col">

            <div className="flex-1 overflow-y-auto">
              {cart.map((item, i) => (
                <div key={i}>
                  {item.qty}x {item.name}
                </div>
              ))}
            </div>

            <div>
              Total: {total}
              <button onClick={sendOrder} className="w-full bg-orange-500 mt-2">
                Send Order
              </button>
            </div>

          </div>

        </div>

        {/* MODAL */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
            <div className="bg-black p-4">

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

              <button onClick={addConfigured}>Add</button>

            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}