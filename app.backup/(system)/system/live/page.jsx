"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadSystemHealth } from "@/lib/system/loadSystemHealth";

export default function SystemLivePage() {

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
      await loadSystemHealth(
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
          "system-live"
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
        Loading System...
      </div>
    );
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-cyan-400 mb-3">
            SYSTEM
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Live Health
          </div>

        </div>

        <div className={`px-6 h-14 rounded-3xl border text-xs uppercase tracking-[0.3em] flex items-center ${
          stats.status === "OPTIMAL"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : stats.status === "WARNING"
            ? "bg-orange-500/10 border-orange-500/20 text-orange-400"
            : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          {stats.status}
        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-10 grid grid-cols-4 gap-7">

        <div className={`rounded-[40px] border p-10 ${
          stats.status === "OPTIMAL"
            ? "border-emerald-500/20 bg-emerald-500/5"
            : stats.status === "WARNING"
            ? "border-orange-500/20 bg-orange-500/5"
            : "border-red-500/20 bg-red-500/5"
        }`}>

          <div className="text-xs uppercase tracking-[0.3em] mb-6">
            Health Score
          </div>

          <div className="text-7xl font-light">
            {
              stats.score
            }%
          </div>

        </div>

        <div className="rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-6">
            Active Orders
          </div>

          <div className="text-7xl font-light">
            {
              stats.activeOrders
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-cyan-500/20 bg-cyan-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-6">
            Active Tables
          </div>

          <div className="text-7xl font-light">
            {
              stats.activeTables
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            Paid Orders
          </div>

          <div className="text-7xl font-light">
            {
              stats.paidOrders
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-red-500/20 bg-red-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-red-400 mb-6">
            Kitchen Pending
          </div>

          <div className="text-7xl font-light">
            {
              stats.kitchenPending
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-6">
            Kitchen Preparing
          </div>

          <div className="text-7xl font-light">
            {
              stats.kitchenPreparing
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            Kitchen Ready
          </div>

          <div className="text-7xl font-light">
            {
              stats.kitchenReady
            }
          </div>

        </div>

      </div>

    </div>
  );
}
