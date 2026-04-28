"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const ALL_STATIONS = ["THAI", "WESTERN", "PIZZA", "BAR", "DESSERT"];

function guessStation(name = "") {
  const text = name.toLowerCase();

  if (text.includes("tom yum") || text.includes("thai")) return "THAI";
  if (text.includes("pizza")) return "PIZZA";
  if (text.includes("cake") || text.includes("mango")) return "DESSERT";
  if (text.includes("beer") || text.includes("wine")) return "BAR";

  return "WESTERN";
}

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [currentStation, setCurrentStation] = useState(null);

  // 🔥 DEVICE LOCK (RUN ONCE)
  const getStation = () => {
    if (typeof window === "undefined") return null;

    let station = localStorage.getItem("kitchen_station");

    if (!station) {
      station = prompt(
        "Enter station: THAI, WESTERN, PIZZA, BAR, DESSERT"
      );

      if (station) {
        station = station.toUpperCase();
        localStorage.setItem("kitchen_station", station);
      }
    }

    return station;
  };

  useEffect(() => {
    const station = getStation();
    setCurrentStation(station);
  }, []);

  // 🔹 LOAD ORDERS
  const loadOrders = async () => {
    const { data: ordersData } = await supabase
      .from("orders")
      .select("*")
      .in("kitchen_status", ["pending", "cooking", "approved"])
      .order("created_at", { ascending: true });

    const { data: itemsData } = await supabase
      .from("order_items")
      .select("*");

    const merged = (ordersData || []).map((order) => ({
      ...order,
      items: (itemsData || []).filter((i) => i.order_id === order.id),
    }));

    setOrders(merged);
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 2000);
    return () => clearInterval(interval);
  }, []);

  // 🔹 UPDATE ITEM STATUS
  const updateItemStatus = async (ids, status) => {
    await supabase
      .from("order_items")
      .update({ status })
      .in("id", ids);

    loadOrders();
  };

  // 🔥 DONE HANDLER (CONNECTED TO BACKEND PRODUCTION)
  const handleDone = async (order, item) => {
    try {
      // mark items done
      await updateItemStatus(item.ids, "DONE");

      // trigger backend (production)
      await fetch("/api/kitchen/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: order.id,
          status: "done",
        }),
      });
    } catch (err) {
      console.error("HANDLE DONE ERROR:", err);
    }
  };

  return (
    <div className="space-y-10 text-white">
      <h1 className="text-3xl">Kitchen</h1>

      {/* 🔥 DEBUG / RESET */}
      <div className="text-xs text-white/40">
        Station: {currentStation || "Not set"}
        <button
          onClick={() => {
            localStorage.removeItem("kitchen_station");
            location.reload();
          }}
          className="ml-4 text-red-400"
        >
          Reset
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {(currentStation ? [currentStation] : ALL_STATIONS).map((station) => {
          const grouped = {};

          orders.forEach((order) => {
            const stationItems = (order.items || [])
              .map((item) => ({
                ...item,
                station: item.station || guessStation(item.item_name),
              }))
              .filter(
                (item) =>
                  item.station === station &&
                  item.status !== "DONE"
              );

            if (stationItems.length === 0) return;

            const table = order.table_number || "T1";

            if (!grouped[table]) grouped[table] = [];

            grouped[table].push({
              ...order,
              stationItems,
            });
          });

          return (
            <div key={station} className="space-y-4">
              <h2 className="text-xl font-semibold">{station}</h2>

              {Object.keys(grouped).length === 0 && (
                <div className="text-white/30 text-sm">
                  No tickets
                </div>
              )}

              {Object.entries(grouped).map(([table, tableOrders]) => (
                <div
                  key={table}
                  className="border border-white/10 rounded-2xl p-3 space-y-3 bg-white/5"
                >
                  <div className="font-semibold">Table {table}</div>

                  {tableOrders.map((order, index) => {
                    const groupedItems = {};

                    order.stationItems.forEach((item) => {
                      if (!groupedItems[item.item_name]) {
                        groupedItems[item.item_name] = {
                          name: item.item_name,
                          ids: [],
                          dish_id: item.dish_id, // 🔥 IMPORTANT
                          status: item.status || "PENDING",
                        };
                      }

                      groupedItems[item.item_name].ids.push(item.id);
                    });

                    const itemsArray = Object.values(groupedItems);
                    if (itemsArray.length === 0) return null;

                    return (
                      <div
                        key={order.id}
                        className="border rounded-xl p-3 space-y-2 bg-white/5"
                      >
                        <div className="text-sm">
                          Ticket {index + 1}
                        </div>

                        {itemsArray.map((item) => {
                          const isCooking =
                            item.status === "COOKING";

                          return (
                            <div key={item.name} className="space-y-1">
                              <div className="flex justify-between items-center">
                                <span>
                                  {item.ids.length}x {item.name}
                                </span>

                                <span className="text-xs text-white/50">
                                  {item.status}
                                </span>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    updateItemStatus(
                                      item.ids,
                                      "COOKING"
                                    )
                                  }
                                  disabled={isCooking}
                                  className={`px-2 py-1 text-xs rounded ${
                                    isCooking
                                      ? "bg-gray-600 cursor-not-allowed"
                                      : "bg-yellow-500"
                                  }`}
                                >
                                  Cooking
                                </button>

                                <button
                                  onClick={() =>
                                    handleDone(order, item)
                                  }
                                  className="bg-green-500 px-2 py-1 text-xs rounded"
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}