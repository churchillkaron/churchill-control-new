"use client";

import { useMemo, useState } from "react";
import { Play } from "lucide-react";

function queueCounts(queue = {}) {
  const count = (key) => Array.isArray(queue?.[key]) ? queue[key].length : 0;
  return { running: count("running"), review: count("review"), failed: count("failed"), blocked: count("blocked") };
}

function productionMessage(summary) {
  if (!summary) return null;
  const counts = queueCounts(summary.queue);
  const dispatched = Number(summary.dispatched || 0);
  const assets = Number(summary.assets_created || 0);
  const status = String(summary.status || "PRODUCTION_IN_PROGRESS").toLowerCase().replaceAll("_", " ");
  if (summary.complete) return `Complete · ${assets} asset${assets === 1 ? "" : "s"}`;
  if (counts.failed || counts.blocked) return `${counts.failed + counts.blocked} blocked · ${status}`;
  if (counts.review) return `${counts.review} ready for review · ${counts.running} running`;
  if (counts.running) return `${counts.running} running · ${dispatched} dispatched`;
  return `${status} · ${dispatched} dispatched`;
}

export default function RunProductionButton({ runtime }) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const projectId = runtime.projectRuntime?.current?.id || null;
  const message = useMemo(() => productionMessage(summary), [summary]);

  async function run() {
    if (!runtime.organizationId || !projectId || running) return;
    setRunning(true);
    setSummary(null);
    setError(null);
    try {
      const res = await fetch("/api/creative/production/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: runtime.organizationId, creative_project_id: projectId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Production failed.");
      setSummary(json.result || null);
      runtime.refresh?.();
    } catch (runError) {
      setError(runError?.message || "Production failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={running || !projectId}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white transition hover:bg-[#3A3631] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Play size={9} fill="currentColor" /> {running ? "Starting production…" : "Run production"}
      </button>
      {message ? <div className="max-w-[320px] text-right text-[7px] text-emerald-700">{message}</div> : null}
      {error ? <div className="max-w-[320px] text-right text-[7px] text-red-700">{error}</div> : null}
    </div>
  );
}
