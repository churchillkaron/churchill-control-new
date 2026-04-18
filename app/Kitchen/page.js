"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function Kitchen() {
  const [orders, setOrders] = useState([]);
  const [role, setRole] = useState("");

  const drinkItems = ["Beer", "Water"];

  const isDrink = (name) => drinkItems.includes(name);

  const filterItemsByRole = (items) => {
    if (role === "BAR") return items.filter((i) => isDrink(i.name));
    if (role === "KITCHEN") return items.filter((i) => !isDrink(i.name));
    return items;
  };

  const fetchOrders = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .neq("status", "Paid")
      .order("created_at", { ascending: false });

    setOrders(data || []);
  };

  useEffect(() => {
    const staffRole = localStorage.getItem("staffRole");

    if (!staffRole) {
      window.location.href = "/";
      return;
    }

    setRole(staffRole);

    fetchOrders();

    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchOrders()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const updateStatus = async (order) => {
    let next = order.status;

    if (order.status === "Active") next = "Preparing";
    else if (order.status === "Preparing") next = "Served";
    else return;

    await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", order.id);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-6">

      <h1 className="text-3xl font-semibold">
        {role === "BAR" ? "Bar Screen" : "Kitchen Screen"}
      </h1>

      <div className="grid md:grid-cols-3 gap-6">

        {orders.map((order) => {
          const filtered = filterItemsByRole(order.items || []);

          if (filtered.length === 0) return null;

          return (
            <div
              key={order.id}
              className="bg-white/10 p-4 rounded-xl"
            >

              <div className="flex justify-between mb-2">
                <div>Table {order.table_name}</div>
                <div className="text-[#ff7a00]">{order.status}</div>
              </div>

              <div className="space-y-1 text-sm mb-3">
                {filtered.map((item, i) => (
                  <div key={i}>
                    {item.name} x{item.qty || 1}
                  </div>
                ))}
              </div>

              <button
                onClick={() => updateStatus(order)}
                className="w-full bg-[#ff7a00] py-2 rounded-xl text-black"
              >
                Next Step
              </button>

            </div>
          );
        })}

      </div>

    </div>
  );
}