"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadRestaurantAnalytics } from "@/lib/analytics/loadRestaurantAnalytics";

export default function AnalyticsLivePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    stats,
    setStats,
  ] = useState(null);

  // ===== TENANT =====
  useEffect(() => {

    async function loadTenant() {

      const {
        data: { user },
      } =
        await supabase.auth.getSession();

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
      await loadRestaurantAnalytics(
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
          "analytics-live"
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
        Loading Analytics...
      </div>
    );
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-violet-400 mb-3">
            ANALYTICS
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Live Intelligence
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs uppercase tracking-[0.3em] flex items-center">
          REALTIME DATA
        </div>

      </div>

      {/* ===== KPI ===== */}
      <div className="p-10 grid grid-cols-4 gap-7">

        <div className="rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            Revenue
          </div>

          <div className="text-7xl font-light">
            ฿{
              stats.revenue
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-6">
            Active Revenue
          </div>

          <div className="text-7xl font-light">
            ฿{
              stats.activeRevenue
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-cyan-500/20 bg-cyan-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-6">
            Avg Order
          </div>

          <div className="text-7xl font-light">
            ฿{
              stats.averageOrder
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-violet-500/20 bg-violet-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-6">
            Paid Orders
          </div>

          <div className="text-7xl font-light">
            {
              stats.paidOrders
            }
          </div>

        </div>

      </div>

      {/* ===== HOURLY ===== */}
      <div className="px-10 pb-10">

        <div className="rounded-[40px] border border-white/10 bg-white/[0.03] p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-8">
            Hourly Revenue
          </div>

          <div className="grid grid-cols-6 gap-5">

            {Object.entries(
              stats.hourly || {}
            ).map(
              ([
                hour,
                revenue,
              ]) => (

                <div
                  key={hour}
                  className="rounded-3xl border border-white/5 bg-black/40 p-6"
                >

                  <div className="text-zinc-500 text-sm mb-4">
                    {hour}:00
                  </div>

                  <div className="text-3xl font-light text-emerald-400">
                    ฿{
                      revenue
                    }
                  </div>

                </div>
              )
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
