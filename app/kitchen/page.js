"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import AppShell from "../AppShell";

export default function Kitchen() {
  const [orders, setOrders] = useState([]);
  const [role, setRole] = useState("");
  const audioRef = useRef(null);

  const drinkItems = ["Beer", "Water"];

  const isDrink = (name) => drinkItems.includes(name);

  const safeItems = (items) => {
    try {
      if (!items) return [];

      // if stored as string → parse
      if (typeof items === "string") {
        return JSON.parse(items);
      }

      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  };

  const filterItemsByRole = (items) => {
    const safe = safeItems(items);

    if (role === "BAR") return safe.filter((i) => isDrink(i.name));
    if (role === "KITCHEN") return safe.filter((i) => !isDrink(i.name));
    return safe;
  };

  const fetchOrders = async () => {
    try {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .neq("status", "Paid")
        .order("created_at", { ascending: false });

      setOrders(data || []);
    } catch (err) {
      console.error("Fetch failed:", err);
    }
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
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          fetchOrders();
          if (audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const updateStatus = async (order) => {
    try {
      let next = order.status;

      if (order.status === "Active") next = "Preparing";
      else if (order.status === "Preparing") next = "Served";
      else return;

      await supabase
        .from("orders")
        .update({ status: next })
        .eq("id", order.id);
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">

        <audio ref={audioRef} src="/alert.mp3" preload="auto" />

        <h1 className="text-3xl font-semibold">
          {role === "BAR" ? "Bar Screen" : "Kitchen Screen"}
        </h1>

        <div className="grid md:grid-cols-3 gap-6">

          {orders.map((order) => {
            const filtered = filterItemsByRole(order.items);

            if (!filtered.length) return null;

            return (
              <div key={order.id} className="bg-white/10 p-4 rounded-xl">

                <div className="flex justify-between mb-2">
                  <div>Table {order.table_name}</div>
                  <div className="text-[#ff7a00]">{order.status}</div>
                </div>

                <div className="space-y-1 text-sm mb-3">
                  {filtered.map((item, i) => (
                    <div key={i}>
                      {item?.name || "Unknown"} x{item?.qty || 1}
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
    </AppShell>
  );
}