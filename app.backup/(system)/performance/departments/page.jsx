"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadDepartmentPerformance } from "@/lib/performance/loadDepartmentPerformance";

export default function DepartmentPerformancePage() {

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
      await loadDepartmentPerformance(
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
          "department-performance"
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
        Loading Department Performance...
      </div>
    );
  }

  function getColor(score) {

    if (score >= 80) {

      return "emerald";
    }

    if (score >= 50) {

      return "orange";
    }

    return "red";
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-violet-400 mb-3">
            PERFORMANCE
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Department Scores
          </div>

        </div>

      </div>

      {/* ===== KPI ===== */}
      <div className="p-10 grid grid-cols-3 gap-7">

        {/* ===== FOH ===== */}
        <div className={`rounded-[40px] border p-10 ${
          getColor(stats.foh) === "emerald"
            ? "border-emerald-500/20 bg-emerald-500/5"
            : getColor(stats.foh) === "orange"
            ? "border-orange-500/20 bg-orange-500/5"
            : "border-red-500/20 bg-red-500/5"
        }`}>

          <div className="text-xs uppercase tracking-[0.3em] mb-6">
            FOH PERFORMANCE
          </div>

          <div className="text-8xl font-light mb-6">
            {
              stats.foh
            }%
          </div>

          <div className="text-zinc-500">
            Based on paid orders and activity
          </div>

        </div>

        {/* ===== BAR ===== */}
        <div className={`rounded-[40px] border p-10 ${
          getColor(stats.bar) === "emerald"
            ? "border-emerald-500/20 bg-emerald-500/5"
            : getColor(stats.bar) === "orange"
            ? "border-orange-500/20 bg-orange-500/5"
            : "border-red-500/20 bg-red-500/5"
        }`}>

          <div className="text-xs uppercase tracking-[0.3em] mb-6">
            BAR PERFORMANCE
          </div>

          <div className="text-8xl font-light mb-6">
            {
              stats.bar
            }%
          </div>

          <div className="text-zinc-500">
            Based on pending bar tickets
          </div>

        </div>

        {/* ===== KITCHEN ===== */}
        <div className={`rounded-[40px] border p-10 ${
          getColor(stats.kitchen) === "emerald"
            ? "border-emerald-500/20 bg-emerald-500/5"
            : getColor(stats.kitchen) === "orange"
            ? "border-orange-500/20 bg-orange-500/5"
            : "border-red-500/20 bg-red-500/5"
        }`}>

          <div className="text-xs uppercase tracking-[0.3em] mb-6">
            KITCHEN PERFORMANCE
          </div>

          <div className="text-8xl font-light mb-6">
            {
              stats.kitchen
            }%
          </div>

          <div className="text-zinc-500">
            Based on pending kitchen tickets
          </div>

        </div>

      </div>

    </div>
  );
}
