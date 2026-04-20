"use client";

import { runAIActions } from "../../lib/aiActions";
import { updateMenuStats } from "../../lib/menuMemory";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [table, setTable] = useState("T1");
  const [activeCategory, setActiveCategory] = useState("starter");

  const [promoActive, setPromoActive] = useState(false);

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

      setPromoActive(localStorage.getItem("ai_promo_active") === "true");
    };

    load();
    const interval = setInterval(load, 1000);
    return () => clearInterval(interval);
  }, [table]);

  const getPrice = (price) => {
    if (promoActive) return Math.round(price * 0.9);
    return price;
  };

  const addItem = (item) => {
    setOrderItems((prev) => [
      ...prev,
      {
        ...item,
        price: getPrice(item.price),
        id: Date.now() + Math.random(),
      },
    ]);
  };

  const sendOrder = async (mode) => {
    if (orderItems.length === 0) return;

    // 🔥 SAVE MENU PERFORMANCE
    updateMenuStats(orderItems);

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
      <div className="grid md:grid-cols-2 gap-10 text-white">

        <div className="space-y-6">
          <h1>POS</h1>

          {Object.keys(menu).map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat)}>
              {cat}
            </button>
          ))}

          {menu[activeCategory].map((item, i) => (
            <div key={i} onClick={() => addItem(item)}>
              {item.name} - {getPrice(item.price)}
            </div>
          ))}
        </div>

        <div>
          <h2>Table {table}</h2>

          {orderItems.map((i) => (
            <div key={i.id}>{i.name}</div>
          ))}

          <div>Total: {total}</div>

          <button onClick={() => sendOrder("hold")}>HOLD</button>
          <button onClick={() => sendOrder("fire")}>FIRE</button>
        </div>

      </div>
    </AppShell>
  );
}