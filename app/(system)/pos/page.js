"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";
import PageWrapper from "@/components/PageWrapper";

export default function POSPage() {
  const [tenantId, setTenantId] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [selectedTable, setSelectedTable] = useState("T1");
  const [category, setCategory] = useState("starter");
  const [menu, setMenu] = useState([]);
  const [user, setUser] = useState(null);
  const [sending, setSending] = useState(false);

  // ===== LOAD MENU =====
  const loadMenu = async () => {
    if (!tenantId) return;

    const { data: dishes, error: dishError } = await supabase
      .from("dishes")
      .select("*")
      .eq("tenant_id", tenantId);

    if (dishError) {
      console.error("MENU LOAD ERROR:", dishError);
      setMenu([]);
      return;
    }

    const { data: stockData, error: stockError } = await supabase
      .from("dish_stock")
      .select("dish_id, quantity")
      .eq("tenant_id", tenantId);

    if (stockError) {
      console.error("STOCK LOAD ERROR:", stockError);
      setMenu([]);
      return;
    }

    const stockMap = {};
    for (const stock of stockData || []) {
      stockMap[stock.dish_id] = Number(stock.quantity || 0);
    }

    const mergedMenu = (dishes || []).map((dish) => ({
      ...dish,
      stock: stockMap[dish.id] ?? 0,
    }));

    setMenu(mergedMenu);
  };

  // ===== LOAD USER =====
  useEffect(() => {
    const loadUserAndTenant = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setUser(user);

      const { data, error } = await supabase
        .from("staff_accounts")
        .select("tenant_id")
        .eq("auth_user_id", user.id)
        .single();

      if (error || !data?.tenant_id) {
        console.error("Tenant not found for POS user");
        return;
      }

      setTenantId(data.tenant_id);
    };

    loadUserAndTenant();
  }, []);

 // ===== REALTIME STOCK =====
useEffect(() => {
  if (!tenantId) return;

  loadMenu();

  const interval = setInterval(() => {
    loadMenu();
  }, 2000);

  const channel = supabase
    .channel("dish-stock-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "dish_stock",
        filter: `tenant_id=eq.${tenantId}`,
      },
      () => {
        loadMenu();
      }
    )
    .subscribe();

  return () => {
    clearInterval(interval);
    supabase.removeChannel(channel);
  };

}, [tenantId]);

  const getSelectedQuantity = (dishId) => {
    const existingItem = orderItems.find((item) => item.dish_id === dishId);
    return Number(existingItem?.quantity || 0);
  };

  // ===== ADD ITEM =====
  const addItem = (item) => {
    const stock = Number(item.stock || 0);
    const alreadySelected = getSelectedQuantity(item.id);

    if (stock <= 0) {
      alert("This dish is out of stock");
      return;
    }

    if (alreadySelected >= stock) {
      alert(`Only ${stock} available`);
      return;
    }

    const existingItem = orderItems.find(
      (orderItem) => orderItem.dish_id === item.id
    );

    if (existingItem) {
      setOrderItems((prev) =>
        prev.map((orderItem) =>
          orderItem.dish_id === item.id
            ? {
                ...orderItem,
                quantity: Number(orderItem.quantity || 1) + 1,
              }
            : orderItem
        )
      );
      return;
    }

    setOrderItems((prev) => [
      ...prev,
      {
        dish_id: item.id,
        item_name: item.name,
        price: Number(item.price || 0),
        quantity: 1,
      },
    ]);
  };

  // ===== REMOVE ITEM =====
  const removeItem = (dishId) => {
    setOrderItems((prev) =>
      prev
        .map((item) =>
          item.dish_id === dishId
            ? { ...item, quantity: Number(item.quantity || 1) - 1 }
            : item
        )
        .filter((item) => Number(item.quantity || 0) > 0)
    );
  };

  const total = orderItems.reduce(
    (sum, item) =>
      sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );

  // ===== STOCK VALIDATION =====
  const validateStockBeforeSend = async () => {
    if (!tenantId) {
      alert("Tenant not loaded");
      return false;
    }

    const dishIds = orderItems.map((item) => item.dish_id);

    const { data: stockData, error } = await supabase
      .from("dish_stock")
      .select("dish_id, quantity")
      .eq("tenant_id", tenantId)
      .in("dish_id", dishIds);

    if (error) {
      console.error("STOCK VALIDATION ERROR:", error);
      alert("Could not validate stock");
      return false;
    }

    const stockMap = {};
    for (const stock of stockData || []) {
      stockMap[stock.dish_id] = Number(stock.quantity || 0);
    }

    for (const item of orderItems) {
      const available = stockMap[item.dish_id] || 0;
      const needed = Number(item.quantity || 1);

      if (available < needed) {
        alert(`Not enough stock for ${item.item_name}. Available: ${available}`);
        await loadMenu();
        return false;
      }
    }

    return true;
  };

  // ===== SEND ORDER =====
  const sendOrder = async () => {
    if (orderItems.length === 0 || sending) return;

    if (!tenantId) {
      alert("Tenant not loaded");
      return;
    }

    setSending(true);

    const stockOk = await validateStockBeforeSend();

    if (!stockOk) {
      setSending(false);
      return;
    }

    const response = await fetch("/api/pos/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        table: selectedTable,
        items: orderItems,
        total,
        staff_id: user?.id,
staff_name: user?.email || "Unknown",
        tenant_id: tenantId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "Order failed");
      setSending(false);
      return;
    }

    setOrderItems([]);
    await loadMenu();
    setSending(false);
  };

  const filteredMenu = menu.filter((item) => {
    if (!item.category) return true;
    return item.category === category;
  });

  // ===== UI =====
  return (
    <PageWrapper title="POS" subtitle="Order system">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* LEFT SIDE */}
        <div className="space-y-6">

          <div className="grid grid-cols-3 gap-3">
            {["T1","T2","T3","T4","T5","T6"].map((table) => (
              <button
                key={table}
                onClick={() => setSelectedTable(table)}
                className={`glass p-3 rounded-xl ${
                  selectedTable === table
                    ? "border border-orange-500 text-orange-400"
                    : ""
                }`}
              >
                {table}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {["starter","main","dessert"].map((menuCategory) => (
              <button
                key={menuCategory}
                onClick={() => setCategory(menuCategory)}
                className={`glass px-3 py-1 rounded ${
                  category === menuCategory
                    ? "border border-orange-500 text-orange-400"
                    : ""
                }`}
              >
                {menuCategory}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredMenu.map((item) => {
              const stock = Number(item.stock || 0);
              const selected = getSelectedQuantity(item.id);
              const availableToAdd = stock - selected;
              const outOfStock = stock <= 0;
              const maxSelected = selected >= stock;

              return (
                <div
                  key={item.id}
                  onClick={() => addItem(item)}
                  className={`glass p-3 rounded-xl ${
                    outOfStock || maxSelected
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-white/5 cursor-pointer"
                  }`}
                >
                  <div className="flex justify-between">
                    <span>{item.name}</span>
                    <span className="text-xs text-muted">
                      {outOfStock
                        ? "OUT"
                        : maxSelected
                        ? "MAX"
                        : `${availableToAdd} left`}
                    </span>
                  </div>

                  <div className="text-xs text-muted">
                    ฿{Number(item.price || 0)}
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* RIGHT SIDE */}
        <div className="glass p-6 rounded-2xl space-y-4">

          <h2>Table {selectedTable}</h2>

          {orderItems.length === 0 && (
            <div className="text-muted text-sm">No items selected</div>
          )}

          {orderItems.map((item) => (
            <div key={item.dish_id} className="flex justify-between text-sm">
              <div>{item.item_name} x{item.quantity}</div>

              <div className="flex gap-3 items-center">
                <span>฿{Number(item.price || 0) * item.quantity}</span>

                <button
                  onClick={() => removeItem(item.dish_id)}
                  className="text-red-400"
                >
                  −
                </button>
              </div>
            </div>
          ))}

          <div className="text-lg">Total: ฿{total}</div>

          <button className="glass p-2 rounded-xl">
            REQUEST ADJUSTMENT
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button className="glass p-2 rounded-xl">HOLD</button>

            <button
              onClick={sendOrder}
              disabled={orderItems.length === 0 || sending}
              className="glass p-2 rounded-xl"
            >
              FIRE
            </button>
          </div>

          <button
            onClick={sendOrder}
            disabled={orderItems.length === 0 || sending}
            className="btn-primary w-full"
          >
            {sending ? "SENDING..." : "SEND ORDER"}
          </button>

          <button className="glass p-2 rounded-xl">
            FIRE HELD
          </button>

        </div>

      </div>

    </PageWrapper>
  );
}