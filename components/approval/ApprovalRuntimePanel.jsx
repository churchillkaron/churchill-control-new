"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  createEnterpriseRealtime,
} from "@/lib/runtime/createEnterpriseRealtime";

import {
  loadRealtimeApprovals,
} from "@/lib/approval/runtime/loadRealtimeApprovals";

export default function ApprovalRuntimePanel({

  tenantId,

}) {

  const [
    approvals,
    setApprovals,
  ] = useState([]);

  async function loadRuntime() {

    if (!tenantId) {
      return;
    }

    const data =
      await loadRealtimeApprovals(
        tenantId
      );

    setApprovals(
      data || []
    );
  }

  useEffect(() => {

    loadRuntime();

  }, [
    tenantId,
  ]);

  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const runtime =
      createEnterpriseRealtime({

        name:
          `approval-runtime-${tenantId}`,

        subscriptions: [

          {
            table:
              "approval_tasks",
          },

          {
            table:
              "workflow_logs",
          },

          {
            table:
              "incidents",
          },

        ],

        onChange() {

          loadRuntime();

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
      status === "REJECTED"
    ) {

      return "border-red-500/20 bg-red-500/5 text-red-400";
    }

    if (
      status === "APPROVED"
    ) {

      return "border-emerald-500/20 bg-emerald-500/5 text-emerald-400";
    }

    return "border-orange-500/20 bg-orange-500/5 text-orange-400";
  }

  return (

    <div className="rounded-[32px] border border-white/10 bg-white/[0.03] overflow-hidden">

      <div className="h-20 border-b border-white/5 flex items-center justify-between px-8">

        <div>

          <div className="text-xs uppercase tracking-[0.35em] text-orange-400 mb-2">
            ENTERPRISE GOVERNANCE
          </div>

          <div className="text-2xl font-light">
            Runtime Approvals
          </div>

        </div>

        <div className="text-zinc-500 text-sm">
          {approvals.length} Tasks
        </div>

      </div>

      <div className="p-6 space-y-4 max-h-[700px] overflow-auto">

        {approvals.length === 0 && (

          <div className="h-40 flex items-center justify-center text-zinc-600">
            No approval runtime activity
          </div>

        )}

        {approvals.map(task => (

          <div
            key={task.id}
            className={`rounded-3xl border p-6 ${getStyles(task.status)}`}
          >

            <div className="flex items-center justify-between mb-5">

              <div>

                <div className="text-xs uppercase tracking-[0.3em] mb-2">
                  {task.type}
                </div>

                <div className="text-2xl font-light">
                  {task.status}
                </div>

              </div>

              <div className="text-xs text-zinc-500">
                {task.created_at}
              </div>

            </div>

            <pre className="text-xs overflow-auto text-zinc-300">
              {JSON.stringify(
                task.payload,
                null,
                2
              )}
            </pre>

          </div>

        ))}

      </div>

    </div>

  );

}
