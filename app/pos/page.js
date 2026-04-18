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
    { name: "Churchill Beef Short Ribs", price: 890, station: "WESTERN" },
    {
      name: "Ribeye Steak",
      price: 890,
      station: "WESTERN",
      needsPopup: true,
      needsDoneness: true,
      needsSide: true,
      needsSauce: true,
    },
    {
      name: "Beef Tenderloin",
      price: 920,
      station: "WESTERN",
      needsPopup: true,
      needsDoneness: true,
      needsSide: true,
      needsSauce: true,
    },
    {
      name: "Pork Tenderloin",
      price: 460,
      station: "WESTERN",
      needsPopup: true,
      needsDoneness: false,
      needsSide: true,
      needsSauce: true,
    },
    {
      name: "Salmon",
      price: 690,
      station: "WESTERN",
      needsPopup: true,
      needsDoneness: false,
      needsSide: true,
      needsSauce: true,
    },
    { name: "Churchill Sambal Half Chicken", price: 590, station: "WESTERN" },
    { name: "Veal Stew", price: 850, station: "WESTERN" },
  ],
  "Thai Food": [
    { name: "Pad Thai", price: 160, station: "THAI" },
    { name: "Pad Ka Prow", price: 150, station: "THAI" },
    { name: "Stir-Fried Chicken with Cashew Nuts", price: 180, station: "THAI" },
    { name: "Beef with Oyster Sauce", price: 220, station: "THAI" },
    { name: "Massaman Curry", price: 180, station: "THAI" },
    { name: "Green Curry", price: 170, station: "THAI" },
    { name: "Panang Curry", price: 175, station: "THAI" },
    { name: "Pineapple Fried Rice", price: 160, station: "THAI" },
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

    setCart((prev) => [
      ...prev,
      {
        name: item.name,
        price: item.price,
        station: item.station,
        qty: 1,
        modifier: "",
        side: "",
        sauce: "",
      },
    ]);
  };

  const addConfiguredItemToCart = () => {
    if (!selectedItem) return;

    const newItem = {
      name: selectedItem.name,
      price: selectedItem.price,
      station: selectedItem.station,
      qty: 1,
      modifier: selectedModifier,
      side: selectedSide,
      sauce: selectedSauce,
    };

    setCart((prev) => [...prev, newItem]);
    setSelectedItem(null);
    setSelectedModifier("");
    setSelectedSide("");
    setSelectedSauce("");
  };

  const increaseQty = (index) => {
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, qty: item.qty + 1 } : item
      )
    );
  };

  const decreaseQty = (index) => {
    setCart((prev) =>
      prev
        .map((item, i) =>
          i === index ? { ...item, qty: item.qty - 1 } : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const sendOrder = () => {
    if (!table.trim() || cart.length === 0) {
      alert("Select table and add items");
      return;
    }

    const staffName = localStorage.getItem("staffName") || "Unknown";
    const existingOrders = JSON.parse(localStorage.getItem("orders") || "[]");

    const groupedByStation = {};

    cart.forEach((item) => {
      const station = item.station || "WESTERN";

      if (!groupedByStation[station]) {
        groupedByStation[station] = [];
      }

      groupedByStation[station].push({
        name: item.name,
        qty: item.qty,
        station,
        modifier: item.modifier || "",
        side: item.side || "",
        sauce: item.sauce || "",
      });
    });

    const newOrders = Object.keys(groupedByStation).map((station) => ({
      id: Date.now() + Math.random(),
      table,
      table_name: table,
      staff: staffName,
      station,
      status: "NEW",
      created_at: new Date().toISOString(),
      items: groupedByStation[station],
    }));

    localStorage.setItem("orders", JSON.stringify([...existingOrders, ...newOrders]));
    setCart([]);
    alert("Order sent");
  };

  const payOrder = () => {
    if (!table.trim() || cart.length === 0) {
      alert("Select table and add items");
      return;
    }

    const staffName = localStorage.getItem("staffName") || "Unknown";
    const existingOrders = JSON.parse(localStorage.getItem("orders") || "[]");

    const groupedByStation = {};

    cart.forEach((item) => {
      const station = item.station || "WESTERN";

      if (!groupedByStation[station]) {
        groupedByStation[station] = [];
      }

      groupedByStation[station].push({
        name: item.name,
        qty: item.qty,
        station,
        modifier: item.modifier || "",
        side: item.side || "",
        sauce: item.sauce || "",
      });
    });

    const paidOrders = Object.keys(groupedByStation).map((station) => ({
      id: Date.now() + Math.random(),
      table,
      table_name: table,
      staff: staffName,
      station,
      status: "Paid",
      created_at: new Date().toISOString(),
      items: groupedByStation[station],
      total: groupedByStation[station].reduce((sum, item) => {
        const found =
          Object.values(menu)
            .flat()
            .find((m) => m.name === item.name)?.price || 0;
        return sum + found * item.qty;
      }, 0),
    }));

    localStorage.setItem("orders", JSON.stringify([...existingOrders, ...paidOrders]));
    setCart([]);
    alert("Payment completed");
  };

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

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_400px] gap-6 items-start">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {currentMenu.length === 0 && (
              <div className="text-white/40 rounded-xl bg-white/5 p-4">
                No items yet
              </div>
            )}

            {currentMenu.map((item) => (
              <button
                key={item.name}
                onClick={() => handleMenuClick(item)}
                className="p-4 rounded-2xl bg-white/10 border border-white/10 text-left hover:bg-white/15 transition"
              >
                <div className="font-medium">{item.name}</div>
                <div className="text-white/60 text-sm mt-1">
                  THB {item.price}
                </div>
              </button>
            ))}
          </div>

          <div className="bg-white/5 border border-white/10 p-5 rounded-2xl h-[560px] flex flex-col">
            <h2 className="text-xl font-semibold">Cart</h2>

            <div className="flex-1 overflow-y-auto space-y-3 mt-4">
              {cart.length === 0 && (
                <div className="text-white/40">No items added</div>
              )}

              {cart.map((item, index) => (
                <div
                  key={`${item.name}-${index}`}
                  className="border-b border-white/10 pb-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div>{item.name}</div>

                      {(item.modifier || item.side || item.sauce) && (
                        <div className="text-white/50 text-sm mt-1">
                          {item.modifier ? `• ${item.modifier} ` : ""}
                          {item.side ? `• ${item.side} ` : ""}
                          {item.sauce ? `• ${item.sauce}` : ""}
                        </div>
                      )}

                      <div className="text-white/50 text-sm mt-1">
                        THB {item.price} x {item.qty}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decreaseQty(index)}
                        className="w-8 h-8 rounded-lg bg-white/10"
                      >
                        -
                      </button>
                      <div className="w-8 text-center">{item.qty}</div>
                      <button
                        onClick={() => increaseQty(index)}
                        className="w-8 h-8 rounded-lg bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10 text-lg font-semibold">
              Total: THB {total}
            </div>

            <div className="grid gap-3 mt-4">
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

        {selectedItem && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-5">
              <div>
                <h2 className="text-xl font-semibold">{selectedItem.name}</h2>
                <p className="text-white/50 text-sm mt-1">
                  THB {selectedItem.price}
                </p>
              </div>

              {selectedItem.needsDoneness && (
                <div>
                  <div className="text-sm text-white/60 mb-2">Doneness</div>
                  <div className="grid grid-cols-2 gap-2">
                    {donenessOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => setSelectedModifier(option)}
                        className={`p-2 rounded-xl ${
                          selectedModifier === option
                            ? "bg-[#ff7a00] text-black"
                            : "bg-white/10"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedItem.needsSide && (
                <div>
                  <div className="text-sm text-white/60 mb-2">Side</div>
                  <div className="grid grid-cols-2 gap-2">
                    {sideOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => setSelectedSide(option)}
                        className={`p-2 rounded-xl ${
                          selectedSide === option
                            ? "bg-[#ff7a00] text-black"
                            : "bg-white/10"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedItem.needsSauce && (
                <div>
                  <div className="text-sm text-white/60 mb-2">Sauce</div>
                  <div className="grid grid-cols-2 gap-2">
                    {sauceOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => setSelectedSauce(option)}
                        className={`p-2 rounded-xl ${
                          selectedSauce === option
                            ? "bg-[#ff7a00] text-black"
                            : "bg-white/10"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 pt-2">
                <button
                  onClick={addConfiguredItemToCart}
                  className="w-full bg-[#ff7a00] py-3 rounded-xl text-black font-semibold"
                >
                  Add to Cart
                </button>

                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setSelectedModifier("");
                    setSelectedSide("");
                    setSelectedSauce("");
                  }}
                  className="w-full bg-white/10 py-3 rounded-xl text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}