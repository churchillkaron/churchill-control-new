"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadPredictiveInsights } from "@/lib/predictive/loadPredictiveInsights";

export default function PredictiveLivePage() {

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
      await loadPredictiveInsights(
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
          "predictive-live"
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
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "kitchen_ticket_items",
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
        Loading Predictive AI...
      </div>
    );
  }

  function riskStyle() {

    if (
      stats.risk === "HIGH"
    ) {

      return "border-red-500/20 bg-red-500/5 text-red-400";
    }

    if (
      stats.risk === "MEDIUM"
    ) {

      return "border-orange-500/20 bg-orange-500/5 text-orange-400";
    }

    return "border-emerald-500/20 bg-emerald-500/5 text-emerald-400";
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-violet-400 mb-3">
            PREDICTIVE AI
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Forecast Engine
          </div>

        </div>

        <div className={`px-6 h-14 rounded-3xl border text-xs uppercase tracking-[0.3em] flex items-center ${riskStyle()}`}>
          {stats.risk} RISK
        </div>

      </div>

      {/* ===== KPI ===== */}
      <div className="p-10 grid grid-cols-4 gap-7">

        <div className="rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            Current Revenue
          </div>

          <div className="text-7xl font-light">
            ฿{stats.revenue}
          </div>

        </div>

        <div className="rounded-[40px] border border-cyan-500/20 bg-cyan-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-6">
            Forecast Revenue
          </div>

          <div className="text-7xl font-light">
            ฿{stats.nextHourRevenue}
          </div>

        </div>

        <div className="rounded-[40px] border border-violet-500/20 bg-violet-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-6">
            Avg Order
          </div>

          <div className="text-7xl font-light">
            ฿{stats.avgOrder}
          </div>

        </div>

        <div className="rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-6">
            Active Orders
          </div>

          <div className="text-7xl font-light">
            {stats.activeOrders}
          </div>

        </div>

      </div>

      {/* ===== AI RECOMMENDATION ===== */}
      <div className="px-10 pb-10">

        <div className={`rounded-[40px] border p-10 ${riskStyle()}`}>

          <div className="text-xs uppercase tracking-[0.3em] mb-6">
            AI Recommendation
          </div>

          <div className="text-5xl font-light leading-tight">
            {stats.recommendation}
          </div>

        </div>

      </div>

      {/* ===== KITCHEN ===== */}
      <div className="px-10 pb-10 grid grid-cols-2 gap-7">

        <div className="rounded-[40px] border border-red-500/20 bg-red-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-red-400 mb-6">
            Pending Tickets
          </div>

          <div className="text-7xl font-light">
            {stats.pending}
          </div>

        </div>

        <div className="rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-6">
            Preparing Tickets
          </div>

          <div className="text-7xl font-light">
            {stats.preparing}
          </div>

        </div>

      </div>

    </div>
  );
}
