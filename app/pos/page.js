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
    { name: "Potato Gratin", price: 120, station: "WESTERN" },
    { name: "Crispy Potato Wedges", price: 100, station: "WESTERN" },
    { name: "Cauliflower Puree", price: 120, station: "WESTERN" },
  ],

  "Main Course": [
    { name: "Ribeye Steak", price: 890, station: "WESTERN", popup: true },
    { name: "Beef Tenderloin", price: 920, station: "WESTERN", popup: true },
    { name: "Salmon", price: 690, station: "WESTERN", popup: true },
    { name: "Churchill Beef Short Ribs", price: 890, station: "WESTERN" },
    { name: "Pork Tenderloin", price: 460, station: "WESTERN", popup: true },
    { name: "Churchill Sambal Half Chicken", price: 590, station: "WESTERN" },
    { name: "Veal Stew", price: 850, station: "WESTERN" },
  ],

  "Thai Food": [
    { name: "Pad Thai", price: 160, station: "THAI" },
    { name: "Pad Ka Prow", price: 150, station: "THAI" },
    { name: "Massaman Curry", price: 180, station: "THAI" },
    { name: "Green Curry", price: 170, station: "THAI" },
    { name: "Panang Curry", price: 175, station: "THAI" },
  ],

  Dessert: [],
  Beer: [],
  "Soft Drink": [],
  Wine: [],
  Cocktails: [],
  Spirit: [],
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

  const addToCart = (item) => {
    setCart((prev) => [...prev, { ...item, qty: 1 }]);
  };

  const handleClick = (item) => {
    if (item.popup) {
      setPopupItem(item);
      setSelected({ doneness: "", side: "", sauce: "" });
      return;
    }
    addToCart(item);
  };

  const confirmPopup = () => {
    if (!popupItem) return;

    addToCart({
      ...popupItem,
      modifier: selected.doneness,
      side: selected.side,
      sauce: selected.sauce,
    });

    setPopupItem(null);
  };

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const sendOrder = () => {
    if (!table || cart.length === 0) return alert("Missing data");

    const orders = JSON.parse(localStorage.getItem("orders") || "[]");

    orders.push({
      id: Date.now(),
      table,
      total,
      created_at: new Date().toISOString(),
      status: "ACTIVE",
      items: cart.map((i, idx) => ({
        id: Date.now() + idx,
        ...i,
        status: "NEW",
      })),
    });

    localStorage.setItem("orders", JSON.stringify(orders));
    setCart([]);
    setTable("");
  };

  return (
    <AppShell>
      <div className="space-y-6">

        <input
          placeholder="Table"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="px-4 py-3 rounded-xl bg-white/10 border border-white/10"
        />

        <div className="flex gap-2 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`px-4 py-2 rounded-xl ${
                activeCategory === c
                  ? "bg-[#ff7a00] text-black"
                  : "bg-white/10"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {menu[activeCategory]?.map((item) => (
            <button
              key={item.name}
              onClick={() => handleClick(item)}
              className="p-4 rounded-2xl bg-white/10 border border-white/10 text-left"
            >
              <div>{item.name}</div>
              <div className="text-sm text-white/50">
                {item.price} THB
              </div>
            </button>
          ))}
        </div>

        <div className="bg-white/5 p-5 rounded-2xl">
          {cart.map((i, idx) => (
            <div key={idx}>
              {i.name}
              {i.modifier && <div>• {i.modifier}</div>}
              {i.side && <div>• {i.side}</div>}
              {i.sauce && <div>• {i.sauce}</div>}
            </div>
          ))}

          <div className="mt-3">Total: {total}</div>

          <button
            onClick={sendOrder}
            className="w-full mt-4 bg-[#ff7a00] py-3 rounded-xl text-black"
          >
            Send Order
          </button>
        </div>

        {/* POPUP FIXED */}
        {popupItem && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">

            <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 w-96 space-y-5 relative z-50">

              <h2 className="text-xl">{popupItem.name}</h2>

              <div>
                <div className="text-sm mb-2">Doneness</div>
                <div className="grid grid-cols-2 gap-2">
                  {doneness.map((o) => (
                    <button
                      key={o}
                      onClick={() =>
                        setSelected((p) => ({ ...p, doneness: o }))
                      }
                      className="bg-white/10 hover:bg-white/20 p-2 rounded-xl cursor-pointer"
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm mb-2">Side</div>
                <div className="grid grid-cols-2 gap-2">
                  {sides.map((o) => (
                    <button
                      key={o}
                      onClick={() =>
                        setSelected((p) => ({ ...p, side: o }))
                      }
                      className="bg-white/10 hover:bg-white/20 p-2 rounded-xl cursor-pointer"
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm mb-2">Sauce</div>
                <div className="grid grid-cols-2 gap-2">
                  {sauces.map((o) => (
                    <button
                      key={o}
                      onClick={() =>
                        setSelected((p) => ({ ...p, sauce: o }))
                      }
                      className="bg-white/10 hover:bg-white/20 p-2 rounded-xl cursor-pointer"
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={confirmPopup}
                className="w-full bg-[#ff7a00] py-3 rounded-xl text-black"
              >
                Add to Cart
              </button>

              <button
                onClick={() => setPopupItem(null)}
                className="w-full bg-white/10 py-3 rounded-xl"
              >
                Cancel
              </button>

            </div>

          </div>
        )}

      </div>
    </AppShell>
  );
}