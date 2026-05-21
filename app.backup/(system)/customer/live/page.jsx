"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadCustomerFlow } from "@/lib/customer/loadCustomerFlow";

export default function CustomerLivePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    orders,
    setOrders,
  ] = useState([]);

  // ===== LOAD TENANT =====
  useEffect(() => {

    async function loadTenant() {

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
        .from("staff_accounts")
        .select("*")
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (
        data?.tenant_id
      ) {

        setTenantId(
          data.tenant_id
        );
      }
    }

    loadTenant();

  }, []);

  // ===== LOAD =====
  async function refresh() {

    if (!tenantId) {
      return;
    }

    const data =
      await loadCustomerFlow(
        tenantId
      );

    setOrders(
      data || []
    );
  }

  useEffect(() => {

    refresh();

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
          "customer-live"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "orders",
          },
          refresh
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

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-xs tracking-[0.3em] uppercase text-pink-400 mb-2">
            CUSTOMER
          </div>

          <div className="text-5xl font-semibold">
            Live Flow
          </div>

        </div>

        <div className="px-5 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 text-xs uppercase tracking-[0.25em] flex items-center">
          {orders.length} ORDERS
        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-8 grid grid-cols-3 gap-6">

        {orders.map((order) => (

          <div
            key={order.id}
            className="rounded-[36px] border border-white/10 bg-white/[0.03] overflow-hidden"
          >

            <div className="p-8">

              <div className="flex items-start justify-between mb-8">

                <div>

                  <div className="text-xs uppercase tracking-[0.25em] text-pink-400 mb-2">
                    Table
                  </div>

                  <div className="text-5xl font-light">
                    {
                      order.table_number
                    }
                  </div>

                </div>

                <div className={`px-4 h-10 rounded-2xl flex items-center text-xs uppercase tracking-[0.2em] ${
                  order.status === "PAID"
                    ? "bg-emerald-500 text-black"
                    : order.status === "ACTIVE"
                    ? "bg-orange-500 text-black"
                    : "bg-zinc-800 text-zinc-300"
                }`}>
                  {
                    order.status
                  }
                </div>

              </div>

              <div className="space-y-5">

                <div className="flex items-center justify-between">

                  <div className="text-zinc-500">
                    Staff
                  </div>

                  <div className="text-white">
                    {
                      order.staff_name
                    }
                  </div>

                </div>

                <div className="flex items-center justify-between">

                  <div className="text-zinc-500">
                    Total
                  </div>

                  <div className="text-3xl font-light">
                    ฿{
                      order.total_amount
                    }
                  </div>

                </div>

                <div className="flex items-center justify-between">

                  <div className="text-zinc-500">
                    Created
                  </div>

                  <div className="text-xs text-zinc-400">
                    {
                      new Date(
                        order.created_at
                      ).toLocaleTimeString()
                    }
                  </div>

                </div>

              </div>

            </div>

          </div>
        ))}

      </div>

    </div>
  );
}
