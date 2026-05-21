"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadFinanceOverview } from "@/lib/finance/loadFinanceOverview";

import {
  createEnterpriseRealtime,
} from "@/lib/runtime/createEnterpriseRealtime";

export default function FinanceLivePage() {

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
      await loadFinanceOverview(
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
          `finance-live-${tenantId}`,

        subscriptions: [

          {
            table:
              "orders",
          },

          {
            table:
              "payments",
          },

          {
            table:
              "journal_entries",
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
        Loading Finance...
      </div>
    );
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-emerald-400 mb-3">
            FINANCE
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Revenue Control
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs uppercase tracking-[0.3em] flex items-center">
          LIVE ACCOUNTING
        </div>

      </div>

      {/* ===== TOP KPI ===== */}
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

        <div className="rounded-[40px] border border-violet-500/20 bg-violet-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-6">
            Service Charge
          </div>

          <div className="text-7xl font-light">
            ฿{
              Math.floor(
                stats.serviceCharge
              )
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

        <div className="rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-6">
            Paid Orders
          </div>

          <div className="text-7xl font-light">
            {
              stats.paidOrders
            }
          </div>

        </div>

      </div>

      {/* ===== DEPARTMENT SPLIT ===== */}
      <div className="px-10 pb-10 grid grid-cols-3 gap-7">

        <div className="rounded-[40px] border border-cyan-500/20 bg-cyan-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-6">
            FOH 50%
          </div>

          <div className="text-7xl font-light">
            ฿{
              Math.floor(
                stats.foh
              )
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-6">
            BAR 30%
          </div>

          <div className="text-7xl font-light">
            ฿{
              Math.floor(
                stats.bar
              )
            }
          </div>

        </div>

        <div className="rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-10">

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-6">
            KITCHEN 20%
          </div>

          <div className="text-7xl font-light">
            ฿{
              Math.floor(
                stats.kitchen
              )
            }
          </div>

        </div>

      </div>

    </div>
  );
}
