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

  const sendOrder = async () => {
    if (orderItems.length === 0) return;

    updateMenuStats(orderItems);
    await runAIActions();

    setOrderItems([]);
  };

  return (
    <AppShell showNav={true}>
      <div className="text-white space-y-6">

        <h1>POS</h1>

        {Object.values(menu).flat().map((item, i) => (
          <div
            key={i}
            onClick={() => addItem(item)}
            className={`p-3 rounded cursor-pointer
              ${item.name === bestItem ? "bg-green-500/20" : ""}
              ${item.name === weakItem ? "opacity-40" : ""}
            `}
          >
            {item.name} - {item.price}

            {item.name === bestItem && (
              <span className="ml-2 text-green-400 text-xs">🔥 BEST</span>
            )}

            {item.name === weakItem && (
              <span className="ml-2 text-red-400 text-xs">⚠ WEAK</span>
            )}
          </div>
        ))}

        <button onClick={sendOrder}>SEND ORDER</button>

      </div>
    </AppShell>
  );
}