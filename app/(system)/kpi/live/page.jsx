"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadRestaurantKPI } from "@/lib/kpi/loadRestaurantKPI";

export default function KPILivePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    stats,
    setStats,
  ] = useState(null);

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
      await loadRestaurantKPI(
        tenantId
      );

    setStats(data);
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
          "kpi-live"
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

  if (!stats) {

    return (

      <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500 text-2xl">
        Loading KPI...
      </div>
    );
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-xs tracking-[0.3em] uppercase text-violet-400 mb-2">
            KPI
          </div>

          <div className="text-5xl font-semibold">
            Restaurant Metrics
          </div>

        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-8 grid grid-cols-4 gap-6">

        <div className="rounded-[36px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-emerald-400 mb-5">
            Revenue
          </div>

          <div className="text-6xl font-light">
            ฿{
              stats.revenue
            }
          </div>

        </div>

        <div className="rounded-[36px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-orange-400 mb-5">
            Orders
          </div>

          <div className="text-6xl font-light">
            {
              stats.totalOrders
            }
          </div>

        </div>

        <div className="rounded-[36px] border border-cyan-500/20 bg-cyan-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-cyan-400 mb-5">
            Avg Order
          </div>

          <div className="text-6xl font-light">
            ฿{
              stats.averageOrder
            }
          </div>

        </div>

        <div className="rounded-[36px] border border-violet-500/20 bg-violet-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-violet-400 mb-5">
            Service
          </div>

          <div className="text-6xl font-light">
            ฿{
              Math.floor(
                stats.serviceCharge
              )
            }
          </div>

        </div>

      </div>

    </div>
  );
}
