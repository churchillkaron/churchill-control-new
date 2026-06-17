"use client";
import { subscribe } from "@/lib/pos/core/posEventEngine";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/app/providers/TenantProvider";

export default function BarPage() {

  const tenant = useTenant();
  const tenantId = tenant?.id;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadBar() {
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
        order_items: (order.order_items || []).filter(item =>
          item.station === "BAR" &&
          ["PENDING","PREPARING","READY"].includes(item.status)
        )
      }));

    setOrders(filtered);
    setLoading(false);
  }

  useEffect(() => {
    loadBar();

    const interval = setInterval(() => {
      loadBar();
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

    loadBar();
  }

  const barItems = useMemo(() => {
    return orders.flatMap(o => o.order_items || []);
  }, [orders]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading bar...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <h1 className="text-3xl font-bold mb-6">Bar</h1>

      {barItems.map((item, i) => (
        <div key={i} className="p-4 border-b border-white/10">
          <div>{item.name}</div>
          <div className="text-sm text-white/50">{item.status}</div>

          <button
            onClick={() => updateItemStatus(item, "READY")}
            className="mt-2 px-3 py-1 bg-blue-600 rounded"
          >
            Ready
          </button>
        </div>
      ))}
    </div>
  );
}
  // ===== EVENT SYNC (BAR) =====
  useEffect(() => {

    const unsub = subscribe("BAR", () => {
      loadBar();
    });

    return () => unsub();

  }, []);

