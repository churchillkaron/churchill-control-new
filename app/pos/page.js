"use client";

import { runAIActions } from "../../lib/aiActions";
import { getControlFlag } from "../../lib/aiControl";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [table, setTable] = useState("T1");
  const [activeCategory, setActiveCategory] = useState("starter");

  const [blockFire, setBlockFire] = useState(false);

  const [adjustRequests, setAdjustRequests] = useState([]);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustType, setAdjustType] = useState("discount");
  const [adjustMode, setAdjustMode] = useState("percent");
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const tables = ["T1", "T2", "T3", "T4", "T5", "T6"];

  const menu = {
    starter: [
      { name: "Beef Carpaccio", price: 320, station: "WESTERN", course: "starter" },
      { name: "Tom Yum Goong", price: 180, station: "THAI", course: "starter" },
    ],
    main: [
      { name: "Chili Prawns", price: 320, station: "THAI", course: "main" },
      { name: "Scallops", price: 520, station: "WESTERN", course: "main" },
    ],
    dessert: [
      { name: "Mango Sticky Rice", price: 180, station: "THAI", course: "dessert" },
      { name: "Chocolate Cake", price: 220, station: "WESTERN", course: "dessert" },
    ],
  };

  useEffect(() => {
    const load = () => {
      const stored = JSON.parse(localStorage.getItem("orders") || "[]");
      const tableOrders = stored.filter((o) => o.table === table);
      const items = tableOrders.flatMap((o) => o.items || []);
      setExistingItems(items);

      // 🔥 READ AI CONTROL
      setBlockFire(getControlFlag("block_fire"));
    };

    load();
    const interval = setInterval(load, 1000);
    return () => clearInterval(interval);
  }, [table]);

  const addItem = (item) => {
    setOrderItems((prev) => [
      ...prev,
      {
        ...item,
        id: Date.now() + Math.random(),
        status: "NEW",
      },
    ]);
  };

  const sendOrder = async (mode) => {
    if (orderItems.length === 0) return;

    // 🔥 BLOCK FIRE IF AI SAYS SO
    if (mode === "fire" && blockFire) {
      alert("Kitchen overloaded. AI blocked FIRE.");
      return;
    }

    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const newOrder = {
      id: Date.now(),
      table,
      items: orderItems,
      adjustmentRequests: adjustRequests,
      total: orderItems.reduce((s, i) => s + i.price, 0),
      status: mode === "fire" ? "kitchen" : "hold",
      created_at: new Date().toISOString(),
    };

    stored.push(newOrder);
    localStorage.setItem("orders", JSON.stringify(stored));

    await runAIActions();

    setOrderItems([]);
    setAdjustRequests([]);
  };

  const fireHeld = async () => {
    if (blockFire) {
      alert("Kitchen overloaded. AI blocked FIRE.");
      return;
    }

    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = stored.map((o) => {
      if (o.table !== table) return o;
      if (o.status !== "hold") return o;

      return {
        ...o,
        status: "kitchen",
      };
    });

    localStorage.setItem("orders", JSON.stringify(updated));

    await runAIActions();
  };

  const total =
    existingItems.reduce((s, i) => s + i.price, 0) +
    orderItems.reduce((s, i) => s + i.price, 0);

  return (
    <AppShell showNav={true}>
      <div className="grid md:grid-cols-2 gap-10 text-white">

        <div className="space-y-6">
          <h1>POS</h1>

          {menu[activeCategory].map((item, i) => (
            <div key={i} onClick={() => addItem(item)}>
              {item.name} - {item.price}
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

          <button
            onClick={() => sendOrder("fire")}
            style={{ opacity: blockFire ? 0.5 : 1 }}
          >
            FIRE {blockFire && "(BLOCKED)"}
          </button>

          <button onClick={fireHeld}>FIRE HELD</button>
        </div>

      </div>
    </AppShell>
  );
}