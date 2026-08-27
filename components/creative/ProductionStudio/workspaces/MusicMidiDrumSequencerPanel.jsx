"use client";

import { useEffect, useState } from "react";
import { Drum, Trash2 } from "lucide-react";

const LANES = Object.freeze([
  ["kick", "Kick"], ["snare", "Snare"], ["clap", "Clap"], ["closed_hat", "Closed Hat"], ["open_hat", "Open Hat"],
  ["low_tom", "Low Tom"], ["mid_tom", "Mid Tom"], ["high_tom", "High Tom"], ["crash", "Crash"], ["ride", "Ride"],
]);

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value, min))); }

export default function MusicMidiDrumSequencerPanel({ organizationId, projectId, session, disabled = false, onReload }) {
  const [pattern, setPattern] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [velocity, setVelocity] = useState(104);

  async function request(action, extra = {}) {
    if (!organizationId || !projectId || busy) return null;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/creative/music/midi-drums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, organization_id: organizationId, creative_project_id: projectId, expected_revision: session?.revision || 0, ...extra }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Drum sequencer failed");
      setPattern(body.pattern || null);
      if (action !== "load") await onReload?.();
      return body;
    } catch (cause) {
      setError(cause?.message || "Drum sequencer failed");
      return null;
    } finally { setBusy(false); }
  }

  useEffect(() => { void request("load"); }, [organizationId, projectId, session?.revision]);

  const totalSteps = Math.max(4, Math.round(finite(pattern?.steps, 16) * finite(pattern?.bars, 1)));
  const active = new Set((pattern?.hits || []).map((hit) => `${hit.lane_id}:${hit.step}`));

  return (
    <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d6a66a]/65"><Drum className="h-3.5 w-3.5" /> MIDI Drum Sequencer</div><div className="mt-1 text-[8px] leading-4 text-white/24">Step programming writes normal editable MIDI notes to channel 10. Patterns stay inside the same Music project.</div></div>
        <button type="button" disabled={disabled || busy || !pattern?.hits?.length} onClick={() => void request("clear")} className="rounded-lg border border-white/8 p-2 text-white/30 disabled:opacity-20" title="Clear pattern"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      {pattern ? <>
        <div className="mt-3 flex flex-wrap items-end gap-2 text-[7px]">
          <label><div className="mb-1 uppercase text-white/18">Velocity</div><input disabled={disabled || busy} type="number" min="1" max="127" value={velocity} onChange={(e) => setVelocity(Math.round(clamp(e.target.value,1,127)))} className="w-16 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-20" /></label>
          <label><div className="mb-1 uppercase text-white/18">Swing</div><input disabled={disabled || busy} type="number" min="0" max="75" value={Math.round(finite(pattern.swing,0)*100)} onChange={(e) => void request("settings", { settings: { swing: clamp(e.target.value,0,75)/100 } })} className="w-16 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-20" /></label>
          <span className="pb-1.5 text-white/18">{totalSteps} steps · {pattern.hits?.length || 0} hits · MIDI output</span>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/7 bg-black/20">
          <div className="min-w-[760px] p-2">
            {LANES.map(([laneId,label]) => <div key={laneId} className="grid grid-cols-[72px_1fr] items-center gap-2 py-0.5"><div className="text-[7px] text-white/30">{label}</div><div className="grid gap-1" style={{gridTemplateColumns:`repeat(${totalSteps},minmax(14px,1fr))`}}>{Array.from({length:totalSteps},(_,step) => {
              const on = active.has(`${laneId}:${step}`);
              const barBoundary = step % Math.max(1,Math.round(finite(pattern.steps,16))) === 0;
              const beatBoundary = step % Math.max(1,Math.round(finite(pattern.steps,16)/finite(pattern.beats_per_bar,4))) === 0;
              return <button key={step} type="button" disabled={disabled || busy} title={`${label} step ${step+1}`} onClick={() => void request("toggle_hit", { lane_id: laneId, step, velocity })} className={`h-5 rounded-sm border disabled:opacity-25 ${on ? "border-[#efd29f]/55 bg-[#d6a66a]/35" : barBoundary ? "border-white/16 bg-white/[0.035]" : beatBoundary ? "border-white/10 bg-white/[0.02]" : "border-white/[0.055] bg-white/[0.008]"}`} />;
            })}</div></div>)}
          </div>
        </div>
        <div className="mt-2 text-[7px] text-white/16">Kick/snare/hats/toms/cymbals use standard MIDI drum pitches. The pattern is not rendered destructively and can be edited later in the piano roll.</div>
      </> : <div className="mt-3 text-[8px] text-white/25">{busy ? "Loading drum pattern…" : "Drum pattern unavailable."}</div>}
      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/55">{error}</div> : null}
    </div>
  );
}
