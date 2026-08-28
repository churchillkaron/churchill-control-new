"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDot, FileCode2, Loader2, XCircle } from "lucide-react";

const ACTIVE_POLL_MS = 1000;
const IDLE_POLL_MS = 5000;

function text(value) {
  return String(value ?? "").trim();
}

function phaseLabel(value) {
  const phase = text(value).toUpperCase();
  if (phase === "PLANNING") return "Planning the next work package";
  if (phase === "PLANNER_PENDING") return "Writing the engineering plan";
  if (phase === "OPERATION_RUNNING") return "Working";
  if (phase === "OPERATION_COMPLETED") return "Step completed";
  if (phase === "OPERATION_FAILED") return "Step needs repair";
  if (phase === "PACKAGE_COMPLETED") return "Work package completed";
  if (phase === "MISSION_COMPLETED") return "Engineering mission completed";
  if (phase === "PLANNING_FAILED") return "Planning failed";
  return phase ? phase.replaceAll("_", " ").toLowerCase() : "Code session";
}

function actionLabel(value) {
  const action = text(value).toLowerCase();
  if (action === "read") return "Reading source";
  if (action === "search") return "Searching repository";
  if (action === "apply_files") return "Editing files";
  if (action === "verify") return "Verifying changes";
  if (action === "run") return "Running command";
  if (action === "diff") return "Reviewing final diff";
  return action ? action.replaceAll("_", " ") : "Engineering";
}

function eventKey(event, index) {
  return [event?.at, event?.operation_id, event?.phase, index].filter(Boolean).join(":");
}

export default function CodeAILiveProgressPanel({ organizationId }) {
  const [progress, setProgress] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(false);

  const latest = progress?.latest_event || null;
  const active = Boolean(
    progress &&
    !["completed", "failed", "blocked"].includes(text(latest?.status || progress?.state_status).toLowerCase())
  );
  const events = useMemo(
    () => Array.isArray(progress?.events) ? progress.events.slice(-8).reverse() : [],
    [progress],
  );

  useEffect(() => {
    if (!organizationId) {
      setProgress(null);
      setUpdatedAt(null);
      return undefined;
    }

    const controller = new AbortController();
    let timer = null;

    async function loadProgress() {
      if (controller.signal.aborted) return;
      setLoading((current) => current || !progress);
      try {
        const query = new URLSearchParams({ organizationId });
        const response = await fetch(`/api/operator/code/progress?${query.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (response.ok && result?.success !== false && result?.found === true) {
          setProgress(result.live_progress || null);
          setUpdatedAt(result.updated_at || null);
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.debug("AVANTIQO_CODE_LIVE_PROGRESS_RETRY", error?.message || error);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }

      const currentStatus = text(
        progress?.latest_event?.status || progress?.state_status,
      ).toLowerCase();
      const currentActive = progress && !["completed", "failed", "blocked"].includes(currentStatus);
      timer = window.setTimeout(loadProgress, currentActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    }

    loadProgress();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [organizationId, progress?.mission_id, progress?.latest_event?.at, progress?.state_status]);

  if (!progress && !loading) return null;

  const files = Array.isArray(progress?.files_changed) ? progress.files_changed.slice(-12) : [];
  const verificationPassed = progress?.latest_verification_passed === true;
  const verificationFailed = progress?.latest_verification_passed === false;

  return (
    <div
      data-avantiqo-code-live-progress="true"
      className="rounded-3xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#D6A66A]/80">
            {active ? <Loader2 size={12} className="animate-spin" /> : <CircleDot size={12} />}
            Code · Live work
          </div>
          <div className="mt-2 text-sm font-light text-white/85">
            {loading && !progress ? "Connecting to the Code session…" : phaseLabel(latest?.phase)}
          </div>
          {text(latest?.description) ? (
            <div className="mt-1.5 text-xs leading-5 text-white/50">
              {latest.description}
            </div>
          ) : null}
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/45">
          {active ? "Live" : text(progress?.state_status) || "Ready"}
        </div>
      </div>

      {text(latest?.action) ? (
        <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
          <div className="text-[9px] uppercase tracking-[0.15em] text-white/35">
            Now
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/70">
            <FileCode2 size={12} className="text-[#D6A66A]" />
            {actionLabel(latest.action)}
          </div>
          {text(latest?.command) ? (
            <div className="mt-1.5 truncate font-mono text-[10px] text-white/35">
              {[latest.command, ...(latest.command_args || [])].join(" ")}
            </div>
          ) : null}
        </div>
      ) : null}

      {files.length ? (
        <div className="mt-3">
          <div className="text-[9px] uppercase tracking-[0.15em] text-white/30">
            Changed files · {progress.files_changed.length}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {files.map((filePath) => (
              <span
                key={filePath}
                title={filePath}
                className="max-w-full truncate rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-1 font-mono text-[9px] text-white/45"
              >
                {filePath}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {(verificationPassed || verificationFailed) ? (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {verificationPassed ? (
            <CheckCircle2 size={13} className="text-emerald-300/80" />
          ) : (
            <XCircle size={13} className="text-red-300/80" />
          )}
          <span className={verificationPassed ? "text-emerald-200/65" : "text-red-200/65"}>
            Verification {verificationPassed ? "passed" : "failed — repairing"}
          </span>
        </div>
      ) : null}

      {events.length > 1 ? (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <div className="text-[9px] uppercase tracking-[0.15em] text-white/30">
            Recent work
          </div>
          <div className="mt-2 space-y-1.5">
            {events.slice(1, 6).map((event, index) => (
              <div
                key={eventKey(event, index)}
                className="flex items-center justify-between gap-3 text-[10px] text-white/35"
              >
                <span className="truncate">
                  {text(event?.action) ? `${actionLabel(event.action)} · ` : ""}
                  {text(event?.description) || phaseLabel(event?.phase)}
                </span>
                <span className="shrink-0 uppercase tracking-[0.1em]">
                  {text(event?.status) || "done"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {updatedAt ? (
        <div className="mt-3 text-[9px] text-white/20">
          Updates automatically while Code works.
        </div>
      ) : null}
    </div>
  );
}
