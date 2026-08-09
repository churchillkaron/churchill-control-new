"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

export default function ApprovalsCenterPage() {
  const { organization } = useOrganizationRuntime();
  const organizationId = organization?.id || null;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  const loadRequests = useCallback(async () => {
    if (!organizationId) {
      setRequests([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/approval_requests?organizationId=${encodeURIComponent(
          organizationId
        )}&status=pending`
      );

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Unable to load approvals");
      }

      setRequests(json.requests || []);
    } catch (loadError) {
      setRequests([]);
      setError(loadError?.message || "Unable to load approvals");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  function getCurrentStep(request) {
    const steps = request.approval_workflows?.approval_steps || [];

    return (
      steps.find(
        (step) => Number(step.step) === Number(request.current_step)
      ) || steps[request.current_step || 0] || null
    );
  }

  async function runAction(url, payload, requestId) {
    setActionLoading(requestId);
    setError(null);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-avantiqo-organization-id": organizationId,
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Approval action failed");
      }

      await loadRequests();
    } catch (actionError) {
      setError(actionError?.message || "Approval action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleApprove(request) {
    await runAction(
      "/api/approvals/process",
      {
        workflowRequestId: request.id,
        notes: "Approved from Manager Approval Center",
      },
      request.id
    );
  }

  async function handleReject(request) {
    await runAction(
      "/api/approvals/reject",
      {
        workflowRequestId: request.id,
        reason: "Rejected from Manager Approval Center",
      },
      request.id
    );
  }

  const pendingCount = useMemo(() => requests.length, [requests]);

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 rounded-[32px] border border-white/10 bg-white/[0.04] p-8">
          <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/40">
            Synthetic Intelligence OS
          </p>

          <h1 className="text-4xl font-semibold">Manager Approval Center</h1>

          <p className="mt-3 max-w-2xl text-sm text-white/55">
            Unified approval queue connected to approval requests, workflows,
            and audit logs for the active organization.
          </p>

          <div className="mt-6 text-sm text-white/60">
            Pending approvals: <span className="text-white">{pendingCount}</span>
          </div>
        </div>

        {!organizationId && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/50">
            Select an organization to view approvals.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/50">
            Loading approvals...
          </div>
        )}

        {!loading && organizationId && requests.length === 0 && !error && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/50">
            No pending approvals.
          </div>
        )}

        <div className="space-y-4">
          {requests.map((request) => {
            const step = getCurrentStep(request);

            return (
              <div
                key={request.id}
                className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6"
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-white/35">
                      {request.approval_workflows?.department || "approval"}
                    </p>

                    <h2 className="mt-2 text-xl font-semibold">
                      {request.approval_workflows?.workflow_type ||
                        "Approval Request"}
                    </h2>

                    <div className="mt-3 grid gap-2 text-sm text-white/55 md:grid-cols-2">
                      <div>Reference: {request.reference_table}</div>
                      <div>Status: {request.status}</div>
                      <div>Current step: {request.current_step}</div>
                      <div>Required role: {step?.role || "Not defined"}</div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprove(request)}
                      disabled={actionLoading === request.id}
                      className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
                    >
                      Approve
                    </button>

                    <button
                      onClick={() => handleReject(request)}
                      disabled={actionLoading === request.id}
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
