"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadServiceChargeStats } from "@/lib/service/loadServiceChargeStats";

export default function ServiceChargePage() {

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
      await loadServiceChargeStats(
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
          "service-live"
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
        Loading...
      </div>
    );
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-xs tracking-[0.3em] uppercase text-violet-400 mb-2">
            SERVICE
          </div>

          <div className="text-5xl font-semibold">
            Service Charge
          </div>

        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-8 grid grid-cols-2 gap-6">

        {/* ===== REVENUE ===== */}
        <div className="rounded-[36px] border border-white/10 bg-white/[0.03] p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-zinc-500 mb-5">
            Revenue
          </div>

          <div className="text-7xl font-light">
            ฿{
              stats.revenue
            }
          </div>

        </div>

        {/* ===== SERVICE ===== */}
        <div className="rounded-[36px] border border-violet-500/20 bg-violet-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-violet-400 mb-5">
            Service Charge
          </div>

          <div className="text-7xl font-light">
            ฿{
              stats.serviceCharge.toFixed(0)
            }
          </div>

        </div>

        {/* ===== FOH ===== */}
        <div className="rounded-[36px] border border-cyan-500/20 bg-cyan-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-cyan-400 mb-5">
            FOH 50%
          </div>

          <div className="text-6xl font-light">
            ฿{
              stats.foh.toFixed(0)
            }
          </div>

        </div>

        {/* ===== BAR ===== */}
        <div className="rounded-[36px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-orange-400 mb-5">
            BAR 30%
          </div>

          <div className="text-6xl font-light">
            ฿{
              stats.bar.toFixed(0)
            }
          </div>

        </div>

        {/* ===== KITCHEN ===== */}
        <div className="rounded-[36px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-emerald-400 mb-5">
            KITCHEN 20%
          </div>

          <div className="text-6xl font-light">
            ฿{
              stats.kitchen.toFixed(0)
            }
          </div>

        </div>

      </div>

    </div>
  );
}
