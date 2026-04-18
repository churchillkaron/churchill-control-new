"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function Kitchen() {
  const [orders, setOrders] = useState([]);

  // 🔥 LOAD INITIAL ORDERS
  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .neq("status", "Paid")
      .order("created_at", { ascending: false });

    if (!error) {
      setOrders(data || []);
    }
  };

  useEffect(() => {
    fetchOrders();

    // 🔥 REALTIME SUBSCRIPTION
    const channel = supabase
      .channel("orders-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          fetchOrders(); // refresh on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 🔥 UPDATE STATUS IN DB
  const updateStatus = async (order) => {
    let next = order.status;

    if (order.status === "Active") next = "Preparing";
    else if (order.status === "Preparing") next = "Served";
    else return;

    const { error } = await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", order.id);

    if (error) {
      console.error(error);
      alert("Error updating status");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-6">

      <h1 className="text-3xl font-semibold">
        Kitchen Screen
      </h1>

      <div className="grid md:grid-cols-3 gap-6">

        {orders.map((order) => (
          <div
            key={order.id}
            className="bg-white/10 p-4 rounded-xl"
          >

            <div className="flex justify-between mb-2">
              <div>Table {order.table_name}</div>
              <div className="text-[#ff7a00]">{order.status}</div>
            </div>

            <div className="space-y-1 text-sm mb-3">
              {(order.items || []).map((item, i) => (
                <div key={i}>
                  {item.name} x{item.qty || 1}
                </div>
              ))}
            </div>

            <button