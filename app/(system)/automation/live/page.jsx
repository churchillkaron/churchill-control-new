"use client";

export const dynamic = "force-dynamic";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";
import {
  createEnterpriseRealtime,
} from "@/lib/runtime/realtime/createEnterpriseRealtime";
import {
  loadWorkflowRuntime,
} from "@/lib/automation/loadWorkflowRuntime";

export default function AutomationLivePage() {
  const { organization } = useOrganizationRuntime();
  const organizationId = organization?.id || null;

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!organizationId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await loadWorkflowRuntime(
        organizationId,
        { limit: 100 }
      );
      setLogs(data || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!organizationId) {
      return undefined;
    }

    const runtime = createEnterpriseRealtime({
      name:
        `workflow-runtime-${organizationId}`,
      subscriptions: [
        {
          table: "workflow_logs",
          filter:
            `organization_id=eq.${organizationId}`,
        },
      ],
      onChange() {
        refresh();
      },
    });

    return () => {
      runtime.unsubscribe();
    };
  }, [organizationId, refresh]);

  function getStyles(status) {
    const normalized = String(status || "").toUpperCase();

    if (normalized === "FAILED") {
      return "border-red-500/20 bg-red-500/5 text-red-400";
    }

    if (
      normalized === "PENDING" ||
      normalized === "PROCESSING"
    ) {
      return "border-amber-500/20 bg-amber-500/5 text-amber-400";
    }

    return "border-emerald-500/20 bg-emerald-500/5 text-emerald-400";
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
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

      <div className="p-10 space-y-5">
        {loading && (
          <div className="h-[60vh] flex items-center justify-center text-zinc-600 text-3xl">
            Loading workflow runtime...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-[32px] border border-red-500/20 bg-red-500/5 p-8 text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div className="h-[60vh] flex items-center justify-center text-zinc-600 text-3xl">
            Waiting for workflow execution...
          </div>
        )}

        {!loading && !error && logs.map(log => (
          <div
            key={log.id}
            className={`rounded-[32px] border overflow-hidden ${getStyles(log.status)}`}
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] mb-3">
                    {log.event || "WORKFLOW"}
                  </div>

                  <div className="text-4xl font-light">
                    {log.workflow || "Runtime Event"}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs uppercase tracking-[0.3em] mb-2">
                    {log.status || "UNKNOWN"}
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

                  <pre className="text-sm text-zinc-300 whitespace-pre-wrap">
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

                  <pre className="text-sm text-zinc-300 whitespace-pre-wrap">
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
