"use client";

import { useEffect, useMemo, useState } from "react";

const TENANT_ID =
  "cbdc9308-5515-4d38-8e64-edae68dd5872";

export default function ApprovalsCenterPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  async function loadRequests() {
    setLoading(true);

    const res = await fetch(
      `/api/approval_requests?tenantId=${TENANT_ID}&status=pending`
    );

    const json = await res.json();

    setRequests(json.requests || []);
    setLoading(false);
  }

  useEffect(() => {
    loadRequests();
  }, []);

  function getCurrentStep(req) {
    const steps =
      req.approval_workflows?.approval_steps || [];

    return (
      steps.find(
        step =>
          Number(step.step) === Number(req.current_step)
      ) || null
    );
  }

  async function handleApprove(req) {
    setActionLoading(req.id);

    try {
      await fetch("/api/approvals/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowRequestId: req.id,
          notes: "Approved from Manager Approval Center",
        }),
      });

      await loadRequests();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(req) {
    setActionLoading(req.id);

    try {
      await fetch("/api/approvals/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowRequestId: req.id,
          reason: "Rejected from Manager Approval Center",
        }),
      });

      await loadRequests();
    } finally {
      setActionLoading(null);
    }
  }

  const pendingCount = useMemo(
    () => requests.length,
    [requests]
  );

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 rounded-[32px] border border-white/10 bg-white/[0.04] p-8">
          <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/40">
            Synthetic Intelligence OS
          </p>

          <h1 className="text-4xl font-semibold">
            Manager Approval Center
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-white/55">
            Unified approval queue connected to approval_requests,
            approval_workflows, and approval_logs.
          </p>

          <div className="mt-6 text-sm text-white/60">
            Pending approvals:{" "}
            <span className="text-white">
              {pendingCount}
            </span>
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/50">
            Loading approvals...
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/50">
            No pending approvals.
          </div>
        )}

        <div className="space-y-4">
          {requests.map((req) => {
            const step = getCurrentStep(req);

            return (
              <div
                key={req.id}
                className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6"
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-white/35">
                      {req.approval_workflows?.department || "approval"}
                    </p>

                    <h2 className="mt-2 text-xl font-semibold">
                      {req.approval_workflows?.workflow_type || "Approval Request"}
                    </h2>

                    <div className="mt-3 grid gap-2 text-sm text-white/55 md:grid-cols-2">
                      <div>
                        Reference: {req.reference_table}
                      </div>

                      <div>
                        Status: {req.status}
                      </div>

                      <div>
                        Current step: {req.current_step}
                      </div>

                      <div>
                        Required role: {step?.role || "Not defined"}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprove(req)}
                      disabled={actionLoading === req.id}
                      className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
                    >
                      Approve
                    </button>

                    <button
                      onClick={() => handleReject(req)}
                      disabled={actionLoading === req.id}
                      className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
