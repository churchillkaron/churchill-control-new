"use client";

import { runAIActions } from "../../lib/aiActions";
import { getBestItem, getWeakItem } from "../../lib/menuAI";
import { updateMenuStats } from "../../lib/menuMemory";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [selectedTable, setSelectedTable] = useState("T1");
  const [category, setCategory] = useState("starter");

  const [bestItem, setBestItem] = useState(null);
  const [weakItem, setWeakItem] = useState(null);

  const menu = {
    starter: [
      { name: "Beef Carpaccio", price: 320 },
      { name: "Tom Yum Goong", price: 180 },
    ],
    main: [
      { name: "Chili Prawns", price: 320 },
      { name: "Scallops", price: 520 },
    ],
    dessert: [
      { name: "Mango Sticky Rice", price: 180 },
      { name: "Chocolate Cake", price: 220 },
    ],
  };

  useEffect(() => {
    const load = () => {
      setBestItem(getBestItem());
      setWeakItem(getWeakItem());
    };

    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  const addItem = (item) => {
    setOrderItems((prev) => [...prev, item]);
  };

  const total = orderItems.reduce((sum, i) => sum + i.price, 0);

  const sendOrder = async () => {
    if (orderItems.length === 0) return;

    updateMenuStats(orderItems);
    await runAIActions();

    setOrderItems([]);
  };

  return (
    <AppShell>
      <div className="text-white grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* LEFT SIDE */}
        <div className="space-y-6">

          <h1 className="text-2xl">POS</h1>

          {/* TABLES */}
          <div className="grid grid-cols-3 gap-3">
            {["T1", "T2", "T3", "T4", "T5", "T6"].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTable(t)}
                className={`py-2 rounded ${
                  selectedTable === t
                    ? "bg-[#ff7a00] text-black"
                    : "bg-white/10"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* CATEGORY */}
          <div className="flex gap-2">
            {["starter", "main", "dessert"].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1 rounded ${
                  category === c
                    ? "bg-[#ff7a00] text-black"
                    : "bg-white/10"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* MENU */}
          <div className="space-y-2">
            {menu[category].map((item, i) => (
              <div
                key={i}
                onClick={() => addItem(item)}
                className={`p-3 rounded cursor-pointer bg-white/5
                  ${item.name === bestItem ? "bg-green-500/20" : ""}
                  ${item.name === weakItem ? "opacity-40" : ""}
                `}
              >
                {item.name} - {item.price}

                {item.name === bestItem && (
                  <span className="ml-2 text-green-400 text-xs">🔥</span>
                )}

                {item.name === weakItem && (
                  <span className="ml-2 text-red-400 text-xs">⚠</span>
                )}
              </div>
            ))}
          </div>

        </div>

        {/* RIGHT SIDE */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <h2 className="text-lg">Table {selectedTable}</h2>

          {orderItems.map((item, i) => (
            <div key={i} className="text-sm">
              {item.name}
            </div>
          ))}

          <div className="text-lg">Total: {total}</div>

          <button className="w-full bg-purple-500 py-2 rounded">
            REQUEST ADJUSTMENT
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button className="bg-yellow-500 py-2 rounded">HOLD</button>
            <button
              onClick={sendOrder}
              className="bg-green-500 py-2 rounded"
            >
              FIRE
            </button>
          </div>

          <button className="w-full bg-blue-500 py-2 rounded">
            FIRE HELD
          </button>

        </div>

      </div>
    </AppShell>
  );
}