"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POS() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");

  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);

  const menu = [
    { name: "Pad Thai", price: 160 },
    { name: "Massaman Curry", price: 180 },
    { name: "Green Curry", price: 170 },
    { name: "Tom Yum Goong", price: 180 },
    { name: "Beer", price: 120 },
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

    const savedOrders =
      JSON.parse(localStorage.getItem("orders")) || [];

    setOrders(savedOrders);
  }, []);

  // ADD ITEM TO CART
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

  // REMOVE ITEM
  const removeFromCart = (name) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.name === name
            ? { ...i, qty: i.qty - 1 }
            : i
        )
        .filter((i) => i.qty > 0)
    );
  };

  // CALCULATE TOTAL
  const total = cart.reduce(
    (sum, i) => sum + i.price * i.qty,
    0
  );

  // CREATE ORDER
  const createOrder = () => {
    if (cart.length === 0) return;

    const newOrder = {
      id: Date.now(),
      table: "T" + Math.floor(Math.random() * 20),
      items: cart,
      total,
      status: "Active",
      staff: staffName,
      role: staffRole,
      time: new Date().toISOString(),
    };

    const updated = [...orders, newOrder];

    setOrders(updated);
    localStorage.setItem("orders", JSON.stringify(updated));

    setCart([]); // reset cart
  };

  return (
    <AppShell>
      <div className="space-y-10">

        {/* HEADER */}
        <div className="flex justify-between text-sm text-white/60">
          <div>{staffName}</div>
          <div>{staffRole}</div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Point of Sale
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Order System
          </h1>
        </div>

        {/* MENU */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {menu.map((item) => (
            <button
              key={item.name}
              onClick={() => addToCart(item)}
              className="bg-white/10 hover:bg-white/20 p-4 rounded-xl text-left"
            >
              <div className="font-medium">{item.name}</div>
              <div className="text-sm text-white/60">
                THB {item.price}
              </div>
            </button>
          ))}
        </div>

        {/* CART */}
        <div className="bg-white/5 p-6 rounded-xl space-y-4">
          <h2 className="text-xl font-semibold">Cart</h2>

          {cart.length === 0 && (
            <p className="text-white/40">No items</p>
          )}

          {cart.map((item) => (
            <div
              key={item.name}
              className="flex justify-between items-center"
            >
              <div>
                {item.name} x{item.qty}
              </div>
              <button
                onClick={() => removeFromCart(item.name)}
                className="text-red-400 text-sm"
              >
                Remove
              </button>
            </div>
          ))}

          <div className="pt-4 border-t border-white/10 flex justify-between">
            <div>Total</div>
            <div>THB {total}</div>
          </div>

          <button
            onClick={createOrder}
            className="w-full bg-[#ff7a00] py-3 rounded-xl text-black font-medium"
          >
            Send Order
          </button>
        </div>

      </div>
    </AppShell>
  );
}