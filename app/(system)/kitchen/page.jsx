"use client";
import { subscribe } from "@/lib/pos/core/posEventEngine";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/app/providers/TenantProvider";

export default function KitchenPage() {

  const tenant = useTenant();
  const tenantId = tenant?.id;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadKitchen() {
    if (!tenantId) return;

    setLoading(true);

    const res = await fetch("/api/pos/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId })
    });

    const json = await res.json();

    const filtered =
      (json.data || []).map(order => ({
        ...order,
        order_items: (order.order_items || []).filter(item => {
          const active = ["PENDING","PREPARING","READY"];
          return active.includes(item.status);
        })
      }));

    setOrders(filtered);
    setLoading(false);
  }

  useEffect(() => {
    loadKitchen();

    const interval = setInterval(() => {
      loadKitchen();
    }, 5000);

    return () => clearInterval(interval);
  }, [tenantId]);

  async function updateItemStatus(item, nextStatus) {
    await fetch("/api/pos/orders/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        status: nextStatus,
        tenantId
      })
    });

    loadKitchen();
  }

  const kitchenItems = useMemo(() => {
    return orders.flatMap(o => o.order_items || []);
  }, [orders]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading kitchen...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <h1 className="text-3xl font-bold mb-6">Kitchen</h1>

      {kitchenItems.map((item, i) => (
        <div key={i} className="p-4 border-b border-white/10">
          <div>{item.name}</div>
          <div className="text-sm text-white/50">{item.status}</div>

          <button
            onClick={() => updateItemStatus(item, "READY")}
            className="mt-2 px-3 py-1 bg-green-600 rounded"
          >
            Done
          </button>
        </div>
      ))}
    </div>
  );
}