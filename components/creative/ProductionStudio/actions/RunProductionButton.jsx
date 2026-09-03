"use client";

import { useMemo, useState } from "react";

function queueCounts(queue = {}) {
  const count = (key) => Array.isArray(queue?.[key]) ? queue[key].length : 0;

  return {
    running: count("running"),
    review: count("review"),
    completed: count("completed"),
    failed: count("failed"),
    blocked: count("blocked"),
  };
}

function productionMessage(summary) {
  if (!summary) return null;

  const counts = queueCounts(summary.queue);
  const dispatched = Number(summary.dispatched || 0);
  const polled = Number(summary.polled || 0);
  const assets = Number(summary.assets_created || 0);
  const status = String(summary.status || "PRODUCTION_IN_PROGRESS")
    .toLowerCase()
    .replaceAll("_", " ");

  if (summary.complete) {
    return `Production complete · ${assets} asset${assets === 1 ? "" : "s"} created`;
  }

  if (counts.failed || counts.blocked) {
    return `${status} · ${counts.failed} failed · ${counts.blocked} blocked`;
  }

  if (counts.review) {
    return `${status} · ${counts.review} ready for review · ${counts.running} running`;
  }

  if (counts.running) {
    return `${status} · ${counts.running} running · ${dispatched} dispatched · ${polled} polled`;
  }

  return `${status} · ${dispatched} dispatched · ${polled} polled`;
}

export default function RunProductionButton({ runtime }) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const projectId = runtime.projectRuntime?.current?.id || null;
  const message = useMemo(
    () => productionMessage(summary),
    [summary]
  );

  async function run() {
    if (!runtime.organizationId || !projectId || running) return;

    setRunning(true);
    setSummary(null);
    setError(null);

    try {
      const res = await fetch(
        "/api/creative/production/queue",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: runtime.organizationId,
            creative_project_id: projectId,
          }),
        }
      );

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(
          json.error ||
          "Production failed."
        );
      }

      setSummary(json.result || null);
      runtime.refresh?.();
    } catch (runError) {
      setError(
        runError?.message ||
        "Production failed."
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={run}
        disabled={running || !projectId}
        className="rounded-xl border border-[#c8a96a]/30 bg-[#b48a45]/10 px-5 py-2 font-medium text-[#d8bd7a] transition hover:border-[#c8a96a]/50 hover:bg-[#b48a45]/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running
          ? "Starting Production..."
          : "▶ Run Production"}
      </button>

      {message && (
        <div className="max-w-[420px] rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-right text-xs text-emerald-200">
          {message}
        </div>
      )}

      {error && (
        <div className="max-w-[420px] rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-right text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
