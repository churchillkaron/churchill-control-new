"use client";

import { useEffect, useState } from "react";
import { Check, LockKeyhole, RefreshCw, SlidersHorizontal, Sparkles } from "lucide-react";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export default function MusicVocalTuningPlanPanel({
  organizationId,
  projectId,
  sessionRevision = 0,
  track,
  clip,
  disabled = false,
  onReload,
}) {
  const [strength, setStrength] = useState(80);
  const [tolerance, setTolerance] = useState(10);
  const [maxCorrection, setMaxCorrection] = useState(200);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [renderReadiness, setRenderReadiness] = useState(null);
  if (track?.type !== "vocal" || !clip) return null;

  const pitch = clip.vocal_pitch_analysis || null;
  const pitchCurrent = Boolean(pitch)
    && pitch.source_asset_id === clip.source_asset_id
    && Math.abs(finite(pitch.source_offset_seconds, -1) - finite(clip.source_offset_seconds, 0)) <= 0.001
    && Math.abs(finite(pitch.source_duration_seconds, -1) - finite(clip.duration_seconds, 0)) <= 0.01;
  const plan = clip.vocal_tuning_plan?.source_asset_id === clip.source_asset_id ? clip.vocal_tuning_plan : null;
  const renderRequest = clip.vocal_tuning_render_request?.contract === "AVANTIQO_MUSIC_VOCAL_TUNING_RENDER_REQUEST_V1"
    ? clip.vocal_tuning_render_request
    : null;
  const renderPending = renderRequest?.status === "PENDING";
  const allReviewed = plan?.all_segments_reviewed === true;

  useEffect(() => {
    let cancelled = false;
    if (!organizationId) return undefined;
    fetch("/api/creative/music/vocal-tuning-render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "readiness", organization_id: organizationId }),
    })
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled && body?.success !== false) setRenderReadiness(body.readiness || null);
      })
      .catch(() => {
        if (!cancelled) setRenderReadiness(null);
      });
    return () => { cancelled = true; };
  }, [organizationId]);

  async function request(action, extra = {}) {
    if (!organizationId || !projectId || busy) return;
    setBusy(true);
    setError("");
    setStatus(action === "build" ? "BUILDING TUNING PLAN" : "SAVING NOTE REVIEW");
    try {
      const response = await fetch("/api/creative/music/vocal-tuning-plan", {
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
            preserve_within_cents: tolerance,
            max_correction_cents: maxCorrection,
            minimum_segment_confidence: 0.5,
          },
          ...extra,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Vocal tuning plan failed");
      setStatus(action === "build" ? "TUNING PLAN SAVED" : "NOTE REVIEW SAVED");
      await onReload?.();
    } catch (cause) {
      setError(cause?.message || "Vocal tuning plan failed");
      setStatus("PLAN BLOCKED");
    } finally {
      setBusy(false);
    }
  }

  async function approve(segment, targetMidi = null) {
    await request("approve_segment", {
      segment_id: segment.id,
      approved: true,
      ...(targetMidi === null ? {} : { target_midi: targetMidi }),
    });
  }

  async function render(action) {
    if (!organizationId || !projectId || !plan || busy) return;
    setBusy(true);
    setError("");
    setStatus(action === "submit" ? "SUBMITTING REVIEWED TUNING" : "CHECKING TUNING RENDER");
    try {
      const response = await fetch("/api/creative/music/vocal-tuning-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          organization_id: organizationId,
          creative_project_id: projectId,
          track_id: track.id,
          clip_id: clip.id,
          expected_revision: sessionRevision,
          ...(renderRequest?.id ? { request_id: renderRequest.id } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Vocal tuning render failed");
      if (body.pending === true) {
        setStatus("TUNING RENDER PENDING");
      } else if (body.applied_to_current_clip === true) {
        setStatus("TUNED VOCAL APPLIED");
      } else {
        setStatus(body.apply_blocker ? `RENDER SAVED · ${body.apply_blocker}` : "TUNING RENDER COMPLETE");
      }
      await onReload?.();
    } catch (cause) {
      setError(cause?.message || "Vocal tuning render failed");
      setStatus("RENDER BLOCKED");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-white/7 bg-black/15 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.14em] text-white/25"><SlidersHorizontal className="h-3 w-3" /> Tuning plan</div>
          <div className="mt-1 text-[7px] leading-3 text-white/15">Key-aware note targets. Planning/review never changes audio; rendering creates a new derived vocal asset.</div>
        </div>
        <button type="button" disabled={disabled || busy || !pitchCurrent || renderPending} onClick={() => request("build")} className="rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/34 disabled:opacity-20">{busy ? status : plan ? "Rebuild plan" : "Build tuning plan"}</button>
      </div>

      {!pitchCurrent ? <div className="mt-2 text-[7px] text-amber-100/35">Analyze the current vocal pitch map first.</div> : null}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="block"><div className="mb-1 text-[7px] uppercase text-white/15">Strength</div><input disabled={disabled || busy || renderPending} type="number" min="0" max="100" value={strength} onChange={(event) => setStrength(Math.max(0, Math.min(100, finite(event.target.value, 80))))} className="w-full rounded-lg border border-white/7 bg-black/25 px-2 py-1.5 text-[8px] text-white/42 disabled:opacity-20" /><div className="mt-1 text-[7px] text-white/12">%</div></label>
        <label className="block"><div className="mb-1 text-[7px] uppercase text-white/15">Keep ±</div><input disabled={disabled || busy || renderPending} type="number" min="0" max="50" value={tolerance} onChange={(event) => setTolerance(Math.max(0, Math.min(50, finite(event.target.value, 10))))} className="w-full rounded-lg border border-white/7 bg-black/25 px-2 py-1.5 text-[8px] text-white/42 disabled:opacity-20" /><div className="mt-1 text-[7px] text-white/12">cents</div></label>
        <label className="block"><div className="mb-1 text-[7px] uppercase text-white/15">Max shift</div><input disabled={disabled || busy || renderPending} type="number" min="0" max="600" value={maxCorrection} onChange={(event) => setMaxCorrection(Math.max(0, Math.min(600, finite(event.target.value, 200))))} className="w-full rounded-lg border border-white/7 bg-black/25 px-2 py-1.5 text-[8px] text-white/42 disabled:opacity-20" /><div className="mt-1 text-[7px] text-white/12">cents</div></label>
      </div>

      {plan ? <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-[7px] text-white/18"><span>{plan.musical_key?.label || "Project key"} · {plan.correction_segment_count || 0} proposed corrections</span><span>{plan.reviewed_segment_count || 0}/{plan.segments?.length || 0} reviewed</span></div>
        <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
          {(plan.segments || []).slice(0, 60).map((segment) => (
            <div key={segment.id} className="grid grid-cols-[1fr_70px_52px] items-center gap-2 rounded-lg border border-white/6 px-2 py-1.5 text-[7px]">
              <div className="min-w-0"><div className="truncate text-white/38">{segment.source_note} → {segment.target_note} · {segment.proposed_correction_cents >= 0 ? "+" : ""}{finite(segment.proposed_correction_cents, 0).toFixed(1)}¢</div><div className="text-white/13">{finite(segment.start_seconds, 0).toFixed(2)}–{finite(segment.end_seconds, 0).toFixed(2)}s · {Math.round(finite(segment.confidence, 0) * 100)}%</div></div>
              <input type="number" min="12" max="120" step="1" disabled={disabled || busy || renderPending} defaultValue={segment.target_midi} onBlur={(event) => { const target = Math.round(finite(event.target.value, segment.target_midi)); if (target !== segment.target_midi) void approve(segment, target); }} className="rounded-md border border-white/7 bg-black/25 px-1.5 py-1 text-[7px] text-white/35 disabled:opacity-20" title="Target MIDI note" />
              <button type="button" disabled={disabled || busy || renderPending || segment.approved} onClick={() => approve(segment)} className={`inline-flex items-center justify-center gap-1 rounded-md border px-1.5 py-1 ${segment.approved ? "border-emerald-300/10 text-emerald-100/45" : "border-white/7 text-white/30"} disabled:opacity-40`}><Check className="h-2.5 w-2.5" /> {segment.approved ? "OK" : "Approve"}</button>
            </div>
          ))}
        </div>

        {renderReadiness?.ready ? <div className="rounded-lg border border-emerald-300/10 bg-emerald-300/[0.015] p-2">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[7px] leading-3 text-emerald-100/40"><div>Vocal Correction V2 is certified and enabled for governed execution.</div><div className="mt-1 text-emerald-100/25">The worker consumes these exact reviewed note segments. Timing remains disabled until separately reviewed. Tone-preservation compensation is configured; formant preservation is not claimed.</div></div>
            {renderPending ? <button type="button" disabled={disabled || busy} onClick={() => render("status")} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/38 disabled:opacity-20"><RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} /> Check render</button> : <button type="button" disabled={disabled || busy || !allReviewed} onClick={() => render("submit")} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.03] px-2 py-1.5 text-[8px] text-emerald-100/50 disabled:opacity-20"><Sparkles className="h-3 w-3" /> Render reviewed tuning</button>}
          </div>
        </div> : <div className="flex items-start gap-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.015] p-2 text-[7px] leading-3 text-amber-100/40"><LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" /><div><div>Audio render locked: {renderReadiness?.blocker || "VOCAL_CORRECTION_READINESS_UNAVAILABLE"}.</div><div className="mt-1 text-amber-100/28">The owned TorchCREPE + Signalsmith engine exists, but Workstation rendering stays fail-closed until its production certification gate is enabled. Reviewed targets remain saved.</div></div></div>}

        {renderRequest ? <div className="text-[7px] text-white/14">Render request {renderRequest.status || "UNKNOWN"}{renderRequest.provider_status ? ` · provider ${renderRequest.provider_status}` : ""}{renderRequest.derived_asset_id ? ` · derived ${String(renderRequest.derived_asset_id).slice(0, 8)}…` : ""}</div> : null}
      </div> : null}
      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/50">{error}</div> : null}
    </div>
  );
}
