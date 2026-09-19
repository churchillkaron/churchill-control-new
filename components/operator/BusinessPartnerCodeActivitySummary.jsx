"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

import { codeProgressIsActive, useCodeProgressFeed } from "@/components/operator/CodeProgressFeedProvider";

const RECENT_VISIBLE_MS = 10 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function timestamp(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldShow(progress) {
  if (!progress) return false;
  if (codeProgressIsActive(progress)) return true;
  const updatedAt = Math.max(timestamp(progress?.updated_at), timestamp(progress?.latest_event?.at));
  return updatedAt > 0 && Date.now() - updatedAt <= RECENT_VISIBLE_MS;
}

function phaseText(progress) {
  return text(progress?.engineering_plan?.current_phase || progress?.latest_event?.phase || progress?.state_status).toLowerCase();
}

function narration(progress, active) {
  if (progress?.latest_verification_passed === true) {
    return "The work is complete and the result has passed verification.";
  }
  if (progress?.latest_verification_passed === false) {
    return "I found a verification problem, so I am keeping the work open for correction instead of calling it finished.";
  }

  const phase = phaseText(progress);
  const filesChanged = Array.isArray(progress?.files_changed) && progress.files_changed.length > 0;

  if (/verif|test|accept|review|proof|quality/.test(phase)) {
    return "The change is in place. I am checking the workflow now to make sure it behaves correctly.";
  }
  if (filesChanged || /implement|edit|repair|change|patch|write|mutation/.test(phase)) {
    return "I found the area that needs attention and I am applying the correction now while keeping the existing behavior intact.";
  }
  if (/inspect|research|discover|read|scan|analy|evidence|repository|diagnos/.test(phase)) {
    return "I am checking the relevant workflow and evidence to find the cause before changing anything.";
  }
  return active
    ? "I am working through the request now and keeping the original goal in scope."
    : "The latest engineering work is ready for review.";
}

export default function BusinessPartnerCodeActivitySummary({ organizationId }) {
  const { progress, active } = useCodeProgressFeed();
  if (!shouldShow(progress)) return null;

  const verified = progress?.latest_verification_passed;
  const icon = verified === true ? CheckCircle2 : verified === false ? XCircle : active ? Loader2 : Activity;
  const Icon = icon;
  const stateLabel = verified === true ? "Verified" : verified === false ? "Needs another pass" : active ? "Working" : "Ready";
  const stateTone = verified === true
    ? "text-emerald-700 bg-emerald-50 border-emerald-700/15"
    : verified === false
      ? "text-red-700 bg-red-50 border-red-700/15"
      : "text-[#77716A] bg-white border-black/[0.08]";

  return (
    <section className="border-b border-black/[0.07] bg-[#FBFAF8] px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-[#9A744B]">
              <Icon size={11} className={active && verified == null ? "animate-spin" : ""} />
              {active ? "Working on it" : "Code work"}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] ${stateTone}`}>
              {stateLabel}
            </span>
          </div>

          <div className="mt-2 text-[12px] font-medium leading-5 text-[#37332E]">
            {text(progress?.objective) || "Working on your request"}
          </div>
          <div className="mt-1.5 text-[11px] leading-5 text-[#77716A]">
            {narration(progress, active)}
          </div>
        </div>

        <Link
          href={`/workspace/${organizationId}/creative/code`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#9A744B]/20 bg-white px-2.5 py-1.5 text-[9px] font-medium text-[#8B663E] transition hover:border-[#9A744B]/40 hover:bg-[#FFFDFC]"
        >
          View in Code Studio
          <ArrowUpRight size={10} />
        </Link>
      </div>

      {!active && verified == null ? (
        <div className="mt-3 flex items-center gap-1.5 text-[9px] text-[#8F8A82]">
          <ShieldCheck size={10} />
          No final verification has been recorded yet.
        </div>
      ) : null}
    </section>
  );
}
