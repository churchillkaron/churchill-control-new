"use client";

import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/app/providers/TenantProvider";
import { loadWaiterData } from "@/lib/pos/waiter/loadWaiterData";
import { groupMenuByCategory } from "@/lib/pos/waiter/groupMenuByCategory";

export default function POSFinalUI() {
  const tenant = useTenant();
  const tenantId = tenant?.id;

  const [data, setData] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeTable, setActiveTable] = useState(null);

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [guestPopup, setGuestPopup] = useState(false);
  const [guests, setGuests] = useState(0);

  const [customerPopup, setCustomerPopup] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [editingItem, setEditingItem] = useState(null);
  const [itemNotes, setItemNotes] = useState("");
  const [itemCookingLevel, setItemCookingLevel] = useState("");

  useEffect(() => {
    if (!tenantId) return;

    loadWaiterData(tenantId).then((loaded) => {
      setData(loaded);

      const grouped =
        groupMenuByCategory(loaded?.dishes || []);

      const firstCategory =
        Object.keys(grouped)[0] || null;

      setActiveCategory(firstCategory);
    });
  }, [tenantId]);

  const tables =
    data?.tables || [];

  const groupedMenu =
    useMemo(() => {
      return groupMenuByCategory(
        data?.dishes || []
      );
    }, [data]);

  const categories =
    Object.keys(groupedMenu || []);

  const currentCategory =
    activeCategory || categories[0];

  const currentDishes =
    groupedMenu[currentCategory] || [];

  const cartCount =
    cart.length;

  const cartTotal =
    cart.reduce(
      (sum, item) =>
        sum + Number(item.price || 0),
      0
    );

  async function reloadData(tableId) {
    if (!tenantId) return null;

    const refreshed =
      await loadWaiterData(tenantId);

    setData(refreshed);

    if (!tableId) return null;

    return (
      refreshed.tables.find(
        (table) => table.id === tableId
      ) || null
    );
  }

  function startTable(table) {
    setActiveTable(table);

    if (
      table.status === "OCCUPIED" ||
      Number(table.current_guests || 0) > 0
    ) {
      setGuests(
        Number(table.current_guests || 0)
      );
      setGuestPopup(false);
      setCustomerPopup(true);
      return;
    }

    setGuestPopup(true);
  }

  async function confirmGuests(amount) {
    if (!activeTable) return;

    await fetch(
      "/api/pos/table-management/open",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          table_id: activeTable.id,
          opened_by: "WAITER",
          guests: amount,
        }),
      }
    );

    const updatedTable =
      await reloadData(activeTable.id);

    if (updatedTable) {
      setActiveTable(updatedTable);
    }

    setGuests(amount);
    setGuestPopup(false);
    setCustomerPopup(true);
  }

  async function searchCustomer() {
    const res = await fetch(
      "/api/customers/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          query: customerSearch,
        }),
      }
    );

    const json =
      await res.json();

    setCustomerResults(
      json.customers || []
    );
  }

  async function createCustomer() {
    const name =
      customerSearch.trim();

    if (!name) return;

    const res = await fetch(
      "/api/customers/upsert",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          customer_name: name,
          customer_phone: null,
          customer_email: null,
        }),
      }
    );

    const json =
      await res.json();

    if (json.customer) {
      setSelectedCustomer(json.customer);
      setCustomerPopup(false);
    }
  }

  function selectWalkIn() {
    setSelectedCustomer(null);
    setCustomerPopup(false);
  }

  function addToCart(dish) {
    setCart((prev) => [
      ...prev,
      {
        ...dish,
        cartRowId:
          `${dish.id}-${Date.now()}-${Math.random()}`,
        qty: 1,
        notes: "",
        cookingLevel: "",
      },
    ]);
    setCartOpen(true);
  }

  function removeCartItem(cartRowId) {
    setCart((prev) =>
      prev.filter(
        (item) =>
          item.cartRowId !== cartRowId
      )
    );
  }

  function openItemEditor(item) {
    setEditingItem(item);
    setItemNotes(item.notes || "");
    setItemCookingLevel(
      item.cookingLevel || ""
    );
  }

  function saveItemEditor() {
    if (!editingItem) return;

    setCart((prev) =>
      prev.map((item) =>
        item.cartRowId ===
        editingItem.cartRowId
          ? {
              ...item,
              notes: itemNotes,
              cookingLevel:
                itemCookingLevel,
            }
          : item
      )
    );

    setEditingItem(null);
    setItemNotes("");
    setItemCookingLevel("");
  }

  async function sendOrder() {
    if (!activeTable) {
      setGuestPopup(true);
      return;
    }

    if (!cart.length) return;

    await fetch("/api/pos/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        table: activeTable.table_name,
        items: cart.map((item) => ({
          id: item.id,
          dish_id: item.id,
          item_name: item.name,
          name: item.name,
          price: Number(item.price || 0),
          quantity: 1,
          notes: item.notes || null,
          cookingLevel:
            item.cookingLevel || null,
          cooking_level:
            item.cookingLevel || null,
          station:
            item.station || "HOT",
        })),
        total: cartTotal,
        customerName:
          selectedCustomer?.customer_name ||
          null,
        customerPhone:
          selectedCustomer?.customer_phone ||
          null,
        customerEmail:
          selectedCustomer?.customer_email ||
          null,
        staff_id: null,
        staff_name: "WAITER",
        tenant_id: tenantId,
      }),
    });

    setCart([]);
    setCartOpen(false);
    await reloadData(activeTable.id);
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-4">
      <div className="relative h-[844px] w-[390px] overflow-hidden rounded-[42px] border border-white/10 bg-[#0b0b0b] shadow-2xl">

        <div className="absolute inset-x-0 top-0 z-10 bg-[#0b0b0b]/95 backdrop-blur">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div>
              <div className="text-lg font-semibold tracking-wide">
                Churchill POS
              </div>
              <div className="text-[11px] text-white/45">
                {activeTable
                  ? `${activeTable.table_name} • ${guests || "-"} guests`
                  : "Select table"}
              </div>
            </div>

            <button
              onClick={() => setCartOpen(true)}
              className="relative rounded-2xl bg-[#D6A66A] px-4 py-2 text-xs font-bold text-black"
            >
              Cart {cartCount}
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto border-y border-white/10 px-3 py-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs ${
                  currentCategory === category
                    ? "bg-[#D6A66A] text-black"
                    : "bg-white/10 text-white/70"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="flex h-full pt-[106px]">

          <div className="flex-1 overflow-auto p-3 pr-2 pb-28">
            <div className="grid grid-cols-3 gap-2">
              {currentDishes.map((dish) => (
                <button
                  key={dish.id}
                  onClick={() => addToCart(dish)}
                  className="aspect-square rounded-2xl border border-white/10 bg-white/[0.06] p-2 text-left transition active:scale-95"
                >
                  <div className="line-clamp-3 text-[12px] font-medium leading-tight">
                    {dish.name}
                  </div>

                  <div className="mt-2 text-[11px] text-[#D6A66A]">
                    ฿{Number(dish.price || 0)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="w-[54px] overflow-auto border-l border-white/10 bg-black/25 py-2">
            <div className="flex flex-col items-center gap-2">
              {tables.map((table) => {
                const active =
                  activeTable?.id === table.id;

                const occupied =
                  table.status === "OCCUPIED" ||
                  Number(table.current_guests || 0) > 0;

                return (
                  <button
                    key={table.id}
                    onClick={() => startTable(table)}
                    className={`h-10 w-10 rounded-xl text-[11px] font-semibold ${
                      active
                        ? "bg-[#D6A66A] text-black"
                        : occupied
                          ? "bg-green-500/20 text-green-300 border border-green-400/30"
                          : "bg-white/10 text-white/70"
                    }`}
                  >
                    {table.table_name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-[#0b0b0b]/95 p-3 backdrop-blur">
          <div className="flex gap-2">
            <button
              onClick={() => setCartOpen(true)}
              className="flex-1 rounded-2xl bg-white/10 py-3 text-xs"
            >
              {cartCount} Items • ฿{cartTotal}
            </button>

            <button
              onClick={sendOrder}
              className="flex-1 rounded-2xl bg-[#D6A66A] py-3 text-xs font-bold text-black"
            >
              SEND ORDER
            </button>
          </div>
        </div>

        {guestPopup && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-5">
            <div className="w-full rounded-3xl border border-white/10 bg-[#111] p-5">
              <div className="mb-4 text-center font-semibold">
                How many guests?
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => confirmGuests(amount)}
                    className="rounded-2xl bg-white/10 py-4 text-sm"
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {customerPopup && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-5">
            <div className="w-full rounded-3xl border border-white/10 bg-[#111] p-5">
              <div className="mb-4 text-center font-semibold">
                Customer
              </div>

              <input
                value={customerSearch}
                onChange={(event) =>
                  setCustomerSearch(event.target.value)
                }
                placeholder="Name, phone or email"
                className="mb-3 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm outline-none"
              />

              <div className="mb-4 flex gap-2">
                <button
                  onClick={searchCustomer}
                  className="flex-1 rounded-2xl bg-[#D6A66A] py-3 text-xs font-bold text-black"
                >
                  Search
                </button>

                <button
                  onClick={createCustomer}
                  className="flex-1 rounded-2xl bg-white/10 py-3 text-xs"
                >
                  Create
                </button>

                <button
                  onClick={selectWalkIn}
                  className="flex-1 rounded-2xl bg-white/10 py-3 text-xs"
                >
                  Walk-In
                </button>
              </div>

              <div className="max-h-56 space-y-2 overflow-auto">
                {customerResults.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setCustomerPopup(false);
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left"
                  >
                    <div className="text-sm font-medium">
                      {customer.customer_name}
                    </div>

                    <div className="text-[11px] text-white/50">
                      {customer.customer_phone || "No phone"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {cartOpen && (
          <div className="absolute inset-0 z-40 flex items-end bg-black/60">
            <div className="max-h-[72%] w-full rounded-t-[32px] border-t border-white/10 bg-[#111] p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    Current Order
                  </div>
                  <div className="text-[11px] text-white/45">
                    {activeTable?.table_name || "No table"} • {selectedCustomer?.customer_name || "Walk-In"}
                  </div>
                </div>

                <button
                  onClick={() => setCartOpen(false)}
                  className="text-white/50"
                >
                  ✕
                </button>
              </div>

              <div className="max-h-80 space-y-2 overflow-auto">
                {cart.map((item) => (
                  <div
                    key={item.cartRowId}
                    className="flex items-center justify-between rounded-2xl bg-white/[0.05] p-3"
                  >
                    <button
                      onClick={() => openItemEditor(item)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm">
                        {item.name}
                      </div>

                      {item.notes && (
                        <div className="text-[11px] text-orange-300">
                          📝 {item.notes}
                        </div>
                      )}

                      {item.cookingLevel && (
                        <div className="text-[11px] text-[#D6A66A]">
                          🔥 {item.cookingLevel}
                        </div>
                      )}
                    </button>

                    <button
                      onClick={() => removeCartItem(item.cartRowId)}
                      className="ml-2 h-8 w-8 rounded-xl bg-red-500/20 text-red-300"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setCart([])}
                  className="flex-1 rounded-2xl bg-white/10 py-3 text-xs"
                >
                  Clear
                </button>

                <button
                  onClick={sendOrder}
                  className="flex-1 rounded-2xl bg-[#D6A66A] py-3 text-xs font-bold text-black"
                >
                  Send ฿{cartTotal}
                </button>
              </div>
            </div>
          </div>
        )}

        {editingItem && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 p-5">
            <div className="w-full rounded-3xl border border-white/10 bg-[#111] p-5">
              <div className="mb-4 text-center font-semibold">
                Edit {editingItem.name}
              </div>

              <textarea
                value={itemNotes}
                onChange={(event) =>
                  setItemNotes(event.target.value)
                }
                placeholder="Notes: no tomato, allergy, extra sauce..."
                className="mb-4 h-24 w-full rounded-2xl bg-white/10 p-3 text-sm outline-none"
              />

              <div className="mb-2 text-xs text-white/50">
                Cooking Level
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2">
                {["Rare","Medium Rare","Medium","Medium Well","Well Done"].map((level) => (
                  <button
                    key={level}
                    onClick={() => setItemCookingLevel(level)}
                    className={`rounded-2xl py-3 text-xs ${
                      itemCookingLevel === level
                        ? "bg-[#D6A66A] text-black"
                        : "bg-white/10"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditingItem(null)}
                  className="flex-1 rounded-2xl bg-white/10 py-3 text-xs"
                >
                  Cancel
                </button>

                <button
                  onClick={saveItemEditor}
                  className="flex-1 rounded-2xl bg-[#D6A66A] py-3 text-xs font-bold text-black"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
