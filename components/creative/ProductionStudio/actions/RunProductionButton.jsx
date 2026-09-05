"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, LoaderCircle, Play, RefreshCw, ShieldCheck } from "lucide-react";

function queueCounts(queue = {}) {
  const count = (key) => Array.isArray(queue?.[key]) ? queue[key].length : 0;
  return { running: count("running"), review: count("review"), failed: count("failed"), blocked: count("blocked") };
}

function productionMessage(summary) {
  if (!summary) return null;
  const counts = queueCounts(summary.queue);
  const dispatched = Number(summary.dispatched || 0);
  const polled = Number(summary.polled || 0);
  const assets = Number(summary.assets_created || 0);
  const status = String(summary.status || "PRODUCTION_IN_PROGRESS").toLowerCase().replaceAll("_", " ");
  if (summary.complete) return `Complete · ${assets} asset${assets === 1 ? "" : "s"}`;
  if (counts.failed || counts.blocked) return `${counts.failed + counts.blocked} blocked · ${status}`;
  if (counts.review) return `${counts.review} ready for review · ${counts.running} running`;
  if (counts.running) return `${counts.running} running · ${polled ? `${polled} checked` : `${dispatched} dispatched`}`;
  return `${status} · ${dispatched} dispatched`;
}

function activeProjectVideo(readiness) {
  return Number(readiness?.running_task_count || 0) > 0;
}

function readinessLabel(readiness, loading) {
  if (loading) return "Checking Cinema…";
  if (activeProjectVideo(readiness)) return "Check production";
  if (!readiness || readiness.required === false) return "Run production";
  if (readiness.ready) return "Run production";
  if (String(readiness.status).toUpperCase() === "BUSY") return "Cinema busy";
  return "Cinema unavailable";
}

function readinessMessage(readiness, loading) {
  if (loading) return { tone: "neutral", text: "Verifying the owned Video runtime without starting generation." };
  if (!readiness) return null;
  const provider = readiness.provider_readiness || {};
  if (activeProjectVideo(readiness)) {
    return { tone: "busy", text: "Native Video is in flight · check updates without starting another generation" };
  }
  if (readiness.required === false) return { tone: "neutral", text: "No native Video generation is waiting in this pass." };
  if (readiness.ready) return { tone: "ready", text: "Cinema ready · no generation started by preflight" };
  if (String(readiness.status).toUpperCase() === "BUSY") {
    const work = Number(provider.running || 0) + Number(provider.backlog || 0);
    return { tone: "busy", text: `Cinema busy${work ? ` · ${work} active/queued` : ""} · new native generation is held` };
  }
  return { tone: "blocked", text: "Cinema unavailable · runtime readiness was not proven" };
}

export default function RunProductionButton({ runtime }) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const projectId = runtime.projectRuntime?.current?.id || null;
  const organizationId = runtime.organizationId || null;
  const message = useMemo(() => productionMessage(summary), [summary]);
  const readinessState = useMemo(() => readinessMessage(readiness, readinessLoading), [readiness, readinessLoading]);

  const inspectReadiness = useCallback(async ({ quiet = false } = {}) => {
    if (!organizationId || !projectId) {
      setReadiness(null);
      return null;
    }
    if (!quiet) setReadinessLoading(true);
    try {
      const params = new URLSearchParams({
        organizationId,
        creativeProjectId: projectId,
      });
      const response = await fetch(`/api/creative/production/queue?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Video runtime preflight failed.");
      }
      setReadiness(result.readiness || null);
      return result.readiness || null;
    } catch (readinessError) {
      const blocked = {
        required: true,
        ready: false,
        status: "BLOCKED",
        running_task_count: 0,
        error: readinessError?.message || "Video runtime preflight failed.",
      };
      setReadiness(blocked);
      return blocked;
    } finally {
      if (!quiet) setReadinessLoading(false);
    }
  }, [organizationId, projectId]);

  useEffect(() => {
    inspectReadiness();
  }, [inspectReadiness]);

  async function run() {
    if (!organizationId || !projectId || running || readinessLoading) return;
    setRunning(true);
    setSummary(null);
    setError(null);
    try {
      const currentReadiness = await inspectReadiness({ quiet: true });
      const checkingActiveWork = activeProjectVideo(currentReadiness);
      if (currentReadiness?.required && !currentReadiness?.ready && !checkingActiveWork) {
        throw new Error(
          String(currentReadiness.status).toUpperCase() === "BUSY"
            ? "Avantiqo Cinema is occupied by other work. Nothing new was started."
            : currentReadiness.error || "Avantiqo Cinema is not ready for production.",
        );
      }

      const res = await fetch("/api/creative/production/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, creative_project_id: projectId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (json.readiness) setReadiness(json.readiness);
        throw new Error(
          json.error === "CREATIVE_VIDEO_RUNTIME_BUSY"
            ? "Avantiqo Cinema became busy before dispatch. Nothing new was started."
            : json.error || "Production failed.",
        );
      }
      setSummary(json.result || null);
      setReadiness(json.result?.video_readiness || readiness);
      await runtime.refresh?.();
      await inspectReadiness({ quiet: true });
    } catch (runError) {
      setError(runError?.message || "Production failed.");
    } finally {
      setRunning(false);
    }
  }

  const checkingActiveWork = activeProjectVideo(readiness);
  const blockedByReadiness = readiness?.required === true && readiness?.ready !== true && !checkingActiveWork;
  const disabled = running || readinessLoading || !projectId || blockedByReadiness;
  const label = running ? (checkingActiveWork ? "Checking production…" : "Starting production…") : readinessLabel(readiness, readinessLoading);
  const toneClass = readinessState?.tone === "ready"
    ? "text-emerald-700"
    : readinessState?.tone === "busy"
      ? "text-amber-800"
      : readinessState?.tone === "blocked"
        ? "text-red-700"
        : "text-[#817B73]";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={disabled}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white transition hover:bg-[#3A3631] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {running || readinessLoading ? <LoaderCircle size={9} className="animate-spin" /> : checkingActiveWork ? <RefreshCw size={9} /> : blockedByReadiness ? <CircleAlert size={9} /> : readiness?.required ? <ShieldCheck size={9} /> : <Play size={9} fill="currentColor" />}
        {label}
      </button>
      {readinessState ? <div className={`max-w-[360px] text-right text-[7px] leading-3 ${toneClass}`}>{readinessState.text}</div> : null}
      {message ? <div className="max-w-[360px] text-right text-[7px] text-emerald-700">{message}</div> : null}
      {error ? <div className="max-w-[360px] text-right text-[7px] leading-3 text-red-700">{error}</div> : null}
    </div>
  );
}