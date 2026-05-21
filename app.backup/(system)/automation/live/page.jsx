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
  loadWorkflowRuntime,
} from "@/lib/automation/loadWorkflowRuntime";

export default function AutomationLivePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    logs,
    setLogs,
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
      await loadWorkflowRuntime(
        tenantId
      );

    setLogs(data || []);
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

    const runtime =
      createEnterpriseRealtime({

        name:
          `workflow-runtime-${tenantId}`,

        subscriptions: [

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
    status
  ) {

    if (
      status === "FAILED"
    ) {

      return "border-red-500/20 bg-red-500/5 text-red-400";
    }

    return "border-emerald-500/20 bg-emerald-500/5 text-emerald-400";
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-cyan-400 mb-3">
            AUTOMATION
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Workflow Runtime
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs uppercase tracking-[0.3em] flex items-center">
          LIVE EXECUTION
        </div>

      </div>

      {/* ===== RUNTIME LOGS ===== */}
      <div className="p-10 space-y-5">

        {logs.length === 0 && (

          <div className="h-[60vh] flex items-center justify-center text-zinc-600 text-3xl">
            Waiting for workflow execution...
          </div>

        )}

        {logs.map(log => (

          <div
            key={log.id}
            className={`rounded-[32px] border overflow-hidden ${getStyles(log.status)}`}
          >

            <div className="p-8">

              <div className="flex items-center justify-between mb-8">

                <div>

                  <div className="text-xs uppercase tracking-[0.3em] mb-3">
                    {log.event}
                  </div>

                  <div className="text-4xl font-light">
                    {log.workflow}
                  </div>

                </div>

                <div className="text-right">

                  <div className="text-xs uppercase tracking-[0.3em] mb-2">
                    {log.status}
                  </div>

                  <div className="text-2xl font-light">
                    {log.duration_ms || 0}ms
                  </div>

                </div>

              </div>

              <div className="grid grid-cols-2 gap-7">

                <div className="rounded-3xl bg-black/30 p-6 overflow-auto">

                  <div className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-5">
                    Payload
                  </div>

                  <pre className="text-sm text-zinc-300">
                    {JSON.stringify(
                      log.payload,
                      null,
                      2
                    )}
                  </pre>

                </div>

                <div className="rounded-3xl bg-black/30 p-6 overflow-auto">

                  <div className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-5">
                    Result
                  </div>

                  <pre className="text-sm text-zinc-300">
                    {JSON.stringify(
                      log.result ||
                      log.error,
                      null,
                      2
                    )}
                  </pre>

                </div>

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}
