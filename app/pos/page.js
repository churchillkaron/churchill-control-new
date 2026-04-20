"use client";

import { runAIActions } from "../../lib/aiActions";
import { getControlFlag } from "../../lib/aiControl";
import { isKitchenDelayed } from "../../lib/kitchenControl";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [table, setTable] = useState("T1");
  const [activeCategory, setActiveCategory] = useState("starter");

  const [blockFire, setBlockFire] = useState(false);
  const [kitchenDelay, setKitchenDelay] = useState(false);

  const tables = ["T1", "T2", "T3", "T4", "T5", "T6"];

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
      const stored = JSON.parse(localStorage.getItem("orders") || "[]");
      const tableOrders = stored.filter((o) => o.table === table);
      const items = tableOrders.flatMap((o) => o.items || []);
      setExistingItems(items);

      setBlockFire(getControlFlag("block_fire"));
      setKitchenDelay(isKitchenDelayed());
    };

    load();
    const interval = setInterval(load, 1000);
    return () => clearInterval(interval);
  }, [table]);

  const addItem = (item) => {
    setOrderItems((prev) => [
      ...prev,
      { ...item, id: Date.now() + Math.random() },
    ]);
  };

  const sendOrder = async (mode) => {
    if (orderItems.length === 0) return;

    if (mode === "fire" && (blockFire || kitchenDelay)) {
      alert("AI blocked order. Kitchen overloaded.");
      return;
    }

    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const newOrder = {
      id: Date.now(),
      table,
      items: orderItems,
      total: orderItems.reduce((s, i) => s + i.price, 0),
      status: mode === "fire" ? "kitchen" : "hold",
      created_at: new Date().toISOString(),
    };

    stored.push(newOrder);
    localStorage.setItem("orders", JSON.stringify(stored));

    await runAIActions();

    setOrderItems([]);
  };

  const total =
    existingItems.reduce((s, i) => s + i.price, 0) +
    orderItems.reduce((s, i) => s + i.price, 0);

  return (
    <AppShell showNav={true}>
      <div className="text-white space-y-4">

        <h1>POS</h1>

        {kitchenDelay && (
          <div className="text-red-500">
            ⚠ Kitchen delay active (AI control)
          </div>
        )}

        {menu[activeCategory].map((item, i) => (
          <div key={i} onClick={() => addItem(item)}>
            {item.name} - {item.price}
          </div>
        ))}

        <div>Total: {total}</div>

        <button onClick={() => sendOrder("hold")}>HOLD</button>

        <button
          onClick={() => sendOrder("fire")}
          style={{ opacity: blockFire ? 0.5 : 1 }}
        >
          FIRE
        </button>

      </div>
    </AppShell>
  );
}