"use client";

import { useState } from "react";

function resolveAssets(runtime = {}) {
  return (
    runtime.assetRuntime?.items ||
    runtime.assetsRuntime?.items ||
    runtime.assets ||
    []
  );
}

export default function RunCreativePipelineButton({
  runtime,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function run() {
    if (loading) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const project = runtime.projectRuntime?.current || {};
      const brief =
        runtime.projectRuntime?.documents?.CreativeBrief ||
        project.brief ||
        {};

      if (!project.id) {
        throw new Error("Select a Creative project before production.");
      }

      const response = await fetch(
        "/api/creative/director/execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: runtime.organizationId,
            creative_mission_id:
              project.creative_mission_id ||
              project.mission_id ||
              project.id,
            creative_project_id: project.id,
            organization:
              runtime.organization ||
              runtime.businessContext?.organization ||
              {},
            brand:
              runtime.brand ||
              runtime.brandRuntime?.current ||
              {},
            industry:
              runtime.industry ||
              runtime.businessContext?.industry ||
              null,
            objective:
              brief.objective ||
              brief.business_goal ||
              project.objective ||
              project.business_goal ||
              "",
            brief,
            assets: resolveAssets(runtime),
            requestedOutputs:
              project.requested_outputs ||
              brief.requested_outputs ||
              ["master_video"],
            duration_seconds:
              project.duration_seconds ||
              brief.duration_seconds ||
              30,
            platform:
              project.platform ||
              brief.platform ||
              "multi-channel",
            budgetMode:
              project.budget_mode ||
              brief.budget_mode ||
              "quality-first",
            max_cycles: 1,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
          result.reason ||
          "Creative production failed",
        );
      }

      setMessage(
        result.autonomous_handoff?.approval_required
          ? "Production is queued and waiting for the required budget approval."
          : "Production is queued and will continue automatically. Open Production to monitor live shot progress.",
      );

      window.dispatchEvent(
        new CustomEvent("creative-production-started", {
          detail: {
            creative_project_id: project.id,
            autonomous: true,
          },
        }),
      );

      if (typeof runtime.refresh === "function") {
        await runtime.refresh();
      }
    } catch (runError) {
      setError(
        runError?.message ||
        "Creative production failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex max-w-md flex-col items-end gap-2">
      <button
        onClick={run}
        disabled={loading}
        className="rounded-xl border border-[#c8a96a]/30 bg-[#b48a45]/10 px-4 py-2 text-sm text-[#d8bd7a] transition hover:bg-[#b48a45]/20 disabled:opacity-50"
      >
        {loading
          ? "Planning and queueing production..."
          : "Approve & Start Production"}
      </button>

      {message ? (
        <p className="text-right text-xs text-emerald-300/80">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="text-right text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
