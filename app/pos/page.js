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

  const isComplete =
    selected.doneness && selected.side && selected.sauce;

  return (
    <AppShell>
      <div className="grid grid-cols-3 gap-6">

        {/* MENU */}
        <div className="col-span-2 space-y-6">

          <input
            placeholder="Table"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="px-4 py-3 rounded-xl bg-white/10 w-full"
          />

          <div className="flex gap-2 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`px-4 py-2 rounded-xl ${
                  activeCategory === c ? "bg-orange-500" : "bg-white/10"
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
                className="p-4 rounded-xl bg-white/10 cursor-pointer"
              >
                <div>{item.name}</div>
                <div>{item.price} THB</div>
              </div>
            ))}
          </div>
        </div>

        {/* CART */}
        <div className="bg-white/5 p-4 rounded-xl space-y-4">
          <div className="text-lg">Order</div>

          <div className="space-y-2 max-h-[400px] overflow-auto">
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
            className="w-full bg-orange-500 p-3 rounded-xl"
          >
            Send Order
          </button>
        </div>

        {/* POPUP */}
        {popupItem && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="bg-black/80 p-6 rounded-2xl w-[400px] space-y-4">

              <h2>{popupItem.name}</h2>

              {/* DONENESS */}
              <div>
                <div>Doneness</div>
                <div className="grid grid-cols-2 gap-2">
                  {doneness.map((d) => (
                    <div
                      key={d}
                      onClick={() =>
                        setSelected((p) => ({ ...p, doneness: d }))
                      }
                      className={`cursor-pointer p-2 rounded ${
                        selected.doneness === d
                          ? "bg-orange-500"
                          : "bg-white/10"
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>
              </div>

              {/* SIDE */}
              <div>
                <div>Side</div>
                <div className="grid grid-cols-2 gap-2">
                  {sides.map((s) => (
                    <div
                      key={s}
                      onClick={() =>
                        setSelected((p) => ({ ...p, side: s }))
                      }
                      className={`cursor-pointer p-2 rounded ${
                        selected.side === s
                          ? "bg-orange-500"
                          : "bg-white/10"
                      }`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>

              {/* SAUCE */}
              <div>
                <div>Sauce</div>
                <div className="grid grid-cols-2 gap-2">
                  {sauces.map((s) => (
                    <div
                      key={s}
                      onClick={() =>
                        setSelected((p) => ({ ...p, sauce: s }))
                      }
                      className={`cursor-pointer p-2 rounded ${
                        selected.sauce === s
                          ? "bg-orange-500"
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
                disabled={!isComplete}
                className={`w-full p-3 rounded-xl ${
                  isComplete ? "bg-orange-500" : "bg-gray-500 opacity-50"
                }`}
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