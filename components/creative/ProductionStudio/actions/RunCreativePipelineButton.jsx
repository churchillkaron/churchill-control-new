"use client";

import { useState } from "react";

export default function RunCreativePipelineButton({ runtime }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    if (loading) return;

    const missionId = runtime.missionRuntime?.current?.id;
    const projectId = runtime.projectRuntime?.current?.id;
    if (!missionId || !projectId) {
      setError("A started mission and project are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/creative/director/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          creative_mission_id: missionId,
          creative_project_id: projectId,
          brief: runtime.briefRuntime?.current || {},
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || result.reason || "Creative pipeline failed");
      }

      await runtime.refresh?.();
    } catch (runError) {
      setError(runError?.message || String(runError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={run}
        disabled={loading}
        className="rounded-xl border border-[#c8a96a]/30 bg-[#b48a45]/10 px-4 py-2 text-sm text-[#d8bd7a] transition hover:bg-[#b48a45]/20 disabled:opacity-50"
      >
        {loading ? "Directing production..." : "Create Production"}
      </button>
      {error ? (
        <p className="max-w-sm text-right text-xs text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
