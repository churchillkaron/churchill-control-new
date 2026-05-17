"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

import { loadKitchenOrders } from "@/lib/kitchen/loadKitchenOrders";
import { updateKitchenStatus } from "@/lib/kitchen/updateKitchenStatus";

export default function KitchenPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    orders,
    setOrders,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    updating,
    setUpdating,
  ] = useState(null);

  // ===== LOAD =====
  async function refreshKitchen() {

    if (!tenantId) {
      return;
    }

    const data =
      await loadKitchenOrders(
        tenantId
      );

    setOrders(data);

    setLoading(false);
  }

  // ===== INIT =====
  useEffect(() => {

    async function loadUser() {

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const {
        data,
      } = await supabase
        .from(
          "staff_accounts"
        )
        .select(
          "tenant_id"
        )
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (
        !data?.tenant_id
      ) {
        return;
      }

      setTenantId(
        data.tenant_id
      );
    }

    loadUser();

  }, []);

  // ===== LOAD =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    refreshKitchen();

  }, [tenantId]);

  // ===== REALTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const channel =
      supabase
        .channel(
          "kitchen-live"
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema:
              "public",
            table:
              "orders",
            filter: `tenant_id=eq.${tenantId}`,
          },
          () =>
            refreshKitchen()
        )

        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };

  }, [tenantId]);

  // ===== STATUS =====
  async function handleStatus(
    orderId,
    status
  ) {

    try {

      setUpdating(
        orderId
      );

      await updateKitchenStatus({
        orderId,
        status,
      });

      await refreshKitchen();

    } catch (error) {

      console.error(
        error
      );

      alert(
        "Failed to update kitchen status"
      );

    } finally {

      setUpdating(
        null
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Kitchen"
        subtitle="Operational production queue"
      >

        {loading ? (

          <div className="text-white/40">
            Loading kitchen...
          </div>

        ) : (

          <div className="grid grid-cols-3 gap-4">

            {orders.map(
              (order) => (

                <div
                  key={order.id}
                  className={`rounded-[24px] border p-5 transition-all duration-300 ${
                    order.urgency ===
                    "CRITICAL"
                      ? "border-red-500/30 bg-red-500/10 shadow-[0_0_40px_rgba(239,68,68,0.12)]"
                      : order.urgency ===
                        "WARNING"
                      ? "border-yellow-500/30 bg-yellow-500/10 shadow-[0_0_40px_rgba(234,179,8,0.08)]"
                      : "border-white/10 bg-[#111117]"
                  }`}
                >

                  {/* HEADER */}
                  <div className="flex items-start justify-between">

                    <div>

                      <div className="text-[11px] tracking-[0.25em] text-white/30">
                        TABLE
                      </div>

                      <div
                        className="mt-2 text-4xl"
                        style={{
                          fontWeight: 250,
                          letterSpacing: "-0.06em",
                        }}
                      >
                        {
                          order.table_number
                        }
                      </div>

                    </div>

                    <div
                      className={`rounded-full px-3 py-1 text-[11px] tracking-[0.15em] ${
                        order.kitchen_status ===
                        "READY"
                          ? "bg-green-500/10 text-green-400"
                          : order.kitchen_status ===
                            "PREPARING"
                          ? "bg-orange-500/10 text-orange-400"
                          : "bg-blue-500/10 text-blue-400"
                      }`}
                    >
                      {
                        order.kitchen_status
                      }
                    </div>

                  </div>

                  {/* METRICS */}
                  <div className="mt-5 grid grid-cols-3 gap-2">

                    <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">

                      <div className="text-[10px] tracking-[0.18em] text-white/30">
                        WAIT
                      </div>

                      <div
                        className={`mt-2 text-lg ${
                          order.urgency ===
                          "CRITICAL"
                            ? "text-red-400"
                            : order.urgency ===
                              "WARNING"
                            ? "text-yellow-400"
                            : "text-white"
                        }`}
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        {
                          order.duration
                        }m
                      </div>

                    </div>

                    <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">

                      <div className="text-[10px] tracking-[0.18em] text-white/30">
                        ITEMS
                      </div>

                      <div
                        className="mt-2 text-lg"
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        {
                          order.totalItems
                        }
                      </div>

                    </div>

                    <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">

                      <div className="text-[10px] tracking-[0.18em] text-white/30">
                        VALUE
                      </div>

                      <div
                        className="mt-2 text-lg"
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        ฿
                        {
                          order.revenue
                        }
                      </div>

                    </div>

                  </div>

                  {/* ITEMS */}
                  <div className="mt-5 space-y-3">

                    {order.order_items?.map(
                      (item) => (

                        <div
                          key={item.id}
                          className="rounded-[16px] border border-white/10 bg-black/20 p-3"
                        >

                          <div className="flex items-center justify-between">

                            <div>

                              <div
                                className="text-base"
                                style={{
                                  fontWeight: 300,
                                }}
                              >
                                {
                                  item.item_name
                                }
                              </div>

                              <div className="mt-1 text-xs text-white/30">
                                Kitchen item
                              </div>

                            </div>

                            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/50">
                              x
                              {
                                item.quantity
                              }
                            </div>

                          </div>

                        </div>
                      )
                    )}

                  </div>

                  {/* ACTIONS */}
                  <div className="mt-5 space-y-2">

                    {order.kitchen_status ===
                      "PENDING" && (

                      <button
                        onClick={() =>
                          handleStatus(
                            order.id,
                            "PREPARING"
                          )
                        }
                        disabled={
                          updating ===
                          order.id
                        }
                        className="w-full rounded-[16px] bg-orange-500/15 px-4 py-3 text-sm text-orange-400 transition hover:bg-orange-500/25 disabled:opacity-40"
                      >
                        START PREPARING
                      </button>
                    )}

                    {order.kitchen_status ===
                      "PREPARING" && (

                      <button
                        onClick={() =>
                          handleStatus(
                            order.id,
                            "READY"
                          )
                        }
                        disabled={
                          updating ===
                          order.id
                        }
                        className="w-full rounded-[16px] bg-green-500/15 px-4 py-3 text-sm text-green-400 transition hover:bg-green-500/25 disabled:opacity-40"
                      >
                        MARK READY
                      </button>
                    )}

                    {order.kitchen_status ===
                      "READY" && (

                      <div className="rounded-[16px] border border-green-500/20 bg-green-500/10 px-4 py-3 text-center text-sm text-green-400">
                        READY FOR SERVICE
                      </div>
                    )}

                  </div>

                </div>
              )
            )}

          </div>

        )}

      </PageWrapper>

    </div>
  );
}
