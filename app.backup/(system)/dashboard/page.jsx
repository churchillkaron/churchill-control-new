"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase }
from "@/lib/shared/supabase/client";

import {
  createEnterpriseRealtime,
} from "@/lib/runtime/createEnterpriseRealtime";

import {
  loadExecutiveDashboard,
} from "@/lib/dashboard/runtime/loadExecutiveDashboard";

import {
  buildPlatformNavigation,
} from "@/lib/navigation/buildPlatformNavigation";

export default function ExecutiveDashboardPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    dashboard,
    setDashboard,
  ] = useState(null);

  const navigation =
    buildPlatformNavigation();

  async function refresh() {

    if (!tenantId) {
      return;
    }

    const data =
      await loadExecutiveDashboard({

        tenantId,

      });

    setDashboard(data);

  }

  // =========================
  // TENANT
  // =========================

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

  // =========================
  // LOAD
  // =========================

  useEffect(() => {

    refresh();

  }, [
    tenantId,
  ]);

  // =========================
  // REALTIME
  // =========================

  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const runtime =
      createEnterpriseRealtime({

        name:
          `executive-dashboard-${tenantId}`,

        subscriptions: [

          {
            table:
              "workflow_logs",
          },

          {
            table:
              "approval_tasks",
          },

          {
            table:
              "incidents",
          },

          {
            table:
              "accounts_payable",
          },

          {
            table:
              "general_ledger",
          },

          {
            table:
              "ai_decisions",
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

  if (!dashboard) {

    return (

      <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500 text-3xl">
        Loading Executive Runtime...
      </div>

    );

  }

  const pnl =
    dashboard.financials?.pnl || {};

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ========================= */}
      {/* HEADER */}
      {/* ========================= */}

      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-cyan-400 mb-3">
            EXECUTIVE RUNTIME
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            CEO Operating System
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs uppercase tracking-[0.3em] flex items-center">
          LIVE ENTERPRISE
        </div>

      </div>

      {/* ========================= */}
      {/* KPI GRID */}
      {/* ========================= */}

      <div className="p-10 grid grid-cols-4 gap-6">

        <div className="rounded-[32px] border border-emerald-500/20 bg-emerald-500/5 p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-5">
            Revenue
          </div>
          <div className="text-5xl font-light">
            ${Number(
              pnl.revenue || 0
            ).toLocaleString()}
          </div>
        </div>

        <div className="rounded-[32px] border border-orange-500/20 bg-orange-500/5 p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-orange-400 mb-5">
            Expenses
          </div>
          <div className="text-5xl font-light">
            ${Number(
              pnl.expenses || 0
            ).toLocaleString()}
          </div>
        </div>

        <div className="rounded-[32px] border border-cyan-500/20 bg-cyan-500/5 p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-5">
            Net Profit
          </div>
          <div className="text-5xl font-light">
            ${Number(
              pnl.netProfit || 0
            ).toLocaleString()}
          </div>
        </div>

        <div className="rounded-[32px] border border-red-500/20 bg-red-500/5 p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-red-400 mb-5">
            Accounts Payable
          </div>
          <div className="text-5xl font-light">
            ${Number(
              dashboard.financials
                ?.totalAccountsPayable || 0
            ).toLocaleString()}
          </div>
        </div>

      </div>

      {/* ========================= */}
      {/* EXECUTIVE CONTROL GRID */}
      {/* ========================= */}

      <div className="px-10 mb-10">

        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] overflow-hidden">

          <div className="h-20 border-b border-white/5 flex items-center px-8 text-2xl font-light">
            Enterprise Control Grid
          </div>

          <div className="p-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">

            {Object.entries(navigation).map(

              ([group, items]) => (

                items.map((item) => (

                  <a
                    key={item.name}
                    href={item.route}
                    className="rounded-3xl border border-white/10 bg-black/30 p-5 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all"
                  >

                    <div className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-3">
                      {group}
                    </div>

                    <div className="text-2xl font-light text-white mb-2">
                      {item.title}
                    </div>

                    <div className="text-zinc-500 text-sm uppercase">
                      {item.type}
                    </div>

                  </a>

                ))

              )

            )}

          </div>

        </div>

      </div>


      {/* ========================= */}
      {/* AI PREDICTIONS */}
      {/* ========================= */}

      <div className="px-10 mb-10">

        <div className="rounded-[32px] border border-violet-500/20 bg-violet-500/5 overflow-hidden">

          <div className="h-20 border-b border-violet-500/10 flex items-center px-8 text-2xl font-light">
            Predictive Intelligence
          </div>

          <div className="p-6 space-y-4">

            {(dashboard.predictions || []).length === 0 && (

              <div className="text-zinc-500">
                No predictive risks detected
              </div>

            )}

            {(dashboard.predictions || []).map(

              (prediction, index) => (

                <div
                  key={index}
                  className="rounded-3xl border border-violet-500/20 bg-black/30 p-6"
                >

                  <div className="flex items-center justify-between mb-4">

                    <div className="text-sm uppercase tracking-[0.3em] text-violet-400">
                      {prediction.type}
                    </div>

                    <div className="text-xs text-zinc-500">
                      {prediction.severity}
                    </div>

                  </div>

                  <div className="text-2xl font-light">
                    {prediction.recommendation}
                  </div>

                </div>

              )

            )}

          </div>

        </div>

      </div>

      {/* ========================= */}
      {/* RUNTIME */}
      {/* ========================= */}

      <div className="px-10 grid grid-cols-2 gap-6 pb-10">

        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] overflow-hidden">

          <div className="h-20 border-b border-white/5 flex items-center px-8 text-2xl font-light">
            Workflow Runtime
          </div>

          <div className="p-6 space-y-4 max-h-[600px] overflow-auto">

            {(dashboard.workflowLogs || []).map(log => (

              <div
                key={log.id}
                className="rounded-3xl border border-white/10 bg-black/30 p-5"
              >

                <div className="flex items-center justify-between mb-3">

                  <div className="text-sm uppercase tracking-[0.3em] text-cyan-400">
                    {log.event}
                  </div>

                  <div className="text-xs text-zinc-500">
                    {log.status}
                  </div>

                </div>

                <div className="text-2xl font-light mb-2">
                  {log.workflow}
                </div>

                <div className="text-zinc-500 text-sm">
                  {log.duration_ms || 0}ms
                </div>

              </div>

            ))}

          </div>

        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] overflow-hidden">

          <div className="h-20 border-b border-white/5 flex items-center px-8 text-2xl font-light">
            AI Runtime
          </div>

          <div className="p-6 space-y-4 max-h-[600px] overflow-auto">

            {(dashboard.aiDecisions || []).map(ai => (

              <div
                key={ai.id}
                className="rounded-3xl border border-violet-500/20 bg-violet-500/5 p-5"
              >

                <div className="flex items-center justify-between mb-3">

                  <div className="text-sm uppercase tracking-[0.3em] text-violet-400">
                    {ai.event}
                  </div>

                  <div className="text-xs text-zinc-500">
                    {ai.created_at}
                  </div>

                </div>

                <div className="text-2xl font-light mb-3">
                  {ai.ai_action}
                </div>

                <div className="text-zinc-400">
                  {ai.recommendation}
                </div>

              </div>

            ))}

          </div>

        </div>

      </div>

    </div>

  );

}
