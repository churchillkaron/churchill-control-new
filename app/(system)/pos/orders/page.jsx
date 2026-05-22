"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadActiveOrders } from "@/lib/pos/loadActiveOrders";

import { loadOrderItems } from "@/lib/pos/loadOrderItems";



export default function POSOrdersPage() {

  const tenantId =
    "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const [
    orders,
    setOrders,
  ] = useState([]);

  const [
    orderItems,
    setOrderItems,
  ] = useState({});

  const [
    loading,
    setLoading,
  ] = useState(true);

  // ===== LOAD ORDERS =====
  async function refreshOrders() {

    if (!tenantId) {
      return;
    }

    setLoading(true);

    const data =
      await loadActiveOrders(
        tenantId
      );

    setOrders(
      data || []
    );

    // ===== LOAD ITEMS =====
    const itemMap = {};

    for (const order of data || []) {

      const items =
        await loadOrderItems(
          order.id
        );

      itemMap[
        order.id
      ] = items || [];
    }

    setOrderItems(
      itemMap
    );

    setLoading(false);
  }

  useEffect(() => {

    refreshOrders();

  }, [
    tenantId,
  ]);

  // ===== REALTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const channel =
      supabase
        .channel(
          "orders-live"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "orders",
          },
          async () => {

            await refreshOrders();
          }
        )
        .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );
    };

  }, [
    tenantId,
  ]);

  // ===== PAYMENT ROUTE =====
  function goToPayment(
    orderId
  ) {

    window.location.href =
      `/pos/payments?order_id=${orderId}`;

  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-[11px] uppercase tracking-[0.3em] text-violet-400 mb-2">
            POS
          </div>

          <div className="text-5xl font-semibold tracking-tight">
            Active Orders
          </div>

        </div>

        <div className="px-5 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs uppercase tracking-[0.25em] flex items-center">
          {orders.length} ACTIVE
        </div>

      </div>

      {/* ===== BODY ===== */}
      <div className="p-8 overflow-auto h-[calc(100vh-96px)]">

        {loading ? (

          <div className="h-full flex items-center justify-center text-zinc-500 text-xl">
            Loading orders...
          </div>

        ) : orders.length === 0 ? (

          <div className="h-full flex items-center justify-center text-zinc-600 text-xl">
            No active orders
          </div>

        ) : (

          <div className="grid grid-cols-3 gap-6">

            {orders.map((order) => (

              <div
                key={order.id}
                className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl overflow-hidden"
              >

                {/* ===== TOP ===== */}
                <div className="p-6 border-b border-white/5">

                  <div className="flex items-start justify-between mb-5">

                    <div>

                      <div className="text-[11px] uppercase tracking-[0.25em] text-violet-400 mb-2">
                        Table
                      </div>

                      <div className="text-4xl font-light">
                        {
                          order.table_number
                        }
                      </div>

                    </div>

                    <div className="px-4 h-10 rounded-2xl bg-orange-500 text-black text-xs uppercase tracking-[0.2em] flex items-center">
                      ACTIVE
                    </div>

                  </div>

                  <div className="space-y-3">

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500 text-sm">
                        Staff
                      </div>

                      <div className="text-white text-sm">
                        {
                          order.staff_name
                        }
                      </div>

                    </div>

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500 text-sm">
                        Total
                      </div>

                      <div className="text-2xl font-light text-white">
                        ฿{
                          order.total_amount
                        }
                      </div>

                    </div>

                  </div>

                </div>

                {/* ===== ITEMS ===== */}
                <div className="p-6 border-b border-white/5 space-y-3">

                  {(
                    orderItems[
                      order.id
                    ] || []
                  ).map((item) => (

                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-2xl bg-black/30 border border-white/5 px-4 py-3"
                    >

                      <div>

                        <div className="text-sm text-white">
                          {
                            item.item_name
                          }
                        </div>

                        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">
                          Qty {
                            item.quantity
                          }
                        </div>

                      </div>

                      <div className="text-sm text-white">
                        ฿{
                          item.price
                        }
                      </div>

                    </div>
                  ))}

                </div>

                {/* ===== ACTIONS ===== */}
                <div className="p-6">

                  <button
                    onClick={() =>
                      goToPayment(
                        order.id
                      )
                    }
                    className="w-full h-16 rounded-3xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-lg transition-all"
                  >
                    MARK AS PAID
                  </button>

                </div>

              </div>
            ))}

          </div>

        )}

      </div>

    </div>
  );
}
