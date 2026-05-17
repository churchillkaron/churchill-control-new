"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function OrdersPage() {

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

  // ===== LOAD =====
  async function loadOrders() {

    if (!tenantId) {
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (
          id,
          item_name,
          quantity,
          price
        )
      `)
      .eq(
        "tenant_id",
        tenantId
      )
      .in(
        "kitchen_status",
        [
          "READY",
          "SERVED",
        ]
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (error) {

      console.error(
        error
      );

      return;
    }

    setOrders(
      data || []
    );

    setLoading(false);
  }

  // ===== INIT =====
  useEffect(() => {

    async function init() {

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

    init();

  }, []);

  // ===== LOAD =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    loadOrders();

  }, [tenantId]);

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
            schema:
              "public",
            table:
              "orders",
            filter: `tenant_id=eq.${tenantId}`,
          },
          () =>
            loadOrders()
        )

        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };

  }, [tenantId]);

  // ===== SERVE =====
  async function markServed(
    orderId
  ) {

    try {

      await supabase
        .from("orders")
        .update({
          kitchen_status:
            "SERVED",
        })
        .eq(
          "id",
          orderId
        );

      loadOrders();

    } catch (error) {

      console.error(
        error
      );

      alert(
        "Failed to serve order"
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Orders"
        subtitle="Operational service coordination"
      >

        {loading ? (

          <div className="text-white/40">
            Loading orders...
          </div>

        ) : (

          <div className="grid grid-cols-3 gap-4">

            {orders.map(
              (order) => (

                <div
                  key={order.id}
                  className="rounded-[24px] border border-white/10 bg-[#111117] p-5"
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
                          : "bg-blue-500/10 text-blue-400"
                      }`}
                    >
                      {
                        order.kitchen_status
                      }
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

                            <div className="text-white/40">
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

                  {/* ACTION */}
                  <div className="mt-5">

                    {order.kitchen_status ===
                      "READY" && (

                      <button
                        onClick={() =>
                          markServed(
                            order.id
                          )
                        }
                        className="w-full rounded-[16px] bg-[#8B5CF6] px-4 py-3 text-sm text-white transition hover:bg-[#9D6BFF]"
                      >
                        SERVE ORDER
                      </button>
                    )}

                    {order.kitchen_status ===
                      "SERVED" && (

                      <div className="rounded-[16px] border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-center text-sm text-blue-400">
                        WAITING FOR BILLING
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
