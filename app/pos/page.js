"use client";

import { runAIActions } from "../../lib/aiActions";
import { getBestItem, getWeakItem } from "../../lib/menuAI";
import { updateMenuStats } from "../../lib/menuMemory";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
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
    setOrderItems((prev) => [
      ...prev,
      { ...item, id: Date.now() + Math.random() },
    ]);
  };

  const removeItem = (id) => {
    setOrderItems((prev) => prev.filter((i) => i.id !== id));
  };

  const sendOrder = async () => {
    if (orderItems.length === 0) return;

    updateMenuStats(orderItems);
    await runAIActions();

    setOrderItems([]);
  };

  const total = orderItems.reduce((sum, i) => sum + i.price, 0);

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* LEFT - MENU */}
        <div className="space-y-6">

          <h1 className="text-3xl font-semibold">POS</h1>

          {Object.entries(menu).map(([category, items]) => (
            <div key={category}>

              <h2 className="text-lg text-white/60 mb-2 capitalize">
                {category}
              </h2>

              <div className="grid grid-cols-2 gap-3">

                {items.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => addItem(item)}
                    className={`p-4 rounded-xl cursor-pointer border border-white/10 transition
                      ${item.name === bestItem ? "bg-green-500/20" : "bg-white/5"}
                      ${item.name === weakItem ? "opacity-40" : ""}
                      hover:bg-white/10
                    `}
                  >
                    <div className="text-sm">{item.name}</div>
                    <div className="text-white/60 text-sm">
                      {item.price} THB
                    </div>

                    {item.name === bestItem && (
                      <div className="text-green-400 text-xs mt-1">🔥 BEST</div>
                    )}

                    {item.name === weakItem && (
                      <div className="text-red-400 text-xs mt-1">⚠ WEAK</div>
                    )}
                  </div>
                ))}

              </div>

            </div>
          ))}

        </div>

        {/* RIGHT - ORDER */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col">

          <h2 className="text-xl mb-4">Current Order</h2>

          <div className="flex-1 space-y-2 overflow-y-auto">

            {orderItems.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center bg-black/30 p-3 rounded-lg"
              >
                <div>
                  <div className="text-sm">{item.name}</div>
                  <div className="text-xs text-white/40">
                    {item.price} THB
                  </div>
                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  className="text-xs text-red-400"
                >
                  remove
                </button>
              </div>
            ))}

            {orderItems.length === 0 && (
              <div className="text-white/40 text-sm">
                No items yet
              </div>
            )}

          </div>

          {/* TOTAL */}
          <div className="mt-6 border-t border-white/10 pt-4">

            <div className="flex justify-between text-lg">
              <span>Total</span>
              <span>{total.toLocaleString()} THB</span>
            </div>

            <button
              onClick={sendOrder}
              className="mt-4 w-full bg-[#ff7a00] text-black py-3 rounded-xl font-medium"
            >
              Send Order
            </button>

          </div>

        </div>

      </div>
    </AppShell>
  );
}