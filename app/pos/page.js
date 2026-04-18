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
    { name: "Beef Carpaccio", price: 320, station: "WESTERN", category: "Starter" },
    { name: "Chili & Garlic Prawns", price: 320, station: "WESTERN", category: "Starter" },
    { name: "Tom Yum Goong", price: 180, station: "THAI", category: "Starter" },
  ],
  "Main Course": [
    {
      name: "Ribeye Steak",
      price: 890,
      station: "WESTERN",
      category: "Main",
      needsPopup: true,
    },
    {
      name: "Beef Tenderloin",
      price: 920,
      station: "WESTERN",
      category: "Main",
      needsPopup: true,
    },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 160, station: "THAI", category: "Main" },
  ],
  Dessert: [],
};

const donenessOptions = ["Rare", "Medium Rare", "Medium", "Well Done"];
const sideOptions = ["Fries", "Salad", "Mashed Potato"];
const sauceOptions = ["Pepper", "Mushroom", "BBQ", "Red Wine"];

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState("Starter");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState("");

  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedDoneness, setSelectedDoneness] = useState("");
  const [selectedSide, setSelectedSide] = useState("");
  const [selectedSauce, setSelectedSauce] = useState("");

  const currentMenu = menu[activeCategory] || [];

  // add item (with popup if needed)
  const handleMenuClick = (item) => {
    if (item.needsPopup) {
      setSelectedItem(item);
      setSelectedDoneness("");
      setSelectedSide("");
      setSelectedSauce("");
      return;
    }

    addToCart(item, "", "", "");
  };

  const addToCart = (item, doneness, side, sauce) => {
    setCart((prev) => [
      ...prev,
      {
        name: item.name,
        price: item.price,
        station: item.station,
        category: item.category,
        qty: 1,
        doneness,
        side,
        sauce,
        hold: item.category !== "Starter",
      },
    ]);
  };

  // confirm popup item
  const confirmPopup = () => {
    if (!selectedItem) return;

    addToCart(
      selectedItem,
      selectedDoneness,
      selectedSide,
      selectedSauce
    );

    setSelectedItem(null);
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  // FIXED sendOrder
  const sendOrder = () => {
    if (!table.trim()) {
      alert("Add table");
      return;
    }

    if (cart.length === 0) {
      alert("Add items");
      return;
    }

    try {
      const existing = JSON.parse(localStorage.getItem("orders") || "[]");

      const newOrder = {
        id: Date.now(),
        table,
        status: "ACTIVE",
        total,
        created_at: new Date().toISOString(),

        items: cart.map((item, i) => ({
          id: Date.now() + i,
          name: item.name,
          price: item.price,
          qty: item.qty,
          station: item.station,
          category: item.category,
          hold: item.hold,
          status: "NEW",
          modifier: item.doneness,
          side: item.side,
          sauce: item.sauce,
        })),
      };

      localStorage.setItem(
        "orders",
        JSON.stringify([...existing, newOrder])
      );

      setCart([]);
      setTable("");

      alert("Order sent ✅");
    } catch (e) {
      console.error(e);
      alert("Error sending order");
    }
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
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-3 py-2 bg-white/10 rounded-xl"
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {currentMenu.map((item) => (
            <button
              key={item.name}
              onClick={() => handleMenuClick(item)}
              className="p-4 bg-white/10 rounded-xl text-left"
            >
              {item.name}
              <div className="text-sm text-white/50">
                {item.price} THB
              </div>
            </button>
          ))}
        </div>

        {/* CART */}
        <div className="bg-white/5 p-4 rounded-xl space-y-2">
          {cart.map((item, i) => (
            <div key={i} className="text-sm">
              {item.name} x{item.qty}
              {item.doneness && <div>• {item.doneness}</div>}
              {item.side && <div>• {item.side}</div>}
              {item.sauce && <div>• {item.sauce}</div>}
            </div>
          ))}

          <div className="font-semibold">Total: {total}</div>

          <button
            onClick={sendOrder}
            className="w-full bg-[#ff7a00] py-3 rounded-xl text-black font-semibold"
          >
            Send Order
          </button>
        </div>

        {/* POPUP */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
            <div className="bg-black p-6 rounded-xl space-y-4 w-80">

              <h2>{selectedItem.name}</h2>

              <div>
                <div>Doneness</div>
                {donenessOptions.map((o) => (
                  <button key={o} onClick={() => setSelectedDoneness(o)}>
                    {o}
                  </button>
                ))}
              </div>

              <div>
                <div>Side</div>
                {sideOptions.map((o) => (
                  <button key={o} onClick={() => setSelectedSide(o)}>
                    {o}
                  </button>
                ))}
              </div>

              <div>
                <div>Sauce</div>
                {sauceOptions.map((o) => (
                  <button key={o} onClick={() => setSelectedSauce(o)}>
                    {o}
                  </button>
                ))}
              </div>

              <button onClick={confirmPopup}>Add</button>
              <button onClick={() => setSelectedItem(null)}>Cancel</button>

            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}