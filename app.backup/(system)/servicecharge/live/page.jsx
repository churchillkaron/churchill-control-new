"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadServiceLevel } from "@/lib/servicecharge/loadServiceLevel";

export default function ServiceChargeLevelPage() {

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
      await loadServiceLevel(
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
          "service-level"
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
        Loading Service Level...
      </div>
    );
  }

  function getColor() {

    if (
      stats.servicePercent === 7
    ) {

      return "emerald";
    }

    if (
      stats.servicePercent === 6
    ) {

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
            SERVICE CHARGE
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Performance Unlock
          </div>

        </div>

      </div>

      {/* ===== KPI ===== */}
      <div className="p-10 grid grid-cols-3 gap-7">

        <div className={`rounded-[40px] border p-10 ${
          getColor() === "emerald"
            ? "border-emerald-500/20 bg-emerald-500/5"
            : getColor() === "orange"
            ? "border-orange-500/20 bg-orange-500/5"
            : "border-red-500/20 bg-red-500/5"
        }`}>

          <div className="text-xs uppercase tracking-[0.3em] mb-6">
            Service Level
          </div>

          <div className="text-9xl font-light">
            {
              stats.servicePercent
            }%
          </div>

        </div>

        <div className="rounded-[40px] border border-cyan-500/20 bg-cyan-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-6">
            Performance Score
          </div>

          <div className="text-8xl font-light">
            {
              stats.performance
            }%
          </div>

        </div>

        <div className="rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            Service Charge
          </div>

          <div className="text-8xl font-light">
            ฿{
              Math.floor(
                stats.serviceCharge
              )
            }
          </div>

        </div>

      </div>

      {/* ===== KITCHEN STATUS ===== */}
      <div className="px-10 pb-10 grid grid-cols-2 gap-7">

        <div className="rounded-[40px] border border-red-500/20 bg-red-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-red-400 mb-6">
            Pending Tickets
          </div>

          <div className="text-8xl font-light">
            {
              stats.pending
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-6">
            Preparing Tickets
          </div>

          <div className="text-8xl font-light">
            {
              stats.preparing
            }
          </div>

        </div>

      </div>

    </div>
  );
}
