"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadControlRoom } from "@/lib/controlroom/loadControlRoom";

export default function ControlRoomPage() {

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
      await loadControlRoom(
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
          "control-room"
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
              "table_sessions",
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
        Loading Control Room...
      </div>
    );
  }

  function scoreStyle() {

    if (
      stats.score >= 80
    ) {

      return "border-emerald-500/20 bg-emerald-500/5 text-emerald-400";
    }

    if (
      stats.score >= 50
    ) {

      return "border-orange-500/20 bg-orange-500/5 text-orange-400";
    }

    return "border-red-500/20 bg-red-500/5 text-red-400";
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-cyan-400 mb-3">
            CONTROL ROOM
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Global Operations
          </div>

        </div>

        <div className={`px-6 h-14 rounded-3xl border text-xs uppercase tracking-[0.3em] flex items-center ${scoreStyle()}`}>
          SYSTEM {stats.score}%
        </div>

      </div>

      {/* ===== KPI ===== */}
      <div className="p-10 grid grid-cols-4 gap-7">

        <div className="rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            Revenue
          </div>

          <div className="text-7xl font-light">
            ฿{stats.revenue}
          </div>

        </div>

        <div className="rounded-[40px] border border-cyan-500/20 bg-cyan-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-6">
            Avg Order
          </div>

          <div className="text-7xl font-light">
            ฿{stats.avgOrder}
          </div>

        </div>

        <div className="rounded-[40px] border border-violet-500/20 bg-violet-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-6">
            Active Orders
          </div>

          <div className="text-7xl font-light">
            {stats.activeOrders}
          </div>

        </div>

        <div className="rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-6">
            Active Tables
          </div>

          <div className="text-7xl font-light">
            {stats.activeTables}
          </div>

        </div>

      </div>

      {/* ===== KITCHEN ===== */}
      <div className="px-10 pb-10 grid grid-cols-3 gap-7">

        <div className="rounded-[40px] border border-red-500/20 bg-red-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-red-400 mb-6">
            Pending
          </div>

          <div className="text-7xl font-light">
            {stats.pending}
          </div>

        </div>

        <div className="rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-6">
            Preparing
          </div>

          <div className="text-7xl font-light">
            {stats.preparing}
          </div>

        </div>

        <div className="rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            Ready
          </div>

          <div className="text-7xl font-light">
            {stats.ready}
          </div>

        </div>

      </div>

    </div>
  );
}
