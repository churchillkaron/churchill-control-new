"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadRealtimeMonitoring } from "@/lib/monitoring/loadRealtimeMonitoring";

import {
  createEnterpriseRealtime,
} from "@/lib/runtime/realtime/createEnterpriseRealtime";

export default function MonitoringLivePage() {

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
      await loadRealtimeMonitoring(
        tenantId
      );

    setStats(data);
  }

  useEffect(() => {

    refresh();

  }, [
    tenantId,
  ]);

  // ===== ENTERPRISE REALTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const runtime =
      createEnterpriseRealtime({

        name:
          `monitoring-live-${tenantId}`,

        subscriptions: [

          {
            table:
              "orders",
          },

          {
            table:
              "table_sessions",
          },

          {
            table:
              "kitchen_ticket_items",
          },

        ],

        onChange() {

          refresh();

        },

      });

    return () => {

      runtime.unsubscribe();

    };

  }, [
    tenantId,
  ]);

  if (!stats) {

    return (

      <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500 text-2xl">
        Loading Monitoring...
      </div>
    );
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-cyan-400 mb-3">
            MONITORING
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Live Tracking
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs uppercase tracking-[0.3em] flex items-center">
          REALTIME SYSTEM
        </div>

      </div>

      {/* ===== KPI ===== */}
      <div className="p-10 grid grid-cols-4 gap-7">

        <div className="rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            Paid Revenue
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
            Active Tables
          </div>

          <div className="text-7xl font-light">
            {
              stats.activeTables
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-violet-500/20 bg-violet-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-6">
            Active Orders
          </div>

          <div className="text-7xl font-light">
            {
              stats.activeOrders
            }
          </div>

        </div>

      </div>

      {/* ===== KITCHEN ===== */}
      <div className="px-10 pb-10 grid grid-cols-3 gap-7">

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
