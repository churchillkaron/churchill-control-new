"use client";
import { emitEvent } from "@/lib/pos/core/posEventEngine";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useTenant } from "@/app/providers/TenantProvider";
import { supabase } from "@/lib/shared/supabase/client";

export default function POSOrdersPage() {

  const tenant = useTenant();
  const tenantId = tenant?.id;

  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState({});
  const [loading, setLoading] = useState(true);

  // ===== LOAD ORDERS =====
  async function refreshOrders() {

    if (!tenantId) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (*)
      `)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const enrichedOrders = (data || []).map(order => ({
      ...order,
      financials: null
    }));

    setOrders(enrichedOrders);
    setLoading(false);
  }

  useEffect(() => {
    refreshOrders();
  }, [tenantId]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-xl font-bold">POS Orders</h1>

      {loading && (
        <div className="text-white/50 mt-4">Loading...</div>
      )}

      {!loading && orders.map(order => (
        <div key={order.id} className="p-4 border border-white/10 mt-2">
          <div>Table: {order.table_number}</div>
          <div>Status: {order.status}</div>
        </div>
      ))}

    </div>
  );
}
