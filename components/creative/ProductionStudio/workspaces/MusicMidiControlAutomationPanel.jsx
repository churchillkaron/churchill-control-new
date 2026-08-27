"use client";

import { useMemo, useState } from "react";
import { Activity, Plus, Trash2 } from "lucide-react";

const LANES = Object.freeze([
  ["sustain", "Sustain", 0, 127],
  ["modulation", "Modulation", 0, 127],
  ["expression", "Expression", 0, 127],
  ["pitch_bend", "Pitch Bend", -8192, 8191],
]);

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value, min))); }

export default function MusicMidiControlAutomationPanel({ organizationId, projectId, session, disabled = false, onReload }) {
  const [laneType, setLaneType] = useState("modulation");
  const [beat, setBeat] = useState(0);
  const [value, setValue] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selection = useMemo(() => {
    const melodic = (session?.midi?.tracks || []).find((track) => track.midi_channel !== 10 && track.clips?.length);
    const track = melodic || (session?.midi?.tracks || []).find((entry) => entry.clips?.length) || null;
    const clip = track?.clips?.[0] || null;
    return { track, clip };
  }, [session]);

  const events = selection.clip?.control_events || [];
  const lane = LANES.find(([id]) => id === laneType) || LANES[0];
  const laneEvents = events.filter((event) => event.type === laneType).sort((a,b) => a.beat - b.beat);

  async function request(action, extra = {}) {
    if (!selection.track || !selection.clip || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/creative/music/midi-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          organization_id: organizationId,
          creative_project_id: projectId,
          expected_revision: session?.revision || 0,
          track_id: selection.track.id,
          clip_id: selection.clip.id,
          ...extra,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "MIDI control automation failed");
      await onReload?.();
    } catch (cause) { setError(cause?.message || "MIDI control automation failed"); }
    finally { setBusy(false); }
  }

  async function addPoint() {
    await request("add", { event: { type: laneType, beat, value } });
  }

  if (!selection.clip) {
    return <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4 text-[8px] text-white/25">Create a MIDI clip before editing controller automation.</div>;
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d6a66a]/65"><Activity className="h-3.5 w-3.5" /> MIDI Control Automation</div><div className="mt-1 text-[8px] leading-4 text-white/24">Edit sustain, modulation, expression and pitch-bend events on the selected MIDI performance. Original captured performance remains preserved.</div></div>
        <div className="text-[7px] text-white/18">{selection.track.name} · {selection.clip.name}</div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Lane</div><select disabled={disabled || busy} value={laneType} onChange={(event) => { const next = event.target.value; setLaneType(next); const def = LANES.find(([id]) => id === next); setValue(def?.[2] || 0); }} className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-20">{LANES.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Beat</div><input disabled={disabled || busy} type="number" min="0" step="0.0625" value={beat} onChange={(event) => setBeat(Math.max(0,finite(event.target.value,0)))} className="w-20 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-20" /></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Value</div><input disabled={disabled || busy} type="number" min={lane[2]} max={lane[3]} value={value} onChange={(event) => setValue(Math.round(clamp(event.target.value,lane[2],lane[3])))} className="w-24 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-20" /></label>
        <button type="button" disabled={disabled || busy} onClick={() => void addPoint()} className="inline-flex items-center gap-1 rounded-lg border border-[#d6a66a]/20 bg-[#d6a66a]/[0.05] px-2.5 py-1.5 text-[8px] text-[#efd29f]/70 disabled:opacity-20"><Plus className="h-3 w-3" /> Add point</button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-white/7 bg-black/20 p-2">
        <div className="min-w-[620px]">
          <div className="relative h-36 border-b border-l border-white/8 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:12.5%_25%]">
            {laneEvents.map((event) => {
              const maxBeat = Math.max(4, finite(selection.clip.duration_beats,4));
              const x = Math.min(100, Math.max(0, finite(event.beat,0) / maxBeat * 100));
              const normalized = (finite(event.value,lane[2]) - lane[2]) / Math.max(1, lane[3]-lane[2]);
              const y = 100 - Math.min(100,Math.max(0,normalized*100));
              return <button key={event.id} type="button" disabled={disabled || busy} onClick={() => void request("delete", { event_id:event.id })} title={`${lane[1]} · beat ${finite(event.beat,0).toFixed(3)} · ${event.value}`} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#efd29f]/55 bg-[#d6a66a]/50 disabled:opacity-25" style={{left:`${x}%`,top:`${y}%`}}><span className="sr-only">Delete point</span></button>;
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[7px] text-white/15"><span>0 beats</span><span>{finite(selection.clip.duration_beats,4)} beats</span></div>
        </div>
      </div>

      <div className="mt-2 space-y-1">
        {laneEvents.slice(0,24).map((event) => <div key={event.id} className="grid grid-cols-[1fr_80px_32px] items-center gap-2 rounded-lg border border-white/6 px-2 py-1.5 text-[7px] text-white/28"><span>{lane[1]} · beat {finite(event.beat,0).toFixed(3)}</span><span className="text-right">{event.value}</span><button type="button" disabled={disabled || busy} onClick={() => void request("delete", {event_id:event.id})} className="rounded border border-white/7 p-1 text-white/24 disabled:opacity-20"><Trash2 className="h-2.5 w-2.5" /></button></div>)}
      </div>
      <div className="mt-2 text-[7px] text-white/15">Click an automation point to delete it. Controller edits are MIDI data changes only; no audio is destructively rendered.</div>
      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/55">{error}</div> : null}
    </div>
  );
}
