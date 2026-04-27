"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "../../AppShell.js";

export default function POSPage() {
  const [orderItems, setOrderItems] = useState([]);
  const [selectedTable, setSelectedTable] = useState("T1");
  const [category, setCategory] = useState("starter");
  const [menu, setMenu] = useState([]);
  const [user, setUser] = useState(null);

  // LOAD MENU
  const loadMenu = async () => {
  // 🔹 get dishes
  const { data: dishes, error: dishError } = await supabase
    .from("dishes")
    .select("*");

  if (dishError) {
    console.error("MENU LOAD ERROR:", dishError);
    setMenu([]);
    return;
  }

  // 🔹 get stock
  const { data: stockData, error: stockError } = await supabase
    .from("dish_stock")
    .select("dish_id, quantity");

  if (stockError) {
    console.error("STOCK LOAD ERROR:", stockError);
  }

  // 🔹 map stock
  const stockMap = {};
  for (const s of stockData || []) {
    stockMap[s.dish_id] = s.quantity;
  }

  // 🔹 merge
  const merged = (dishes || []).map((d) => ({
    ...d,
    stock: stockMap[d.id] ?? 0,
  }));

  setMenu(merged);
};
useEffect(() => {
  const getUser = async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data?.user || null);
  };

  getUser();
}, []);
  useEffect(() => {
  loadMenu();

  // 🔥 REALTIME STOCK LISTENER
  const channel = supabase
    .channel("dish-stock-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "dish_stock",
      },
      () => {
        loadMenu(); // reload stock instantly
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

  // ADD ITEM
  const addItem = (item) => {
    const orderItem = {
      dish_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: 1,
    };

    setOrderItems((prev) => [...prev, orderItem]);
  };

  // TOTAL (FIXED: supports quantity)
  const total = orderItems.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );

  // SEND ORDER (POS ONLY → NO STOCK / NO RECIPE)
const sendOrder = async () => {
  if (orderItems.length === 0) return;

  const res = await fetch("/api/pos/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
  table: selectedTable,
  items: orderItems,
  total,
  staff_name: user?.email || "Unknown",
}),
  });

  const data = await res.json();

  console.log("SEND RESULT:", data);

  // 🔴 THIS IS THE FIX
  if (!res.ok) {
    alert(data.error || "Order failed");
    return; // ❗ DO NOT CLEAR ORDER
  }

  // ✅ ONLY SUCCESS CLEARS
  setOrderItems([]);
};
  // FILTER MENU
  const filteredMenu = menu.filter((item) => {
    if (!item.category) return true;
    return item.category === category;
  });

  return (
    <AppShell>
      <div className="text-white grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* LEFT */}
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
  {filteredMenu.map((item) => {
    const outOfStock = item.stock <= 0;

    return (
      <div
        key={item.id}
        onClick={() => {
          if (!outOfStock) addItem(item);
        }}
        className={`p-3 rounded ${
          outOfStock
            ? "bg-red-500/20 opacity-50 cursor-not-allowed"
            : "bg-white/5 hover:bg-white/10 cursor-pointer"
        }`}
      >
        <div className="flex justify-between">
          <span>{item.name}</span>

          <span className="text-sm">
            {outOfStock
              ? "OUT"
              : `${item.stock} left`}
          </span>
        </div>

        <div className="text-xs text-white/50">
          {item.price}
        </div>
      </div>
    );
  })}
</div>
        </div>

        {/* RIGHT */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg">Table {selectedTable}</h2>

          {orderItems.map((item, i) => (
            <div key={i} className="text-sm">
              {item.item_name} x{item.quantity}
            </div>
          ))}

          <div className="text-lg">Total: {total}</div>

          <button className="w-full bg-purple-500 py-2 rounded">
            REQUEST ADJUSTMENT
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button className="bg-yellow-500 py-2 rounded">
              HOLD
            </button>
            <button
              onClick={sendOrder}
              className="bg-green-500 py-2 rounded"
            >
              FIRE
            </button>
          </div>

          <button
            onClick={sendOrder}
            className="w-full bg-green-600 py-3 rounded mt-2"
          >
            SEND ORDER
          </button>

          <button className="w-full bg-blue-500 py-2 rounded">
            FIRE HELD
          </button>
        </div>

      </div>
    </AppShell>
  );
}