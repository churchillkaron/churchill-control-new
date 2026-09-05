"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, Play, RefreshCw, ShieldCheck } from "lucide-react";

const ACTIVE_POLL_MS = 5000;

function queueCounts(queue = {}) {
  const count = (key) => Array.isArray(queue?.[key]) ? queue[key].length : 0;
  return { running: count("running"), ready: count("ready"), waiting: count("waiting"), review: count("review"), failed: count("failed"), blocked: count("blocked") };
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

function shouldContinue(summary) {
  if (!summary || summary.complete) return false;
  const counts = queueCounts(summary.queue);
  if (counts.failed || counts.blocked || counts.running || counts.review) return false;
  return counts.ready > 0;
}

function readinessLabel(readiness, loading) {
  if (loading) return "Checking Cinema…";
  if (activeProjectVideo(readiness)) return "Cinema producing";
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
    return { tone: "busy", text: "Native Video is in flight · Studio is checking progress automatically" };
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
  const [continuing, setContinuing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const pollingRef = useRef(false);
  const continuationRef = useRef(false);
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

  const dispatchProduction = useCallback(async ({ automatic = false } = {}) => {
    if (!organizationId || !projectId || continuationRef.current) return null;
    continuationRef.current = true;
    if (automatic) setContinuing(true);
    try {
      const response = await fetch("/api/creative/production/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, creative_project_id: projectId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        if (json.readiness) setReadiness(json.readiness);
        throw new Error(
          json.error === "CREATIVE_VIDEO_RUNTIME_BUSY"
            ? "Avantiqo Cinema became busy before dispatch. Nothing new was started."
            : json.error || "Production failed.",
        );
      }
      const result = json.result || null;
      setSummary(result);
      setReadiness(result?.video_readiness || null);
      setError(null);
      await runtime.refresh?.();
      return result;
    } finally {
      continuationRef.current = false;
      if (automatic) setContinuing(false);
    }
  }, [organizationId, projectId, runtime]);

  const pollActiveProduction = useCallback(async () => {
    if (!organizationId || !projectId || pollingRef.current) return null;
    pollingRef.current = true;
    try {
      const response = await fetch("/api/creative/production/queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, creative_project_id: projectId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Production check failed.");
      const result = json.result || null;
      setSummary(result);
      setReadiness(result?.video_readiness || null);
      setError(null);

      if (!activeProjectVideo(result?.video_readiness)) {
        await runtime.refresh?.();
        if (shouldContinue(result)) {
          await dispatchProduction({ automatic: true });
        }
      }
      return result;
    } catch (pollError) {
      setError(pollError?.message || "Production check failed.");
      return null;
    } finally {
      pollingRef.current = false;
    }
  }, [organizationId, projectId, runtime, dispatchProduction]);

  useEffect(() => {
    inspectReadiness();
  }, [inspectReadiness]);

  useEffect(() => {
    if (!activeProjectVideo(readiness) || !organizationId || !projectId) return undefined;
    const timer = window.setInterval(() => {
      void pollActiveProduction();
    }, ACTIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [readiness, organizationId, projectId, pollActiveProduction]);

  async function run() {
    if (!organizationId || !projectId || running || continuing || readinessLoading) return;
    if (activeProjectVideo(readiness)) {
      await pollActiveProduction();
      return;
    }
    setRunning(true);
    setSummary(null);
    setError(null);
    try {
      const currentReadiness = await inspectReadiness({ quiet: true });
      const checkingActiveWork = activeProjectVideo(currentReadiness);
      if (checkingActiveWork) {
        await pollActiveProduction();
        return;
      }
      if (currentReadiness?.required && !currentReadiness?.ready) {
        throw new Error(
          String(currentReadiness.status).toUpperCase() === "BUSY"
            ? "Avantiqo Cinema is occupied by other work. Nothing new was started."
            : currentReadiness.error || "Avantiqo Cinema is not ready for production.",
        );
      }

      await dispatchProduction();
      await inspectReadiness({ quiet: true });
    } catch (runError) {
      setError(runError?.message || "Production failed.");
    } finally {
      setRunning(false);
    }
  }

  const checkingActiveWork = activeProjectVideo(readiness);
  const blockedByReadiness = readiness?.required === true && readiness?.ready !== true && !checkingActiveWork;
  const disabled = running || continuing || readinessLoading || !projectId || blockedByReadiness;
  const label = continuing ? "Continuing production…" : running ? "Starting production…" : readinessLabel(readiness, readinessLoading);
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
        {running || continuing || readinessLoading ? <LoaderCircle size={9} className="animate-spin" /> : checkingActiveWork ? <RefreshCw size={9} className="animate-spin" /> : blockedByReadiness ? <CircleAlert size={9} /> : readiness?.required ? <ShieldCheck size={9} /> : <Play size={9} fill="currentColor" />}
        {label}
      </button>
      {readinessState ? <div className={`max-w-[360px] text-right text-[7px] leading-3 ${toneClass}`}>{readinessState.text}</div> : null}
      {message ? <div className="max-w-[360px] text-right text-[7px] text-emerald-700">{message}</div> : null}
      {error ? <div className="max-w-[360px] text-right text-[7px] leading-3 text-red-700">{error}</div> : null}
    </div>
  );
}