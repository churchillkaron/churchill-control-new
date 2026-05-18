"use client";

import { useEffect, useState } from "react";

const STATUS_COLORS = {

  OPEN:
    "border-red-500",

  IN_PROGRESS:
    "border-yellow-500",

  READY:
    "border-green-500",
};

export default function KitchenPage() {

  const [
    orders,
    setOrders,
  ] = useState([]);

  async function loadOrders() {

    const res =
      await fetch(
        "/api/pos/kitchen?tenant_id=demo"
      );

    const json =
      await res.json();

    setOrders(
      json.orders || []
    );
  }

  async function updateStatus(
    order_id,
    status
  ) {

    await fetch(
      "/api/pos/kitchen",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          order_id,
          status,
        }),
      }
    );

    loadOrders();
  }

  useEffect(() => {

    loadOrders();

    const interval =
      setInterval(
        loadOrders,
        5000
      );

    return () =>
      clearInterval(
        interval
      );

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              Kitchen Display
            </h1>

            <div className="text-zinc-500 mt-3">
              Realtime Kitchen Production Flow
            </div>

          </div>

          <button
            onClick={
              loadOrders
            }
            className="border border-zinc-700 rounded-2xl px-6 py-3"
          >
            Refresh
          </button>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {orders.map(
            (
              order
            ) => (

              <div
                key={order.id}
                className={`border-2 rounded-3xl p-6 ${
                  STATUS_COLORS[
                    order.status
                  ] ||
                  "border-zinc-800"
                }`}
              >

                <div className="flex items-center justify-between mb-6">

                  <div>

                    <div className="text-2xl font-bold">
                      {
                        order.order_number
                      }
                    </div>

                    <div className="text-zinc-500 mt-1">
                      Table:
                      {" "}
                      {
                        order.table_number ||
                        "-"
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-sm text-zinc-500">
                      Status
                    </div>

                    <div className="text-lg">
                      {
                        order.status
                      }
                    </div>

                  </div>

                </div>

                <div className="space-y-4">

                  {order.pos_order_items?.map(
                    (
                      item
                    ) => (

                      <div
                        key={
                          item.id
                        }
                        className="border border-zinc-800 rounded-2xl p-4"
                      >

                        <div className="flex justify-between">

                          <div className="text-xl">
                            {
                              item.item_name
                            }
                          </div>

                          <div className="text-xl">
                            x
                            {
                              item.quantity
                            }
                          </div>

                        </div>

                        {item.notes && (

                          <div className="text-zinc-500 mt-3">
                            {
                              item.notes
                            }
                          </div>
                        )}

                      </div>
                    )
                  )}

                </div>

                <div className="grid grid-cols-3 gap-3 mt-6">

                  <button
                    onClick={() =>
                      updateStatus(
                        order.id,
                        "OPEN"
                      )
                    }
                    className="border border-red-500 rounded-xl py-3"
                  >
                    OPEN
                  </button>

                  <button
                    onClick={() =>
                      updateStatus(
                        order.id,
                        "IN_PROGRESS"
                      )
                    }
                    className="border border-yellow-500 rounded-xl py-3"
                  >
                    COOKING
                  </button>

                  <button
                    onClick={() =>
                      updateStatus(
                        order.id,
                        "READY"
                      )
                    }
                    className="border border-green-500 rounded-xl py-3"
                  >
                    READY
                  </button>

                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
