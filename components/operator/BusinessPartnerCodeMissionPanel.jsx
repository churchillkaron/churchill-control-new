"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  FileCode2,
  GitBranch,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

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

export default function BusinessPartnerCodeMissionPanel({ organizationId }) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!organizationId) {
      setProgress(null);
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

  if (!shouldShowProgress(progress)) return null;

  const active = progressIsActive(progress);
  const files = Array.isArray(progress?.files_changed) ? progress.files_changed : [];
  const visibleFiles = files.slice(-3);
  const verification = verificationLabel(progress, active);
  const VerificationIcon = verification.icon;
  const status = humanStatus(progress?.latest_event?.phase || progress?.state_status);
  const codeStudioHref = `/workspace/${organizationId}/creative/code`;

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
    </section>
  );
}
