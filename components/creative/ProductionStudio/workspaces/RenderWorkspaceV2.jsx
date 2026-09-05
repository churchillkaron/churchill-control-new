"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import RenderWorkspace from "./RenderWorkspace";

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function metric(value, suffix = "") {
  const number = finite(value);
  return number === null ? "—" : `${number}${suffix}`;
}

function StateIcon({ passed }) {
  return passed
    ? <CheckCircle2 size={11} className="text-emerald-700" />
    : <AlertTriangle size={11} className="text-amber-700" />;
}

export default function RenderWorkspaceV2({ runtime, editor }) {
  const project = runtime.projectRuntime?.current || null;
  const [snapshot, setSnapshot] = useState(null);

  const inspect = useCallback(async () => {
    if (!project?.id || !runtime.organizationId) return;
    try {
      const response = await fetch("/api/creative/mastering/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          creative_project_id: project.id,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success !== false) {
        setSnapshot(result.mastering || null);
      }
    } catch {
      // The primary Mastering workspace owns full error handling.
    }
  }, [project?.id, runtime.organizationId]);

  useEffect(() => {
    inspect();
  }, [inspect, runtime.orchestrationRuntime?.current?.inspected_at]);

  const review = snapshot?.edit_review || null;
  const integrity = snapshot?.audio?.master_integrity || null;
  const evidence = integrity?.evidence || {};
  const soundtrackPassed = !integrity?.required || (
    integrity?.integrity_passed === true && integrity?.verified === true
  );
  const reviewPassed = review?.ready_for_master === true;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F6F3EE]">
      <div className="shrink-0 border-b border-black/[0.07] bg-[#EEEAE3] px-4 py-2.5 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={11} className="text-[#8A633C]" />
              <div>
                <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Finishing preflight</div>
                <div className="text-[8px] text-[#716B63]">Current cut and final-audio evidence</div>
              </div>
            </div>

            <button type="button" onClick={() => !reviewPassed && editor?.setActiveWorkspace?.("review")} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[7px] font-semibold ${reviewPassed ? "border-emerald-700/10 bg-emerald-50 text-emerald-800" : "border-amber-700/10 bg-amber-50 text-amber-900"}`}>
              <StateIcon passed={reviewPassed} />
              Edit {reviewPassed ? "approved" : "review required"}
              {review?.open_comment_count ? ` · ${review.open_comment_count} open` : ""}
            </button>

            <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[7px] font-semibold ${soundtrackPassed ? "border-emerald-700/10 bg-emerald-50 text-emerald-800" : "border-amber-700/10 bg-amber-50 text-amber-900"}`}>
              <StateIcon passed={soundtrackPassed} />
              <Volume2 size={8} />
              Audio {integrity?.required ? (soundtrackPassed ? "verified" : "verification hold") : "standard"}
            </div>
          </div>

          {integrity?.required ? (
            <div className="flex flex-wrap items-center gap-3 text-[7px] tabular-nums text-[#716B63]">
              <span className="inline-flex items-center gap-1"><Gauge size={8} /> envelope {metric(evidence.envelope_correlation)}</span>
              <span>level Δ {metric(evidence.level_difference_db, " dB")}</span>
              <span>render RMS {metric(evidence.render_rms_dbfs, " dBFS")}</span>
              <span>max gap {metric(evidence.gaps?.maximum_contiguous_gap_seconds, "s")}</span>
            </div>
          ) : (
            <div className="text-[7px] text-[#918B83]">Professional soundtrack integrity activates when the finishing contract requires it.</div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <RenderWorkspace runtime={runtime} editor={editor} />
      </div>
    </div>
  );
}
