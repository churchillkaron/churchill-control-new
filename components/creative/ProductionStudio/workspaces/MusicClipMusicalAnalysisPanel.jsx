"use client";

import { useState } from "react";
import { AudioLines, Check, Gauge, ListMusic, Music2 } from "lucide-react";

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

export default function MusicClipMusicalAnalysisPanel({
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
  const storedAnalysis = clip?.musical_analysis || null;
  const analysisMatchesCurrentSource = sourceMatches(storedAnalysis, clip);
  const analysis = analysisMatchesCurrentSource ? storedAnalysis : null;
  const storedHarmony = clip?.harmony_structure_analysis || null;
  const harmonyMatchesCurrentSource = sourceMatches(storedHarmony, clip);
  const harmony = harmonyMatchesCurrentSource ? storedHarmony : null;
  const bpmAccepted = Number.isFinite(Number(analysis?.accepted?.bpm));
  const keyAccepted = Boolean(analysis?.accepted?.key && analysis?.accepted?.mode);

  async function request(action, fields = []) {
    if (!organizationId || !projectId || !track?.id || !clip?.id || busy) return;
    setBusy(true);
    setError("");
    setStatus(action === "analyze" ? "MEASURING AUDIO" : "APPLYING TO PROJECT");
    try {
      const response = await fetch("/api/creative/music/clip-musical-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          fields,
          organization_id: organizationId,
          creative_project_id: projectId,
          track_id: track.id,
          clip_id: clip.id,
          expected_revision: sessionRevision,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Musical analysis failed");
      setStatus(action === "analyze" ? "ANALYSIS SAVED" : "PROJECT UPDATED");
      await onReload?.();
    } catch (cause) {
      setError(cause?.message || "Musical analysis failed");
      setStatus("ANALYSIS BLOCKED");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeHarmony() {
    if (!organizationId || !projectId || !track?.id || !clip?.id || busy) return;
    setBusy(true);
    setError("");
    setStatus("ANALYZING CHORDS + STRUCTURE");
    try {
      const response = await fetch("/api/creative/music/clip-harmony-structure", {
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
      if (!response.ok || body.success === false) throw new Error(body.error || "Harmony/structure analysis failed");
      setStatus("HARMONY ANALYSIS SAVED");
      await onReload?.();
    } catch (cause) {
      setError(cause?.message || "Harmony/structure analysis failed");
      setStatus("ANALYSIS BLOCKED");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-white/7 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#d6a66a]/55"><AudioLines className="h-3.5 w-3.5" /> Musical analysis</div>
          <div className="mt-1 text-[7px] leading-3 text-white/17">Measures the selected clip waveform. Metadata guessing is not used.</div>
        </div>
        <button type="button" disabled={disabled || busy} onClick={() => request("analyze")} className="rounded-lg border border-white/8 px-2.5 py-1.5 text-[8px] text-white/38 disabled:opacity-25">{busy ? status : analysis ? "Analyze BPM/key again" : "Analyze BPM + key"}</button>
      </div>

      {storedAnalysis && !analysisMatchesCurrentSource ? <div className="mt-2 text-[7px] leading-3 text-amber-100/35">Previous BPM/key analysis belongs to an older clip source or edit range. Analyze this source before applying BPM or key.</div> : null}

      {analysis ? <div className="mt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/6 bg-black/15 p-2.5">
            <div className="flex items-center gap-1.5 text-[7px] uppercase tracking-[0.12em] text-white/18"><Gauge className="h-3 w-3" /> Tempo</div>
            <div className="mt-1 text-sm font-medium text-white/55">{Number.isFinite(Number(analysis.tempo?.bpm)) ? `${Number(analysis.tempo.bpm).toFixed(1)} BPM` : "—"}</div>
            <div className="mt-1 text-[7px] text-white/18">Confidence {pct(analysis.tempo?.confidence)}{bpmAccepted ? " · accepted" : " · evidence weak"}</div>
          </div>
          <div className="rounded-lg border border-white/6 bg-black/15 p-2.5">
            <div className="flex items-center gap-1.5 text-[7px] uppercase tracking-[0.12em] text-white/18"><Music2 className="h-3 w-3" /> Key</div>
            <div className="mt-1 text-sm font-medium text-white/55">{analysis.key?.label || "—"}</div>
            <div className="mt-1 text-[7px] text-white/18">Confidence {pct(analysis.key?.confidence)}{keyAccepted ? " · accepted" : " · evidence weak"}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={disabled || busy || !bpmAccepted} onClick={() => request("apply", ["bpm"])} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300/10 px-2 py-2 text-[8px] text-emerald-100/45 disabled:opacity-20"><Check className="h-3 w-3" /> Use BPM</button>
          <button type="button" disabled={disabled || busy || !keyAccepted} onClick={() => request("apply", ["key"])} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300/10 px-2 py-2 text-[8px] text-emerald-100/45 disabled:opacity-20"><Check className="h-3 w-3" /> Use Key</button>
        </div>
        <div className="text-[7px] leading-3 text-white/14">Confidence threshold {Math.round(Number(analysis.confidence_threshold || 0.42) * 100)}%.</div>
      </div> : null}

      <div className="mt-3 border-t border-white/6 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.13em] text-white/24"><ListMusic className="h-3 w-3" /> Chords & structure</div><div className="mt-1 text-[7px] text-white/14">Major/minor chord evidence + unnamed section boundaries.</div></div>
          <button type="button" disabled={disabled || busy} onClick={analyzeHarmony} className="rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/34 disabled:opacity-20">{harmony ? "Analyze again" : "Analyze harmony"}</button>
        </div>
        {storedHarmony && !harmonyMatchesCurrentSource ? <div className="mt-2 text-[7px] text-amber-100/35">Previous chord/structure evidence belongs to an older source or edit range.</div> : null}
        {harmony ? <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1">{(harmony.accepted_chord_segments || []).slice(0, 12).map((segment, index) => <span key={`${segment.start_seconds}-${index}`} className="rounded-md border border-white/7 px-1.5 py-1 text-[7px] text-white/34">{segment.label} · {Number(segment.start_seconds).toFixed(0)}–{Number(segment.end_seconds).toFixed(0)}s · {pct(segment.confidence)}</span>)}</div>
          {!(harmony.accepted_chord_segments || []).length ? <div className="text-[7px] text-white/16">No chord segments crossed the confidence gate.</div> : null}
          <div className="rounded-lg border border-white/6 bg-black/15 p-2"><div className="text-[7px] uppercase text-white/16">Structural boundaries</div><div className="mt-1 text-[8px] text-white/32">{(harmony.structure_boundaries || []).length ? harmony.structure_boundaries.map((boundary) => `${Number(boundary.time_seconds).toFixed(0)}s`).join(" · ") : "No strong boundaries detected"}</div></div>
          <div className="text-[7px] leading-3 text-white/14">Sections remain generic/unnamed. This runtime does not claim Verse, Chorus, Bridge or other semantic labels.</div>
        </div> : null}
      </div>
      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-3 py-2 text-[8px] leading-4 text-red-100/55">{error}</div> : null}
    </div>
  );
}
