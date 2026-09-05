"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import RenderWorkspaceV4 from "./RenderWorkspaceV4";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatTimecode(seconds, fps = 25) {
  const rate = Number.isFinite(Number(fps)) && Number(fps) > 0 ? Number(fps) : 25;
  const totalFrames = Math.max(0, Math.round(finite(seconds) * rate));
  const frame = totalFrames % Math.max(1, Math.round(rate));
  const totalSeconds = Math.floor(totalFrames / rate);
  const second = totalSeconds % 60;
  const minute = Math.floor(totalSeconds / 60) % 60;
  const hour = Math.floor(totalSeconds / 3600);
  return [hour, minute, second, frame]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function UnitState({ unit }) {
  if (!unit?.decision) return <span className="text-amber-800">unreviewed</span>;
  if (unit.decision.classification === "EXPECTED") {
    return <span className="text-emerald-800">expected</span>;
  }
  if (unit.decision.resolution_state === "RESOLVED") {
    return <span className="text-emerald-800">unexpected · resolved</span>;
  }
  return <span className="text-red-800">unexpected · open</span>;
}

export default function RenderWorkspaceV5({ runtime, editor }) {
  const project = runtime.projectRuntime?.current || null;
  const [review, setReview] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [actingKey, setActingKey] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState({});

  const request = useCallback(async (payload = {}) => {
    if (!project?.id || !runtime.organizationId) return null;
    const response = await fetch("/api/creative/mastering/delta-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_id: runtime.organizationId,
        creative_project_id: project.id,
        ...payload,
      }),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) {
      throw new Error(body.error || "Master change review failed");
    }
    return body.result || null;
  }, [project?.id, runtime.organizationId]);

  const inspect = useCallback(async () => {
    if (!project?.id || !runtime.organizationId) return;
    setLoading(true);
    setError("");
    try {
      setReview(await request({ action: "inspect" }));
    } catch (inspectError) {
      setError(inspectError?.message || "Master change review failed");
    } finally {
      setLoading(false);
    }
  }, [project?.id, request, runtime.organizationId]);

  useEffect(() => {
    inspect();
  }, [inspect, runtime.orchestrationRuntime?.current?.inspected_at]);

  const fps = finite(review?.comparison?.visual?.frame_rate, 25);
  const units = review?.units || [];
  const openUnits = units.filter((unit) => !unit.resolved);
  const resolvedUnits = units.filter((unit) => unit.resolved);
  const unexpectedOpen = units.filter((unit) =>
    unit.decision?.classification === "UNEXPECTED" &&
    unit.decision?.resolution_state !== "RESOLVED",
  );
  const canFinalize = Boolean(
    review?.required &&
    review?.comparison?.report_id &&
    units.length > 0 &&
    openUnits.length === 0 &&
    !review?.resolution,
  );
  const summaryTone = useMemo(() => {
    if (!review?.required) return "border-black/[0.07] bg-white/70 text-[#716B63]";
    if (review?.passed) return "border-emerald-700/10 bg-emerald-50 text-emerald-900";
    if (unexpectedOpen.length) return "border-red-700/10 bg-red-50 text-red-900";
    return "border-amber-700/10 bg-amber-50 text-amber-900";
  }, [review?.passed, review?.required, unexpectedOpen.length]);

  const decide = useCallback(async (unit, classification, resolutionState) => {
    const note = String(notes[unit.key] || "").trim();
    if (classification === "UNEXPECTED" && !note) {
      setError("Unexpected changes require a reviewer note before they can be recorded.");
      return;
    }
    setActingKey(unit.key);
    setError("");
    try {
      const next = await request({
        action: "decide",
        right_master_asset_node_id: review?.master?.id || null,
        change_key: unit.key,
        classification,
        resolution_state: resolutionState,
        note,
        annotation: {
          start_frame: unit.start_frame ?? null,
          end_frame: unit.end_frame ?? null,
          start_seconds: unit.start_seconds ?? null,
          end_seconds: unit.end_seconds ?? null,
        },
      });
      setReview(next);
    } catch (decisionError) {
      setError(decisionError?.message || "Could not save change decision");
    } finally {
      setActingKey("");
    }
  }, [notes, request, review?.master?.id]);

  const finalize = useCallback(async () => {
    setFinalizing(true);
    setError("");
    try {
      setReview(await request({
        action: "finalize",
        right_master_asset_node_id: review?.master?.id || null,
        notes: "All detected changes in the current primary master have been reviewed and resolved.",
      }));
    } catch (finalizeError) {
      setError(finalizeError?.message || "Could not finalize revision resolution");
    } finally {
      setFinalizing(false);
    }
  }, [request, review?.master?.id]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F6F3EE]">
      <div className="shrink-0 border-b border-black/[0.07] bg-[#E9E3DA] px-4 py-2.5 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ClipboardCheck size={11} className="text-[#8A633C]" />
            <div>
              <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Revision resolution</div>
              <div className="text-[8px] text-[#716B63]">Every detected current-master change must be dispositioned before release readiness can pass.</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loading ? <Loader2 size={10} className="animate-spin text-[#8A633C]" /> : null}
            <button type="button" onClick={() => setExpanded((value) => !value)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/[0.08] bg-white/70 px-2.5 text-[7px] font-semibold text-[#665F57]">
              {review?.required ? `${resolvedUnits.length}/${units.length} reviewed` : "No prior master"}
              {expanded ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
            </button>
          </div>
        </div>

        <div className={`mt-2 rounded-lg border px-3 py-2 text-[7px] leading-4 ${summaryTone}`}>
          {!review?.required
            ? "This is the first primary master, so no revision-delta sign-off is required."
            : review?.passed
              ? "Current master revision resolution is complete and bound to this comparison identity, decision set and checksum."
              : review?.blocker === "MASTER_DELTA_COMPARISON_REQUIRED"
                ? "Generate decoded comparison evidence for the previous and current primary masters before revision review can start."
                : review?.blocker === "MASTER_DELTA_INTERVAL_EVIDENCE_TRUNCATED"
                  ? "Detected change evidence exceeded the persisted interval set. Release is blocked until complete comparison evidence is produced."
                  : `${openUnits.length} change item${openUnits.length === 1 ? "" : "s"} still require review${unexpectedOpen.length ? `; ${unexpectedOpen.length} unexpected change${unexpectedOpen.length === 1 ? " is" : "s are"} unresolved` : ""}.`}
        </div>
        {error ? <div className="mt-2 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[7px] text-red-800">{error}</div> : null}

        {expanded && review?.required && review?.comparison?.report_id ? (
          <div className="mt-3 rounded-xl border border-black/[0.08] bg-[#F8F6F2] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[7px] font-semibold text-[#403C37]">Current primary master change obligations</div>
                <div className="mt-0.5 text-[6.5px] text-[#918B83]">Comparison {String(review.comparison.identity || "").slice(0, 12)}… · decisions are immutable and later decisions supersede earlier ones.</div>
              </div>
              {review.resolution ? (
                <div className="inline-flex items-center gap-1 rounded-full border border-emerald-700/10 bg-emerald-50 px-2.5 py-1 text-[7px] font-semibold text-emerald-800">
                  <ShieldCheck size={8} /> Revision signed off
                </div>
              ) : (
                <button type="button" onClick={finalize} disabled={!canFinalize || finalizing} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2F2A25] px-3 text-[7px] font-semibold text-white disabled:opacity-30">
                  {finalizing ? <Loader2 size={8} className="animate-spin" /> : <ShieldCheck size={8} />}
                  Finalize revision resolution
                </button>
              )}
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {units.map((unit) => {
                const busy = actingKey === unit.key;
                const isUnexpected = unit.decision?.classification === "UNEXPECTED";
                const timeLabel = unit.kind === "VISUAL_INTERVAL"
                  ? `${formatTimecode(unit.start_seconds, fps)} · frames ${unit.start_frame}–${unit.end_frame}`
                  : unit.kind === "PROGRAM_AUDIO_DELTA"
                    ? "Program audio · full overlap"
                    : "Comparison limitation";
                return (
                  <div key={unit.key} className={`rounded-xl border p-3 ${unit.resolved ? "border-emerald-700/10 bg-white" : isUnexpected ? "border-red-700/10 bg-red-50/40" : "border-amber-700/10 bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[7px] font-semibold text-[#403C37]">{unit.title}</div>
                        <div className="mt-0.5 font-mono text-[6.5px] text-[#8A8178]">{timeLabel}</div>
                      </div>
                      <div className="shrink-0 text-[6.5px] font-semibold"><UnitState unit={unit} /></div>
                    </div>
                    <div className="mt-2 text-[6.5px] leading-3.5 text-[#716B63]">{unit.description}</div>
                    <textarea
                      value={notes[unit.key] ?? unit.decision?.note ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [unit.key]: event.target.value }))}
                      placeholder="Reviewer note — required for unexpected changes"
                      className="mt-2 min-h-14 w-full resize-y rounded-lg border border-black/[0.08] bg-[#FBFAF7] px-2.5 py-2 text-[7px] leading-4 text-[#4F4943] outline-none placeholder:text-[#AAA198]"
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" disabled={busy} onClick={() => decide(unit, "EXPECTED", "NONE")} className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-700/10 bg-emerald-50 px-2.5 text-[6.5px] font-semibold text-emerald-800 disabled:opacity-40">
                        {busy ? <Loader2 size={7} className="animate-spin" /> : <CheckCircle2 size={7} />} Expected
                      </button>
                      <button type="button" disabled={busy} onClick={() => decide(unit, "UNEXPECTED", "OPEN")} className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-700/10 bg-red-50 px-2.5 text-[6.5px] font-semibold text-red-800 disabled:opacity-40">
                        <AlertTriangle size={7} /> Unexpected · open
                      </button>
                      <button type="button" disabled={busy} onClick={() => decide(unit, "UNEXPECTED", "RESOLVED")} className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[6.5px] font-semibold text-[#665F57] disabled:opacity-40">
                        <ShieldCheck size={7} /> Unexpected · resolved
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {!units.length && review.no_detected_content_delta ? (
              <div className="mt-3 rounded-lg border border-emerald-700/10 bg-emerald-50 px-3 py-2 text-[7px] text-emerald-900">No decoded visual, program-audio or comparison-limitation delta requires human disposition for this master pair.</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <RenderWorkspaceV4 runtime={runtime} editor={editor} />
      </div>
    </div>
  );
}
