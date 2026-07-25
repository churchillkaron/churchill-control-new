"use client";

import { useMemo, useState } from "react";

function resolveAssets(runtime = {}) {
  return (
    runtime.assetRuntime?.items ||
    runtime.assetsRuntime?.items ||
    runtime.assets ||
    []
  );
}

function projectMedium(project = {}) {
  return String(
    project.metadata?.creative_medium || project.production_type || "MULTIMEDIA",
  ).toUpperCase();
}

function requestedOutputs(project = {}, brief = {}) {
  const supplied =
    project.requested_outputs ||
    project.metadata?.requested_outputs ||
    brief.requested_outputs;
  if (Array.isArray(supplied) && supplied.length) return supplied;

  return [
    project.metadata?.deliverable_id ||
      project.metadata?.creative_medium ||
      project.production_type ||
      "creative_deliverable",
  ];
}

function targetDuration(project = {}, brief = {}) {
  const medium = projectMedium(project);
  const supplied = Number(
    project.target_duration ||
      project.duration_seconds ||
      brief.duration_seconds ||
      0,
  );
  if (Number.isFinite(supplied) && supplied > 0) return supplied;
  return ["VIDEO", "FILM", "AUDIO"].includes(medium) ? 30 : 0;
}

export default function RunCreativePipelineButton({ runtime }) {
  const project = runtime.projectRuntime?.current || {};
  const configuredReleaseMode = String(
    project.metadata?.release_policy?.mode || "MANUAL",
  ).toUpperCase();
  const [releaseMode, setReleaseMode] = useState(
    configuredReleaseMode === "AUTOMATIC" ? "AUTOMATIC" : "MANUAL",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const medium = useMemo(() => projectMedium(project), [project]);

  async function run() {
    if (loading) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const currentProject = runtime.projectRuntime?.current || {};
      const brief =
        runtime.projectRuntime?.documents?.CreativeBrief ||
        currentProject.brief ||
        {};

      if (!currentProject.id) {
        throw new Error("Select a Creative project before production.");
      }
      if (!runtime.organizationId) {
        throw new Error("Select an organization before production.");
      }

      const response = await fetch("/api/creative/director/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          creative_mission_id:
            currentProject.creative_mission_id ||
            currentProject.mission_id ||
            currentProject.id,
          creative_project_id: currentProject.id,
          organization:
            runtime.organization ||
            runtime.businessContext?.organization ||
            {},
          brand:
            runtime.brand ||
            runtime.brandRuntime?.current ||
            {},
          objective:
            brief.objective ||
            brief.business_goal ||
            currentProject.objective ||
            currentProject.business_goal ||
            currentProject.description ||
            "",
          brief,
          assets: resolveAssets(runtime),
          requestedOutputs: requestedOutputs(currentProject, brief),
          duration_seconds: targetDuration(currentProject, brief),
          platform:
            currentProject.target_channels?.join(",") ||
            currentProject.platform ||
            brief.platform ||
            "deliverable-defined",
          budgetMode:
            currentProject.budget_profile ||
            currentProject.budget_mode ||
            brief.budget_mode ||
            "mission-controlled",
          release_mode: releaseMode,
          max_cycles: 1,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            result.reason ||
            result.production?.final_approval?.blockers?.join(", ") ||
            "Creative production failed",
        );
      }
      if (!result.production && !result.autonomous_handoff) {
        throw new Error("Production did not materialize any executable work.");
      }

      const approvalRequired =
        result.autonomous_handoff?.approval_required === true;
      const automaticRelease = result.release_mode === "AUTOMATIC";
      setMessage(
        approvalRequired
          ? "Production is queued and waiting for the required budget approval."
          : automaticRelease
            ? `${medium} production is running automatically and will release only after its quality contract passes.`
            : `${medium} production is running automatically and will stop at the final human release gate.`,
      );

      window.dispatchEvent(
        new CustomEvent("creative-production-started", {
          detail: {
            creative_project_id: currentProject.id,
            autonomous: true,
            medium,
            release_mode: releaseMode,
          },
        }),
      );

      if (typeof runtime.refresh === "function") {
        await runtime.refresh();
      }
    } catch (runError) {
      setError(runError?.message || "Creative production failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex max-w-lg flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-white/55" htmlFor="creative-release-mode">
          Final release
        </label>
        <select
          id="creative-release-mode"
          value={releaseMode}
          onChange={(event) => setReleaseMode(event.target.value)}
          disabled={loading}
          className="rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-xs text-white/80 outline-none"
        >
          <option value="MANUAL">Human approval</option>
          <option value="AUTOMATIC">Automatic after AI quality</option>
        </select>
        <button
          onClick={run}
          disabled={loading}
          className="rounded-xl border border-[#c8a96a]/30 bg-[#b48a45]/10 px-4 py-2 text-sm text-[#d8bd7a] transition hover:bg-[#b48a45]/20 disabled:opacity-50"
        >
          {loading ? "Planning and queueing..." : `Start ${medium} Production`}
        </button>
      </div>

      {message ? (
        <p className="text-right text-xs text-emerald-300/80">{message}</p>
      ) : null}

      {error ? (
        <p className="text-right text-xs text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
