"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  FileCode2,
  GitBranch,
  Loader2,
  MessageSquareMore,
  Send,
  ShieldCheck,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const ACTIVE_POLL_MS = 1800;
const IDLE_POLL_MS = 6000;
const ACTIVE_STALE_MS = 30 * 60 * 1000;
const RECENT_VISIBLE_MS = 10 * 60 * 1000;
const ACTIVE_STATES = new Set([
  "active",
  "executing",
  "in_progress",
  "pending",
  "planner_pending",
  "queued",
  "running",
  "verifying",
  "working",
]);

function text(value) {
  return String(value ?? "").trim();
}

function eventTimestamp(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function progressUpdatedAt(progress) {
  return Math.max(
    eventTimestamp(progress?.updated_at),
    eventTimestamp(progress?.latest_event?.at),
  );
}

function progressIsActive(progress) {
  if (!progress) return false;
  const updatedAt = progressUpdatedAt(progress);
  if (updatedAt && Date.now() - updatedAt > ACTIVE_STALE_MS) return false;

  const stateStatus = text(progress.state_status).toLowerCase();
  const eventStatus = text(progress.latest_event?.status).toLowerCase();
  return ACTIVE_STATES.has(stateStatus) || ACTIVE_STATES.has(eventStatus);
}

function shouldShowProgress(progress) {
  if (!progress) return false;
  if (progressIsActive(progress)) return true;
  const updatedAt = progressUpdatedAt(progress);
  return updatedAt > 0 && Date.now() - updatedAt <= RECENT_VISIBLE_MS;
}

function humanStatus(value) {
  const normalized = text(value).replaceAll("_", " ").toLowerCase();
  if (!normalized) return "Working";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function verificationLabel(progress, active) {
  if (progress?.latest_verification_passed === true) {
    return {
      label: "Verified",
      className: "border-emerald-700/15 bg-emerald-50 text-emerald-700",
      icon: CheckCircle2,
    };
  }
  if (progress?.latest_verification_passed === false) {
    return {
      label: "Verification failed",
      className: "border-red-700/15 bg-red-50 text-red-700",
      icon: XCircle,
    };
  }
  return {
    label: active ? "Verification pending" : "No final verification",
    className: "border-black/[0.08] bg-[#F7F5F1] text-[#77716A]",
    icon: ShieldCheck,
  };
}

function fileSet(value) {
  return new Set(Array.isArray(value) ? value.map(text).filter(Boolean) : []);
}

export default function BusinessPartnerCodeMissionPanel({ organizationId }) {
  const [progress, setProgress] = useState(null);
  const [control, setControl] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [controlPending, setControlPending] = useState(false);
  const [controlError, setControlError] = useState("");
  const [controlNotice, setControlNotice] = useState("");
  const [steerBaseline, setSteerBaseline] = useState(null);

  useEffect(() => {
    if (!organizationId) {
      setProgress(null);
      setControl(null);
      return undefined;
    }

    const controller = new AbortController();
    let timer = null;

    async function poll() {
      let active = false;
      try {
        const response = await fetch(
          `/api/operator/code/progress?organizationId=${encodeURIComponent(organizationId)}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const result = await response.json().catch(() => ({}));
        if (!controller.signal.aborted && response.ok && result?.success === true) {
          const nextProgress = result?.live_progress || null;
          active = progressIsActive(nextProgress);
          setProgress(nextProgress);

          const missionId = text(nextProgress?.mission_id);
          if (missionId) {
            const controlResponse = await fetch(
              `/api/operator/code/intervention?organizationId=${encodeURIComponent(organizationId)}&missionId=${encodeURIComponent(missionId)}`,
              {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                signal: controller.signal,
              },
            );
            const controlResult = await controlResponse.json().catch(() => ({}));
            if (!controller.signal.aborted && controlResponse.ok && controlResult?.success === true) {
              setControl(controlResult.control || null);
            }
          } else {
            setControl(null);
          }
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.debug("AVANTIQO_BUSINESS_PARTNER_CODE_PROGRESS_FAILED", error?.message || error);
        }
      }

      if (!controller.signal.aborted) {
        timer = window.setTimeout(poll, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
      }
    }

    poll();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [organizationId]);

  useEffect(() => {
    const missionId = text(progress?.mission_id);
    if (!steerBaseline || steerBaseline.missionId === missionId) return;
    setSteerBaseline(null);
    setControlNotice("");
    setControlError("");
    setInstruction("");
  }, [progress?.mission_id, steerBaseline]);

  const active = progressIsActive(progress);
  const files = Array.isArray(progress?.files_changed) ? progress.files_changed : [];
  const visibleFiles = files.slice(-3);
  const verification = verificationLabel(progress, active);
  const VerificationIcon = verification.icon;
  const status = humanStatus(progress?.latest_event?.phase || progress?.state_status);
  const codeStudioHref = `/workspace/${organizationId}/creative/code`;
  const verifiedReviewReady = !active && progress?.latest_verification_passed === true;
  const missionId = text(progress?.mission_id);

  const sinceSteer = useMemo(() => {
    if (!steerBaseline || steerBaseline.missionId !== missionId) return null;
    const before = fileSet(steerBaseline.files);
    const newlyTouchedFiles = files.filter((file) => !before.has(text(file)));
    const operationDelta = Math.max(
      0,
      Number(progress?.completed_operation_count || 0) - Number(steerBaseline.operations || 0),
    );
    return { newlyTouchedFiles, operationDelta };
  }, [files, missionId, progress?.completed_operation_count, steerBaseline]);

  if (!shouldShowProgress(progress)) return null;

  async function submitControl(action) {
    if (!organizationId || !missionId || controlPending) return;
    const cleanInstruction = text(instruction);
    if (action !== "APPROVE_PATCH" && !cleanInstruction) return;

    setControlPending(true);
    setControlError("");
    setControlNotice("");
    try {
      const response = await fetch("/api/operator/code/intervention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          mission_id: missionId,
          action,
          ...(cleanInstruction ? { instruction: cleanInstruction } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success !== true) {
        throw new Error(result?.error || "Code mission control failed");
      }

      if (result.queued_for_safe_boundary === true) {
        setSteerBaseline({
          missionId,
          files: [...files],
          operations: Number(progress?.completed_operation_count || 0),
        });
        setControlNotice("Queued for the next safe engineering boundary. The same mission will continue with this instruction.");
      } else if (action === "APPROVE_PATCH") {
        setControlNotice("Preview patch approved for review. No commit or deployment was authorized.");
      } else {
        setControlNotice("Changes recorded. Business Partner will carry them into the next governed engineering continuation.");
        window.dispatchEvent(
          new CustomEvent("avantiqo:home-command", {
            detail: {
              source: "text",
              message: `Continue the Code work from mission ${missionId}. Preserve the verified context and address these requested changes: ${cleanInstruction}`,
            },
          }),
        );
      }
      setInstruction("");
      setControl((current) => ({
        ...(current || {}),
        pending_intervention:
          result.queued_for_safe_boundary === true ? result.control || null : current?.pending_intervention || null,
        latest_review:
          result.review_recorded === true ? result.control || null : current?.latest_review || null,
      }));
    } catch (error) {
      setControlError(text(error?.message || error) || "Code mission control failed");
    } finally {
      setControlPending(false);
    }
  }

  const pendingIntervention = control?.pending_intervention || null;
  const lastApplied = control?.last_applied_intervention || null;
  const latestReview = control?.latest_review || null;

  return (
    <section
      data-avantiqo-business-partner-code-mission="true"
      className="border-b border-black/[0.07] bg-[#FBFAF8] px-5 py-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-[#9A744B]">
              {active ? <Loader2 size={11} className="animate-spin" /> : <Activity size={11} />}
              Code mission
            </span>
            <span className="rounded-full border border-black/[0.08] bg-white px-2 py-0.5 text-[9px] text-[#77716A]">
              {status}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] ${verification.className}`}>
              <VerificationIcon size={10} />
              {verification.label}
            </span>
          </div>

          <div className="mt-2 text-[12px] font-medium leading-5 text-[#37332E]">
            {progress?.objective || progress?.latest_event?.description || "Avantiqo Code engineering activity"}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[#8F8A82]">
            {progress?.ref ? (
              <span className="inline-flex items-center gap-1">
                <GitBranch size={10} />
                {progress.ref}
              </span>
            ) : null}
            <span>{progress?.completed_operation_count || 0} operations</span>
            <span>{files.length} files changed</span>
            {progress?.blocker_count ? <span>{progress.blocker_count} blockers</span> : null}
          </div>

          {visibleFiles.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleFiles.map((file) => (
                <span
                  key={file}
                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-black/[0.07] bg-white px-2 py-1 font-mono text-[9px] text-[#6F6A63]"
                  title={file}
                >
                  <FileCode2 size={9} />
                  <span className="max-w-[220px] truncate">{file}</span>
                </span>
              ))}
            </div>
          ) : null}

          {progress?.latest_test_command ? (
            <div className="mt-2 truncate font-mono text-[9px] text-[#9A958D]" title={[progress.latest_test_command, ...(progress.latest_test_args || [])].filter(Boolean).join(" ")}>
              {[progress.latest_test_command, ...(progress.latest_test_args || [])].filter(Boolean).join(" ")}
              {progress.latest_test_exit_code !== null && progress.latest_test_exit_code !== undefined
                ? ` · exit ${progress.latest_test_exit_code}`
                : ""}
            </div>
          ) : null}
        </div>

        <Link
          data-avantiqo-open-code-studio="true"
          href={codeStudioHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#9A744B]/20 bg-white px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-[0.1em] text-[#8B663E] transition hover:border-[#9A744B]/40 hover:bg-[#FFFDFC]"
        >
          Open Code Studio
          <ArrowUpRight size={10} />
        </Link>
      </div>

      {pendingIntervention ? (
        <div className="mt-3 rounded-lg border border-amber-700/10 bg-amber-50/70 px-3 py-2 text-[10px] leading-4 text-amber-900/70">
          Steering queued · it will apply at the next safe engineering boundary.
        </div>
      ) : lastApplied ? (
        <div className="mt-3 rounded-lg border border-emerald-700/10 bg-emerald-50/70 px-3 py-2 text-[10px] leading-4 text-emerald-900/65">
          Latest steering applied to this same mission.
          {sinceSteer ? ` Since then: +${sinceSteer.operationDelta} operations${sinceSteer.newlyTouchedFiles.length ? ` · ${sinceSteer.newlyTouchedFiles.length} newly touched file(s)` : ""}.` : ""}
        </div>
      ) : null}

      {active ? (
        <div data-avantiqo-code-steering="true" className="mt-3 rounded-xl border border-black/[0.07] bg-white p-3">
          <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B663E]">
            <MessageSquareMore size={11} />
            Steer active mission
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitControl("STEER");
                }
              }}
              disabled={controlPending || Boolean(pendingIntervention)}
              placeholder="Change direction without starting a new mission…"
              className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-[#FCFBF9] px-3 py-2 text-[11px] text-[#37332E] outline-none placeholder:text-[#AAA59D] focus:border-[#9A744B]/35 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => submitControl("STEER")}
              disabled={controlPending || Boolean(pendingIntervention) || !instruction.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#332C24] px-3 py-2 text-[9px] font-medium uppercase tracking-[0.1em] text-white transition hover:bg-[#4A3E31] disabled:opacity-35"
            >
              {controlPending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
              Apply
            </button>
          </div>
          <div className="mt-1.5 text-[9px] leading-4 text-[#9B968E]">
            Applied at the next safe engineering boundary · same mission · no commit or deploy authority.
          </div>
        </div>
      ) : verifiedReviewReady ? (
        <div data-avantiqo-code-review="true" className="mt-3 rounded-xl border border-black/[0.07] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B663E]">Verified patch review</div>
              <div className="mt-1 text-[10px] leading-4 text-[#858077]">Approve the preview or request another governed engineering continuation. Review approval never commits or deploys.</div>
            </div>
            <button
              type="button"
              onClick={() => submitControl("APPROVE_PATCH")}
              disabled={controlPending || latestReview?.action === "APPROVE_PATCH"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/15 bg-emerald-50 px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-[0.1em] text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-40"
            >
              <ThumbsUp size={10} />
              {latestReview?.action === "APPROVE_PATCH" ? "Preview approved" : "Approve preview"}
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={controlPending}
              placeholder="Request changes to the verified result…"
              className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-[#FCFBF9] px-3 py-2 text-[11px] text-[#37332E] outline-none placeholder:text-[#AAA59D] focus:border-[#9A744B]/35 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => submitControl("REQUEST_CHANGES")}
              disabled={controlPending || !instruction.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#9A744B]/20 bg-[#FFFDFC] px-3 py-2 text-[9px] font-medium uppercase tracking-[0.1em] text-[#8B663E] transition hover:border-[#9A744B]/40 disabled:opacity-35"
            >
              <MessageSquareMore size={10} />
              Request changes
            </button>
          </div>
        </div>
      ) : null}

      {controlNotice ? <div className="mt-2 text-[9px] leading-4 text-[#6F7E68]">{controlNotice}</div> : null}
      {controlError ? <div className="mt-2 text-[9px] leading-4 text-red-700/70">{controlError}</div> : null}
    </section>
  );
}
