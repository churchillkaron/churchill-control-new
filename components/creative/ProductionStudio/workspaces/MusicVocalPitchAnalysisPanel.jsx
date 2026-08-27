"use client";

import { useState } from "react";
import { AudioWaveform, Mic2 } from "lucide-react";

import MusicVocalTuningPlanPanel from "./MusicVocalTuningPlanPanel";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "—";
}

function sourceMatches(analysis, clip) {
  return Boolean(analysis)
    && analysis.source_asset_id === clip?.source_asset_id
    && Math.abs(finite(analysis.source_offset_seconds, -1) - finite(clip?.source_offset_seconds, 0)) <= 0.001
    && Math.abs(finite(analysis.source_duration_seconds, -1) - finite(clip?.duration_seconds, 0)) <= 0.01;
}

export default function MusicVocalPitchAnalysisPanel({
  organizationId,
  projectId,
  sessionRevision = 0,
  track,
  clip,
  disabled = false,
  onReload,
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  if (track?.type !== "vocal" || !clip) return null;

  const stored = clip.vocal_pitch_analysis || null;
  const current = sourceMatches(stored, clip) ? stored : null;
  const segments = Array.isArray(current?.note_segments) ? current.note_segments : [];

  async function analyze() {
    if (!organizationId || !projectId || busy) return;
    setBusy(true);
    setError("");
    setStatus("MEASURING VOCAL PITCH");
    try {
      const response = await fetch("/api/creative/music/clip-vocal-pitch-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          creative_project_id: projectId,
          track_id: track.id,
          clip_id: clip.id,
          expected_revision: sessionRevision,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Vocal pitch analysis failed");
      setStatus("PITCH MAP SAVED");
      await onReload?.();
    } catch (cause) {
      setError(cause?.message || "Vocal pitch analysis failed");
      setStatus("ANALYSIS BLOCKED");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-white/7 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#d6a66a]/55"><Mic2 className="h-3.5 w-3.5" /> Vocal pitch map</div>
          <div className="mt-1 text-[7px] leading-3 text-white/17">Measures voiced F0, nearest note and cents deviation. Analysis only — no tuning is applied.</div>
        </div>
        <button type="button" disabled={disabled || busy} onClick={analyze} className="rounded-lg border border-white/8 px-2.5 py-1.5 text-[8px] text-white/34 disabled:opacity-20">{busy ? status : current ? "Analyze pitch again" : "Analyze vocal pitch"}</button>
      </div>

      {stored && !current ? <div className="mt-2 text-[7px] leading-3 text-amber-100/35">Previous pitch evidence belongs to an older source or edit range. Analyze this vocal clip again.</div> : null}

      {current ? <div className="mt-3 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-white/6 bg-black/15 p-2"><div className="text-[7px] uppercase text-white/15">Voiced</div><div className="mt-1 text-[10px] text-white/42">{pct(current.voiced_ratio)}</div></div>
          <div className="rounded-lg border border-white/6 bg-black/15 p-2"><div className="text-[7px] uppercase text-white/15">Confidence</div><div className="mt-1 text-[10px] text-white/42">{pct(current.mean_confidence)}</div></div>
          <div className="rounded-lg border border-white/6 bg-black/15 p-2"><div className="text-[7px] uppercase text-white/15">Stable notes</div><div className="mt-1 text-[10px] text-white/42">{segments.length}</div></div>
        </div>

        <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
          {segments.slice(0, 40).map((segment, index) => (
            <div key={`${segment.start_seconds}-${segment.note}-${index}`} className="grid grid-cols-[44px_1fr_58px] items-center gap-2 rounded-lg border border-white/6 px-2 py-1.5 text-[7px]">
              <div className="font-medium text-[#efd29f]/55">{segment.note}</div>
              <div className="text-white/24">{Number(segment.start_seconds).toFixed(2)}–{Number(segment.end_seconds).toFixed(2)}s · {pct(segment.confidence)}</div>
              <div className={`text-right ${Math.abs(finite(segment.mean_cents_deviation, 0)) <= 15 ? "text-emerald-100/40" : "text-amber-100/45"}`}>{finite(segment.mean_cents_deviation, 0) >= 0 ? "+" : ""}{finite(segment.mean_cents_deviation, 0).toFixed(1)}¢</div>
            </div>
          ))}
          {!segments.length ? <div className="rounded-lg border border-dashed border-white/7 p-3 text-center text-[7px] text-white/16">No stable note segments crossed the pitch-confidence gate.</div> : null}
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-white/6 bg-black/15 p-2 text-[7px] leading-3 text-white/16"><AudioWaveform className="mt-0.5 h-3 w-3 shrink-0" />This pitch map is evidence for a future formant-preserving note correction stage. `auto_tune_applied=false` and `formant_processing_applied=false` remain true for this analysis.</div>
      </div> : null}

      <MusicVocalTuningPlanPanel
        organizationId={organizationId}
        projectId={projectId}
        sessionRevision={sessionRevision}
        track={track}
        clip={clip}
        disabled={disabled || busy}
        onReload={onReload}
      />

      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-3 py-2 text-[8px] leading-4 text-red-100/55">{error}</div> : null}
    </div>
  );
}
