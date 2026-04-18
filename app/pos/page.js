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

const menu = {
  Starter: [
    { name: "Beef Carpaccio", price: 320 },
    { name: "Chili & Garlic Prawns", price: 320 },
    { name: "Signature Bruschetta", price: 280 },
    { name: "Seared Scallops", price: 520 },
    { name: "Mango & Tomato Salad", price: 220 },
    { name: "Tom Yum Goong", price: 180 },
    { name: "Tom Kha Gai", price: 170 },
    { name: "Potato Gratin", price: 120 },
    { name: "Crispy Potato Wedges", price: 100 },
    { name: "Cauliflower Puree", price: 120 },
  ],
  "Main Course": [
    { name: "Churchill Beef Short Ribs", price: 890 },
    { name: "Ribeye Steak", price: 890 },
    { name: "Beef Tenderloin", price: 920 },
    { name: "Pork Tenderloin", price: 460 },
    { name: "Salmon", price: 690 },
    { name: "Churchill Sambal Half Chicken", price: 590 },
    { name: "Veal Stew", price: 850 },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 160 },
    { name: "Pad Ka Prow", price: 150 },
    { name: "Stir-Fried Chicken with Cashew Nuts", price: 180 },
    { name: "Beef with Oyster Sauce", price: 220 },
    { name: "Massaman Curry", price: 180 },
    { name: "Green Curry", price: 170 },
    { name: "Panang Curry", price: 175 },
    { name: "Pineapple Fried Rice", price: 160 },
  ],
};

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState("Starter");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState("");

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.name === item.name);

      if (existing) {
        return prev.map((i) =>
          i.name === item.name
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      }

      return [...prev, { ...item, qty: 1 }];
    });
  };

  const removeFromCart = (name) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.name === name
            ? { ...item, qty: item.qty - 1 }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  const sendOrder = () => {
    if (!table || cart.length === 0) {
      alert("Select table and add items");
      return;
    }

    const staffName = localStorage.getItem("staffName") || "Unknown";

    const existingOrders = JSON.parse(localStorage.getItem("orders") || "[]");

    const newOrder = {
      id: Date.now(),
      table,
      table_name: table,
      staff: staffName,
      items: cart,
      total,
      status: "Active",
      created_at: new Date().toISOString(),
    };

    localStorage.setItem("orders", JSON.stringify([...existingOrders, newOrder]));
    setCart([]);
    alert("Order sent");
  };

  const payOrder = () => {
    if (!table || cart.length === 0) {
      alert("Select table and add items");
      return;
    }

    const staffName = localStorage.getItem("staffName") || "Unknown";

    const existingOrders = JSON.parse(localStorage.getItem("orders") || "[]");

    const paidOrder = {
      id: Date.now(),
      table,
      table_name: table,
      staff: staffName,
      items: cart,
      total,
      status: "Paid",
      created_at: new Date().toISOString(),
    };

    localStorage.setItem("orders", JSON.stringify([...existingOrders, paidOrder]));
    setCart([]);
    alert("Payment completed");
  };

  const currentMenu = menu[activeCategory] || [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            POS
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Order System
          </h1>
        </div>

        <input
          placeholder="Table (e.g. T1)"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="px-4 py-3 rounded-xl bg-white/10 border border-white/10 w-full max-w-xs"
        />

        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-xl ${
                activeCategory === cat
                  ? "bg-[#ff7a00] text-black"
                  : "bg-white/10 text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {currentMenu.length === 0 && (
              <div className="text-white/40 rounded-xl bg-white/5 p-4">
                No items yet
              </div>
            )}

            {currentMenu.map((item) => (
              <button
                key={item.name}
                onClick={() => addToCart(item)}
                className="p-4 rounded-2xl bg-white/10 border border-white/10 text-left hover:bg-white/15 transition"
              >
                <div className="font-medium">{item.name}</div>
                <div className="text-white/60 text-sm mt-1">
                  THB {item.price}
                </div>
              </button>
            ))}
          </div>

          <div className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-4 h-fit">
            <h2 className="text-xl font-semibold">Cart</h2>

            {cart.length === 0 && (
              <div className="text-white/40">No items added</div>
            )}

            {cart.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-3">
                <div>
                  <div>{item.name}</div>
                  <div className="text-white/50 text-sm">
                    THB {item.price} x {item.qty}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => removeFromCart(item.name)}
                    className="w-8 h-8 rounded-lg bg-white/10"
                  >
                    -
                  </button>
                  <div className="w-8 text-center">{item.qty}</div>
                  <button
                    onClick={() => addToCart(item)}
                    className="w-8 h-8 rounded-lg bg-white/10"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}

            <div className="pt-4 border-t border-white/10 text-lg font-semibold">
              Total: THB {total}
            </div>

            <div className="grid gap-3">
              <button
                onClick={sendOrder}
                className="w-full bg-[#ff7a00] py-3 rounded-xl text-black font-semibold"
              >
                Send Order
              </button>

              <button
                onClick={payOrder}
                className="w-full bg-white/10 py-3 rounded-xl text-white font-semibold"
              >
                Payment
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}