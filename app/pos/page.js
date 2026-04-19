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
  "Thai Food": [{ name: "Pad Thai", price: 160, station: "THAI" }],
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

  const [attempted, setAttempted] = useState(false);

  const handleClick = (item) => {
    if (item.popup) {
      setPopupItem(item);
      setSelected({ doneness: "", side: "", sauce: "" });
      setAttempted(false);
      return;
    }
    setCart((p) => [...p, item]);
  };

  const isComplete =
    selected.doneness && selected.side && selected.sauce;

  const confirmPopup = () => {
    if (!isComplete) {
      setAttempted(true);
      return;
    }

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

    const newOrder = {
      id: Date.now(),
      table,
      total,
      created_at: new Date().toISOString(),
      items: cart.map((i, idx) => ({
        id: Date.now() + idx,
        ...i,
        status: "NEW",
      })),
    };

    const western = newOrder.items.filter(i => i.station === "WESTERN");
    const thai = newOrder.items.filter(i => i.station === "THAI");

    newOrder.kitchen = {
      WESTERN: western,
      THAI: thai,
    };

    orders.push(newOrder);

    localStorage.setItem("orders", JSON.stringify(orders));
    setCart([]);
  };

  return (
    <AppShell>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-white">

        {/* MENU */}
        <div className="md:col-span-2 space-y-6">

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <input
              placeholder="Table"
              value={table}
              onChange={(e) => setTable(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white/10 w-full"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`px-4 py-2 rounded-xl ${
                  activeCategory === c ? "bg-[#ff7a00]" : "bg-white/10"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(menu[activeCategory] || []).map((item, i) => (
              <div
                key={i}
                onClick={() => handleClick(item)}
                className="p-4 rounded-xl bg-white/10 hover:bg-white/20 transition cursor-pointer"
              >
                <div>{item.name}</div>
                <div className="text-white/60 text-sm mt-1">
                  {item.price} THB
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CART */}
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-4">

          <div className="text-lg">Order</div>

          <div className="space-y-2 max-h-[400px] overflow-auto text-sm">
            {cart.map((item, i) => (
              <div key={i}>
                {item.name} - {item.price}
                {item.modifier && <div>• {item.modifier}</div>}
                {item.side && <div>• {item.side}</div>}
                {item.sauce && <div>• {item.sauce}</div>}
              </div>
            ))}
          </div>

          <div className="text-xl">Total: {total} THB</div>

          <button
            onClick={sendOrder}
            className="w-full bg-[#ff7a00] p-3 rounded-xl hover:brightness-110 transition"
          >
            Send Order
          </button>
        </div>

        {/* POPUP */}
        {popupItem && (
          <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/70">

            <div className="bg-black border border-white/10 p-6 rounded-2xl w-[400px] space-y-4">

              <h2 className="text-lg">{popupItem.name}</h2>

              <div>
                <div className={attempted && !selected.doneness ? "text-red-400" : ""}>
                  Doneness
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {doneness.map((d) => (
                    <div
                      key={d}
                      onClick={() =>
                        setSelected((p) => ({ ...p, doneness: d }))
                      }
                      className={`cursor-pointer p-2 rounded ${
                        selected.doneness === d
                          ? "bg-[#ff7a00]"
                          : "bg-white/10"
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className={attempted && !selected.side ? "text-red-400" : ""}>
                  Side
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {sides.map((s) => (
                    <div
                      key={s}
                      onClick={() =>
                        setSelected((p) => ({ ...p, side: s }))
                      }
                      className={`cursor-pointer p-2 rounded ${
                        selected.side === s
                          ? "bg-[#ff7a00]"
                          : "bg-white/10"
                      }`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className={attempted && !selected.sauce ? "text-red-400" : ""}>
                  Sauce
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {sauces.map((s) => (
                    <div
                      key={s}
                      onClick={() =>
                        setSelected((p) => ({ ...p, sauce: s }))
                      }
                      className={`cursor-pointer p-2 rounded ${
                        selected.sauce === s
                          ? "bg-[#ff7a00]"
                          : "bg-white/10"
                      }`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={confirmPopup}
                className="w-full bg-[#ff7a00] p-3 rounded-xl"
              >
                Add to Cart
              </button>

              <button
                onClick={() => setPopupItem(null)}
                className="w-full bg-white/10 p-3 rounded-xl"
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