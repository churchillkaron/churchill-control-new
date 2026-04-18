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
    {
      name: "Ribeye Steak",
      price: 890,
      station: "WESTERN",
      needsPopup: true,
    },
    {
      name: "Beef Tenderloin",
      price: 920,
      station: "WESTERN",
      needsPopup: true,
    },
    {
      name: "Salmon",
      price: 690,
      station: "WESTERN",
      needsPopup: true,
    },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 160, station: "THAI" },
    { name: "Pad Ka Prow", price: 150, station: "THAI" },
  ],
  Dessert: [],
  Beer: [],
  "Soft Drink": [],
  Wine: [],
  Cocktails: [],
  Spirit: [],
};

const donenessOptions = ["Rare", "Medium Rare", "Medium", "Well Done"];
const sideOptions = ["Fries", "Salad", "Mashed Potato"];
const sauceOptions = ["Pepper", "Mushroom", "BBQ", "Red Wine"];

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState("Starter");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState("");

  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedModifier, setSelectedModifier] = useState("");
  const [selectedSide, setSelectedSide] = useState("");
  const [selectedSauce, setSelectedSauce] = useState("");

  const currentMenu = menu[activeCategory] || [];

  const handleMenuClick = (item) => {
    if (item.needsPopup) {
      setSelectedItem(item);
      setSelectedModifier("");
      setSelectedSide("");
      setSelectedSauce("");
      return;
    }

    addToCart(item, "", "", "");
  };

  const addToCart = (item, modifier, side, sauce) => {
    setCart((prev) => [
      ...prev,
      {
        name: item.name,
        price: item.price,
        station: item.station,
        qty: 1,
        modifier,
        side,
        sauce,
        hold: false,
      },
    ]);
  };

  const confirmPopup = () => {
    if (!selectedItem) return;

    addToCart(
      selectedItem,
      selectedModifier,
      selectedSide,
      selectedSauce
    );

    setSelectedItem(null);
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const sendOrder = () => {
    if (!table.trim() || cart.length === 0) {
      alert("Select table and add items");
      return;
    }

    const existing = JSON.parse(localStorage.getItem("orders") || "[]");

    const newOrder = {
      id: Date.now(),
      table,
      status: "ACTIVE",
      total,
      created_at: new Date().toISOString(),
      items: cart.map((item, i) => ({
        id: Date.now() + i,
        ...item,
        status: "NEW",
      })),
    };

    localStorage.setItem("orders", JSON.stringify([...existing, newOrder]));
    setCart([]);
    setTable("");

    alert("Order sent");
  };

  return (
    <AppShell>
      <div className="space-y-6">

        <input
          placeholder="Table"
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

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {currentMenu.map((item) => (
            <button
              key={item.name}
              onClick={() => handleMenuClick(item)}
              className="p-4 rounded-2xl bg-white/10 border border-white/10 text-left hover:bg-white/15"
            >
              <div className="font-medium">{item.name}</div>
              <div className="text-white/60 text-sm">
                THB {item.price}
              </div>
            </button>
          ))}
        </div>

        {/* CART */}
        <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
          {cart.map((item, i) => (
            <div key={i}>
              {item.name} x{item.qty}
              {item.modifier && <div>• {item.modifier}</div>}
              {item.side && <div>• {item.side}</div>}
              {item.sauce && <div>• {item.sauce}</div>}
            </div>
          ))}

          <div className="mt-3 font-semibold">THB {total}</div>

          <button
            onClick={sendOrder}
            className="w-full mt-4 bg-[#ff7a00] py-3 rounded-xl text-black font-semibold"
          >
            Send Order
          </button>
        </div>

        {/* POPUP (FIXED DESIGN) */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-5">

              <h2 className="text-xl">{selectedItem.name}</h2>

              <div>
                <div className="text-sm mb-2">Doneness</div>
                <div className="grid grid-cols-2 gap-2">
                  {donenessOptions.map((o) => (
                    <button
                      key={o}
                      onClick={() => setSelectedModifier(o)}
                      className="p-2 bg-white/10 rounded-xl"
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm mb-2">Side</div>
                <div className="grid grid-cols-2 gap-2">
                  {sideOptions.map((o) => (
                    <button
                      key={o}
                      onClick={() => setSelectedSide(o)}
                      className="p-2 bg-white/10 rounded-xl"
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm mb-2">Sauce</div>
                <div className="grid grid-cols-2 gap-2">
                  {sauceOptions.map((o) => (
                    <button
                      key={o}
                      onClick={() => setSelectedSauce(o)}
                      className="p-2 bg-white/10 rounded-xl"
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
                onClick={() => setSelectedItem(null)}
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