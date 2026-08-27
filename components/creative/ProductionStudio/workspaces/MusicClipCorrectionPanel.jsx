"use client";

import { useMemo, useState } from "react";
import { Gauge, Music2, ShieldCheck } from "lucide-react";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export default function MusicClipCorrectionPanel({
  organizationId,
  projectId,
  sessionRevision = 0,
  track,
  clip,
  disabled = false,
  onReload,
}) {
  const [semitones, setSemitones] = useState(0);
  const [cents, setCents] = useState(0);
  const [timingPercent, setTimingPercent] = useState(100);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const totalPitch = useMemo(() => finite(semitones, 0) + finite(cents, 0) / 100, [semitones, cents]);
  const changed = Math.abs(totalPitch) >= 0.0001 || Math.abs(finite(timingPercent, 100) - 100) >= 0.0001;

  async function applyCorrection() {
    if (!track?.id || !clip?.id || !organizationId || !projectId || !changed || busy) return;
    setBusy(true);
    setError("");
    setStatus("RENDERING 24-BIT CORRECTION");
    try {
      const response = await fetch("/api/creative/music/clip-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          creative_project_id: projectId,
          track_id: track.id,
          clip_id: clip.id,
          expected_revision: sessionRevision,
          correction: {
            pitch_semitones: semitones,
            pitch_cents: cents,
            timing_percent: timingPercent,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Clip correction failed");
      setStatus("CORRECTED CLIP SAVED");
      setSemitones(0);
      setCents(0);
      setTimingPercent(100);
      await onReload?.();
    } catch (cause) {
      setError(cause?.message || "Clip correction failed");
      setStatus("CORRECTION BLOCKED");
    } finally {
      setBusy(false);
    }
  }

  if (!track || !clip) return null;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Music2 className="h-3.5 w-3.5" /> Pitch & timing correction</div>
          <div className="mt-1 text-[8px] leading-4 text-white/22">Creates a new 24-bit derived clip. The original WAV is preserved and remains in lineage.</div>
        </div>
        <ShieldCheck className="h-4 w-4 text-emerald-100/35" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-white/22">Semitones</div>
          <input type="number" min="-12" max="12" step="1" disabled={disabled || busy} value={semitones} onChange={(event) => setSemitones(Math.max(-12, Math.min(12, finite(event.target.value, 0))))} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[10px] text-white/55 disabled:opacity-25" />
        </label>
        <label className="block">
          <div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-white/22">Fine cents</div>
          <input type="number" min="-100" max="100" step="1" disabled={disabled || busy} value={cents} onChange={(event) => setCents(Math.max(-100, Math.min(100, finite(event.target.value, 0))))} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[10px] text-white/55 disabled:opacity-25" />
        </label>
      </div>

      <label className="mt-3 block">
        <div className="mb-1 flex items-center justify-between text-[8px] uppercase tracking-[0.14em] text-white/22"><span className="flex items-center gap-1.5"><Gauge className="h-3 w-3" /> Timing</span><span>{finite(timingPercent, 100).toFixed(1)}%</span></div>
        <input type="range" min="50" max="200" step="0.5" disabled={disabled || busy} value={timingPercent} onChange={(event) => setTimingPercent(finite(event.target.value, 100))} className="w-full accent-[#d6a66a] disabled:opacity-25" />
        <div className="mt-1 flex justify-between text-[7px] text-white/14"><span>50% shorter/faster</span><span>100% original</span><span>200% longer/slower</span></div>
      </label>

      <div className="mt-3 rounded-lg border border-white/6 bg-black/15 px-3 py-2 text-[8px] leading-4 text-white/25">
        Pitch: {totalPitch >= 0 ? "+" : ""}{totalPitch.toFixed(2)} semitones · Timing: {finite(timingPercent, 100).toFixed(1)}%
      </div>

      <button type="button" disabled={disabled || busy || !changed} onClick={applyCorrection} className="mt-3 w-full rounded-xl border border-[#d6a66a]/25 bg-[#d6a66a]/8 px-3 py-2.5 text-[9px] font-medium text-[#efd29f]/75 disabled:opacity-25">{busy ? status : "Render corrected clip"}</button>
      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-3 py-2 text-[8px] leading-4 text-red-100/55">{error}</div> : null}

      <div className="mt-3 text-[7px] leading-3 text-white/15">This is global clip pitch/timing correction, not note-by-note vocal tuning. Formant-preserving vocal tuning and transient-aware warp remain separate engineering stages and are not claimed here.</div>
    </div>
  );
}
