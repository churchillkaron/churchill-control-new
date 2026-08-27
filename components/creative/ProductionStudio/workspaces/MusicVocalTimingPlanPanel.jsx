"use client";

import { useState } from "react";
import { Check, Clock3, LockKeyhole, MoveHorizontal } from "lucide-react";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function currentSource(evidence, clip) {
  return Boolean(evidence)
    && evidence.source_asset_id === clip?.source_asset_id
    && Math.abs(finite(evidence.source_offset_seconds, -1) - finite(clip?.source_offset_seconds, 0)) <= 0.001
    && Math.abs(finite(evidence.source_duration_seconds, -1) - finite(clip?.duration_seconds, 0)) <= 0.01;
}

export default function MusicVocalTimingPlanPanel({
  organizationId,
  projectId,
  sessionRevision = 0,
  track,
  clip,
  disabled = false,
  onReload,
}) {
  const [strength, setStrength] = useState(45);
  const [maxShiftMs, setMaxShiftMs] = useState(80);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  if (track?.type !== "vocal" || !clip) return null;

  const storedAnalysis = clip.vocal_timing_analysis || null;
  const analysis = currentSource(storedAnalysis, clip) ? storedAnalysis : null;
  const storedPlan = clip.vocal_timing_plan || null;
  const plan = currentSource(storedPlan, clip) ? storedPlan : null;

  async function request(action, extra = {}) {
    if (!organizationId || !projectId || busy) return;
    setBusy(true);
    setError("");
    setStatus(action === "analyze" ? "MEASURING PHRASE TIMING" : action === "build" ? "BUILDING TIMING PLAN" : "SAVING PHRASE REVIEW");
    try {
      const response = await fetch("/api/creative/music/vocal-timing-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          organization_id: organizationId,
          creative_project_id: projectId,
          track_id: track.id,
          clip_id: clip.id,
          expected_revision: sessionRevision,
          settings: {
            correction_strength: strength / 100,
            max_shift_ms: maxShiftMs,
            beat_offset_seconds: 0,
          },
          ...extra,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Vocal timing plan failed");
      setStatus(action === "analyze" ? "TIMING EVIDENCE SAVED" : action === "build" ? "TIMING PLAN SAVED" : "PHRASE REVIEW SAVED");
      await onReload?.();
    } catch (cause) {
      setError(cause?.message || "Vocal timing plan failed");
      setStatus("TIMING PLAN BLOCKED");
    } finally {
      setBusy(false);
    }
  }

  async function review(phrase, shiftMs = null) {
    await request("review_phrase", {
      phrase_id: phrase.id,
      approved: true,
      ...(shiftMs === null ? {} : { shift_ms: shiftMs }),
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-white/7 bg-black/15 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.14em] text-white/25"><Clock3 className="h-3 w-3" /> Phrase timing</div>
          <div className="mt-1 text-[7px] leading-3 text-white/15">Measures whole vocal phrase starts against the project eighth-note grid. Syllables and note lengths are not stretched.</div>
        </div>
        <button type="button" disabled={disabled || busy} onClick={() => request("analyze")} className="rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/34 disabled:opacity-20">{busy ? status : analysis ? "Analyze again" : "Analyze timing"}</button>
      </div>

      {storedAnalysis && !analysis ? <div className="mt-2 text-[7px] text-amber-100/35">Previous timing evidence belongs to an older vocal source or edit range.</div> : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block"><div className="mb-1 text-[7px] uppercase text-white/15">Strength</div><input type="number" min="0" max="100" disabled={disabled || busy} value={strength} onChange={(event) => setStrength(Math.max(0, Math.min(100, finite(event.target.value, 45))))} className="w-full rounded-lg border border-white/7 bg-black/25 px-2 py-1.5 text-[8px] text-white/42 disabled:opacity-20" /><div className="mt-1 text-[7px] text-white/12">%</div></label>
        <label className="block"><div className="mb-1 text-[7px] uppercase text-white/15">Max phrase move</div><input type="number" min="10" max="250" disabled={disabled || busy} value={maxShiftMs} onChange={(event) => setMaxShiftMs(Math.max(10, Math.min(250, finite(event.target.value, 80))))} className="w-full rounded-lg border border-white/7 bg-black/25 px-2 py-1.5 text-[8px] text-white/42 disabled:opacity-20" /><div className="mt-1 text-[7px] text-white/12">milliseconds</div></label>
      </div>

      {analysis ? <div className="mt-3 rounded-lg border border-white/6 bg-black/15 p-2 text-[7px] text-white/20"><span>{analysis.phrase_count || 0} phrases measured · {analysis.suggested_move_count || 0} safe move suggestions · {finite(analysis.bpm, 0).toFixed(1)} BPM</span><button type="button" disabled={disabled || busy} onClick={() => request("build")} className="ml-2 rounded-md border border-white/7 px-1.5 py-1 text-white/34 disabled:opacity-20">{plan ? "Rebuild review plan" : "Build review plan"}</button></div> : null}

      {plan ? <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-[7px] text-white/18"><span>{plan.suggested_move_count || 0} suggested phrase moves</span><span>{plan.reviewed_phrase_count || 0}/{plan.phrases?.length || 0} reviewed</span></div>
        <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
          {(plan.phrases || []).slice(0, 80).map((phrase) => (
            <div key={phrase.id} className="grid grid-cols-[1fr_74px_54px] items-center gap-2 rounded-lg border border-white/6 px-2 py-1.5 text-[7px]">
              <div className="min-w-0"><div className="truncate text-white/38">Phrase {phrase.phrase_index + 1} · {finite(phrase.source_start_seconds, 0).toFixed(2)}s → {finite(phrase.target_start_seconds, phrase.source_start_seconds).toFixed(2)}s</div><div className="text-white/13">Raw {finite(phrase.raw_shift_ms, 0) >= 0 ? "+" : ""}{finite(phrase.raw_shift_ms, 0).toFixed(1)} ms · {phrase.safety_reason || "—"}</div></div>
              <input type="number" min={-maxShiftMs} max={maxShiftMs} step="1" disabled={disabled || busy || !phrase.eligible} defaultValue={finite(phrase.proposed_shift_ms, 0)} onBlur={(event) => { const shift = finite(event.target.value, phrase.proposed_shift_ms); if (Math.abs(shift - finite(phrase.proposed_shift_ms, 0)) > 0.01) void review(phrase, shift); }} className="rounded-md border border-white/7 bg-black/25 px-1.5 py-1 text-[7px] text-white/35 disabled:opacity-20" title="Phrase shift in milliseconds" />
              <button type="button" disabled={disabled || busy || phrase.approved || !phrase.eligible} onClick={() => review(phrase)} className={`inline-flex items-center justify-center gap-1 rounded-md border px-1.5 py-1 ${phrase.approved ? "border-emerald-300/10 text-emerald-100/45" : "border-white/7 text-white/30"} disabled:opacity-40`}><Check className="h-2.5 w-2.5" /> {phrase.approved ? "OK" : "Approve"}</button>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.015] p-2 text-[7px] leading-3 text-amber-100/38"><LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" /><div><div>Timing render is not connected yet.</div><div className="mt-1 text-amber-100/25">The plan preserves whole phrases, uses no time stretch and rejects collisions. The DSP worker will only receive these exact approved moves after the render contract is added.</div></div></div>
        <div className="flex items-start gap-2 text-[7px] leading-3 text-white/14"><MoveHorizontal className="mt-0.5 h-3 w-3 shrink-0" />Moving a phrase changes only its placement inside a safe local pocket. Internal consonant, note, vibrato and syllable timing remain unchanged.</div>
      </div> : null}

      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/50">{error}</div> : null}
    </div>
  );
}
