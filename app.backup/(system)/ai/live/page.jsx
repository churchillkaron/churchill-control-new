"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import {
  createEnterpriseRealtime,
} from "@/lib/runtime/createEnterpriseRealtime";

import { supabase }
from "@/lib/shared/supabase/client";

import {
  loadAIDecisions,
} from "@/lib/ai/runtime/loadAIDecisions";

export default function AILivePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    decisions,
    setDecisions,
  ] = useState([]);

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
      await loadAIDecisions(
        tenantId
      );

    setDecisions(
      data || []
    );
  }

  useEffect(() => {

    refresh();

  }, [
    tenantId,
  ]);

  // ===== ENTERPRISE AI RUNTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const runtime =
      createEnterpriseRealtime({

        name:
          `ai-runtime-${tenantId}`,

        subscriptions: [

          {
            table:
              "ai_decisions",
          },

          {
            table:
              "workflow_logs",
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

  function getStyles(
    action
  ) {

    if (
      action ===
      'ALERT_MANAGER'
    ) {

      return "border-red-500/20 bg-red-500/5 text-red-400";
    }

    if (
      action ===
      'PROCUREMENT_RECOMMENDED'
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
            AI RUNTIME
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Enterprise Intelligence
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs uppercase tracking-[0.3em] flex items-center">
          LIVE AI
        </div>

      </div>

      {/* ===== AI DECISIONS ===== */}
      <div className="p-10 space-y-5">

        {decisions.length === 0 && (

          <div className="h-[60vh] flex items-center justify-center text-zinc-600 text-3xl">
            Waiting for AI decisions...
          </div>

        )}

        {decisions.map(decision => (

          <div
            key={decision.id}
            className={`rounded-[32px] border overflow-hidden ${getStyles(decision.ai_action)}`}
          >

            <div className="p-8">

              <div className="flex items-center justify-between mb-8">

                <div>

                  <div className="text-xs uppercase tracking-[0.3em] mb-3">
                    {decision.event}
                  </div>

                  <div className="text-4xl font-light">
                    {decision.ai_action}
                  </div>

                </div>

                <div className="text-zinc-500 text-sm">
                  {decision.created_at}
                </div>

              </div>

              <div className="rounded-3xl bg-black/30 p-6 mb-6">

                <div className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-4">
                  Recommendation
                </div>

                <div className="text-2xl font-light">
                  {decision.recommendation}
                </div>

              </div>

              <div className="rounded-3xl bg-black/30 p-6 overflow-auto">

                <div className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-5">
                  Enterprise Payload
                </div>

                <pre className="text-sm text-zinc-300">
                  {JSON.stringify(
                    decision.payload,
                    null,
                    2
                  )}
                </pre>

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}
