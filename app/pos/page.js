"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";
import { supabase } from "../../lib/supabase";

export default function POS() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");

  const [cart, setCart] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);

  const tables = Array.from({ length: 12 }, (_, i) => `T${i + 1}`);

  const menu = [
    { name: "Pad Thai", price: 160 },
    { name: "Massaman Curry", price: 180 },
    { name: "Beer", price: 120 },
    { name: "Water", price: 40 },
  ];

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    if (!name || !role) {
      window.location.href = "/";
      return;
    }

    setStaffName(name);
    setStaffRole(role);
  }, []);

  // 🔥 CART
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

  const total = cart.reduce(
    (sum, i) => sum + i.price * i.qty,
    0
  );

  // 🔥 CREATE ORDER (SUPABASE)
  const createOrder = async () => {
    if (!selectedTable) {
      alert("Select table");
      return;
    }

    if (cart.length === 0) return;

    const newOrder = {
      id: Date.now(),
      table_name: selectedTable,
      items: cart,
      total: total,
      status: "Active",
      staff: staffName,
      role: staffRole,
    };

    const { error } = await supabase
      .from("orders")
      .insert([newOrder]);

    if (error) {
      console.error(error);
      alert("Error saving order");
      return;
    }

    setCart([]);
    setSelectedTable(null);
  };

  return (
    <AppShell>
      <div className="space-y-10">

        {/* HEADER */}
        <div className="flex justify-between text-sm text-white/60">
          <div>{staffName}</div>
          <div>{staffRole}</div>
        </div>

        <h1 className="text-3xl font-semibold">
          POS System
        </h1>

        {/* TABLES */}
        <div>
          <h2 className="text-white/60 mb-3">Tables</h2>

          <div className="grid grid-cols-4 gap-3">
            {tables.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTable(t)}
                className={`p-4 rounded-xl bg-white/10 ${
                  selectedTable === t
                    ? "ring-2 ring-[#ff7a00]"
                    : ""
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* MENU */}
        <div className="grid grid-cols-2 gap-4">
          {menu.map((item) => (
            <button
              key={item.name}
              onClick={() => addToCart(item)}
              className="bg-white/10 p-4 rounded-xl"
            >
              {item.name} — THB {item.price}
            </button>
          ))}
        </div>

        {/* CART */}
        <div className="bg-white/5 p-6 rounded-xl space-y-3">
          <h2>Cart</h2>

          {cart.map((item) => (
            <div key={item.name}>
              {item.name} x{item.qty}
            </div>
          ))}

          <div>Total: THB {total}</div>

          <button
            onClick={createOrder}
            className="w-full bg-[#ff7a00] py-3 rounded-xl text-black"
          >
            Send Order
          </button>
        </div>

      </div>
    </AppShell>
  );
}