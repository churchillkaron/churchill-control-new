"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadBarPerformance } from "@/lib/bar/loadBarPerformance";

export default function BarLivePage() {

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
      await loadBarPerformance(
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
          "bar-live"
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
        Loading...
      </div>
    );
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-xs tracking-[0.3em] uppercase text-cyan-400 mb-2">
            BAR
          </div>

          <div className="text-5xl font-semibold">
            Live Performance
          </div>

        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-8 grid grid-cols-5 gap-6">

        <div className="rounded-[36px] border border-cyan-500/20 bg-cyan-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-cyan-400 mb-5">
            Total
          </div>

          <div className="text-7xl font-light">
            {
              stats.total
            }
          </div>

        </div>

        <div className="rounded-[36px] border border-red-500/20 bg-red-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-red-400 mb-5">
            Pending
          </div>

          <div className="text-7xl font-light">
            {
              stats.pending
            }
          </div>

        </div>

        <div className="rounded-[36px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-orange-400 mb-5">
            Preparing
          </div>

          <div className="text-7xl font-light">
            {
              stats.preparing
            }
          </div>

        </div>

        <div className="rounded-[36px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-emerald-400 mb-5">
            Ready
          </div>

          <div className="text-7xl font-light">
            {
              stats.ready
            }
          </div>

        </div>

        <div className="rounded-[36px] border border-violet-500/20 bg-violet-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.25em] text-violet-400 mb-5">
            Served
          </div>

          <div className="text-7xl font-light">
            {
              stats.served
            }
          </div>

        </div>

      </div>

    </div>
  );
}
