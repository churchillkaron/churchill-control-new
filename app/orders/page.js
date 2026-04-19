"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(stored);
  }, []);

  const refresh = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(stored);
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        {/* Title */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl">Orders</h1>

          <button
            onClick={refresh}
            className="bg-white/10 px-4 py-2 rounded-xl hover:bg-white/20 transition text-sm"
          >
            Refresh
          </button>
        </div>

        {/* Orders */}
        <div className="space-y-6">

          {orders.length === 0 && (
            <div className="text-white/50">No orders yet</div>
          )}

          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4"
            >

              {/* Header */}
              <div className="flex justify-between items-center">
                <div className="text-lg">
                  Table: {order.table || "-"}
                </div>

                <div className="text-white/50 text-sm">
                  {new Date(order.created_at).toLocaleTimeString()}
                </div>
              </div>

              {/* Items */}
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white/5 rounded-xl p-3 flex justify-between"
                  >

                    <div>
                      <div>{item.name}</div>

                      {item.modifier && (
                        <div className="text-white/50 text-sm">
                          • {item.modifier}
                        </div>
                      )}

                      {item.side && (
                        <div className="text-white/50 text-sm">
                          • {item.side}
                        </div>
                      )}

                      {item.sauce && (
                        <div className="text-white/50 text-sm">
                          • {item.sauce}
                        </div>
                      )}
                    </div>

                    {/* Status */}
                    <div className="text-sm text-white/60">
                      {item.status}
                    </div>

                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="text-white/70 text-sm">
                Total: {order.total} THB
              </div>

            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}