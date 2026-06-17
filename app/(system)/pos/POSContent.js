"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/app/providers/TenantProvider";

export default function POSContent() {

  const tenant = useTenant();
  const tenantId = tenant?.id;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // =========================
  // LOAD ORDERS (API ONLY)
  // =========================
  async function loadOrders() {

    if (!tenantId) return;

    setLoading(true);

    try {

      const res = await fetch("/api/pos/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ tenantId })
      });

      const json = await res.json();

      setOrders(json.data || []);

    } catch (err) {

      console.error("POS LOAD ERROR", err);

    } finally {

      setLoading(false);

    }
  }

  useEffect(() => {
    loadOrders();
  }, [tenantId]);

  // =========================
  // CREATE ORDER (API ONLY)
  // =========================
  async function createOrder(payload) {

    try {

      await fetch("/api/pos/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tenantId,
          ...payload
        })
      });

      loadOrders();

    } catch (err) {
      console.error("CREATE ORDER ERROR", err);
    }
  }

  if (loading) {
    return (
      <div className="p-10 text-white">
        Loading POS...
      </div>
    );
  }

  return (
    <div className="p-6 text-white">

      <h1 className="text-2xl font-bold mb-6">
        POS System
      </h1>

      <div className="space-y-3">

        {orders.map(order => (
          <div
            key={order.id}
            className="p-4 bg-white/10 rounded-lg"
          >
            <div className="font-semibold">
              Table {order.table_number}
            </div>

            <div className="text-sm text-white/60">
              Status: {order.status}
            </div>
          </div>
        ))}

      </div>

    </div>
  );
}
