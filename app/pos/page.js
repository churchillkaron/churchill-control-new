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
    { name: "Beef Carpaccio", price: 320, station: "WESTERN" },
    { name: "Chili & Garlic Prawns", price: 320, station: "WESTERN" },
    { name: "Signature Bruschetta", price: 280, station: "WESTERN" },
    { name: "Seared Scallops", price: 520, station: "WESTERN" },
    { name: "Mango & Tomato Salad", price: 220, station: "WESTERN" },
    { name: "Tom Yum Goong", price: 180, station: "THAI" },
    { name: "Tom Kha Gai", price: 170, station: "THAI" },
  ],

  "Main Course": [
    { name: "Ribeye Steak", price: 890, station: "WESTERN", popup: true },
    { name: "Beef Tenderloin", price: 920, station: "WESTERN", popup: true },
  ],

  "Thai Food": [
    { name: "Pad Thai", price: 160, station: "THAI" },
  ],
};

const doneness = ["Rare", "Medium Rare", "Medium", "Well Done"];
const sides = ["Fries", "Salad", "Mashed Potato"];
const sauces = ["Pepper", "Mushroom", "BBQ", "Red Wine"];

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState("Starter");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState("");

  const [popupItem, setPopupItem] = useState(null);
  const [selected, setSelected] = useState({
    doneness: "",
    side: "",
    sauce: "",
  });

  const handleClick = (item) => {
    if (item.popup) {
      setPopupItem(item);
      setSelected({ doneness: "", side: "", sauce: "" });
      return;
    }
    setCart((p) => [...p, item]);
  };

  const confirmPopup = () => {
    setCart((p) => [
      ...p,
      {
        ...popupItem,
        modifier: selected.doneness,
        side: selected.side,
        sauce: selected.sauce,
      },
    ]);
    setPopupItem(null);
  };

  const total = cart.reduce((s, i) => s + i.price, 0);

  const sendOrder = () => {
    const orders = JSON.parse(localStorage.getItem("orders") || "[]");

    orders.push({
      id: Date.now(),
      table,
      total,
      created_at: new Date().toISOString(),
      items: cart.map((i, idx) => ({
        id: Date.now() + idx,
        ...i,
        status: "NEW",
      })),
    });

    localStorage.setItem("orders", JSON.stringify(orders));
    setCart([]);
  };

  return (
    <>
      <AppShell>
        <div className="space-y-6">

          <input
            placeholder="Table"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="px-4 py-3 rounded-xl bg-white/10"
          />

          <div className="flex