"use client";

import { runAIActions } from "../../lib/aiActions";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [table, setTable] = useState("T1");
  const [activeCategory, setActiveCategory] = useState("starter");

  const [promoActive, setPromoActive] = useState(false);

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

      // 🔥 READ AI PROMO STATE
      setPromoActive(localStorage.getItem("ai_promo_active") === "true");
    };

    load();
    const interval = setInterval(load, 1000);
    return () => clearInterval(interval);
  }, [table]);

  const getPrice = (price) => {
    if (promoActive) {
      return Math.round(price * 0.9); // 🔥 10% discount
    }
    return price;
  };

  const addItem = (item) => {
    const finalPrice = getPrice(item.price);

    setOrderItems((prev) => [
      ...prev,
      {
        ...item,
        price: finalPrice,
        originalPrice: item.price,
        id: Date.now() + Math.random(),
      },
    ]);
  };

  const sendOrder = async (mode) => {
    if (orderItems.length === 0) return;

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

        {/* LEFT */}
        <div className="space-y-6">
          <h1>POS</h1>

          {promoActive && (
            <div className="text-green-400 text-sm">
              🔥 Promotion Active (AI)
            </div>
          )}

          <div className="flex gap-2">
            {Object.keys(menu).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 ${
                  activeCategory === cat ? "bg-orange-500" : "bg-white/10"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {menu[activeCategory].map((item, i) => (
            <div
              key={i}
              onClick={() => addItem(item)}
              className="p-3 bg-white/5 rounded cursor-pointer"
            >
              {item.name} - {getPrice(item.price)}
              {promoActive && (
                <span className="text-xs text-green-400 ml-2">
                  (promo)
                </span>
              )}
            </div>
          ))}
        </div>

        {/* RIGHT */}
        <div className="bg-white/5 p-6 rounded space-y-4">

          <h2>Table {table}</h2>

          {orderItems.map((i) => (
            <div key={i.id}>
              {i.name} - {i.price}
              {i.originalPrice && i.originalPrice !== i.price && (
                <span className="text-xs text-green-400 ml-2">
                  (discounted)
                </span>
              )}
            </div>
          ))}

          <div className="text-xl">Total: {total}</div>

          <div className="flex gap-2">
            <button
              onClick={() => sendOrder("hold")}
              className="w-full bg-yellow-500 py-2 rounded text-black"
            >
              HOLD
            </button>

            <button
              onClick={() => sendOrder("fire")}
              className="w-full bg-green-500 py-2 rounded text-black"
            >
              FIRE
            </button>
          </div>

        </div>

      </div>
    </AppShell>
  );
}