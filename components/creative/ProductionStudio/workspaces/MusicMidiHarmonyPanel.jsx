"use client";

import { useMemo, useState } from "react";
import { Music2, Plus, WandSparkles } from "lucide-react";

const ROOTS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const MODES = ["major","minor","dorian","mixolydian","pentatonic_major","pentatonic_minor"];
const PRESETS = Object.freeze([
  ["Pop", [1,5,6,4]], ["Soul", [2,5,1,6]], ["Blues", [1,4,1,5]], ["Minor", [1,6,3,7]], ["Lift", [4,5,3,6]],
]);

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

export default function MusicMidiHarmonyPanel({ organizationId, projectId, session, disabled = false, onReload }) {
  const [root, setRoot] = useState("C");
  const [mode, setMode] = useState("major");
  const [degrees, setDegrees] = useState([1,5,6,4]);
  const [extension, setExtension] = useState("triad");
  const [octave, setOctave] = useState(4);
  const [chordBeats, setChordBeats] = useState(4);
  const [startBeat, setStartBeat] = useState(0);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selection = useMemo(() => {
    const track = (session?.midi?.tracks || []).find((entry) => entry.midi_channel !== 10 && entry.instrument?.kind !== "drum_machine" && entry.clips?.length) || null;
    return { track, clip:track?.clips?.[0] || null };
  }, [session]);

  const harmony = { root, mode, degrees, extension, octave, chord_beats:chordBeats, start_beat:startBeat, velocity:96, inversion:0, spread:0 };

  async function request(action, extra = {}) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/creative/music/midi-harmony", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action, organization_id:organizationId, creative_project_id:projectId,
          expected_revision:session?.revision || 0,
          track_id:selection.track?.id || null, clip_id:selection.clip?.id || null,
          harmony, ...extra,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "MIDI harmony failed");
      if (body.progression) setPreview(body.progression);
      if (body.session) await onReload?.();
      return body;
    } catch (cause) { setError(cause?.message || "MIDI harmony failed"); return null; }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d6a66a]/65"><Music2 className="h-3.5 w-3.5" /> Scale & Chord Composer</div><div className="mt-1 text-[8px] leading-4 text-white/24">Build scale-safe chord progressions as normal editable MIDI notes. Nothing is rendered to locked audio.</div></div>
        <div className="text-[7px] text-white/18">{selection.track ? `${selection.track.name} · ${selection.clip?.name || "clip"}` : "Create a melodic MIDI clip first"}</div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Root</div><select disabled={disabled || busy} value={root} onChange={e=>setRoot(e.target.value)} className="w-full rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45">{ROOTS.map(value=><option key={value}>{value}</option>)}</select></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Mode</div><select disabled={disabled || busy} value={mode} onChange={e=>setMode(e.target.value)} className="w-full rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45">{MODES.map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Voicing</div><select disabled={disabled || busy} value={extension} onChange={e=>setExtension(e.target.value)} className="w-full rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45"><option value="triad">Triad</option><option value="seventh">Seventh</option></select></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Octave</div><input disabled={disabled || busy} type="number" min="1" max="7" value={octave} onChange={e=>setOctave(Math.round(finite(e.target.value,4)))} className="w-full rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45" /></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Chord beats</div><input disabled={disabled || busy} type="number" min="0.25" max="16" step="0.25" value={chordBeats} onChange={e=>setChordBeats(Math.max(.25,finite(e.target.value,4)))} className="w-full rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45" /></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Start beat</div><input disabled={disabled || busy} type="number" min="0" step="0.25" value={startBeat} onChange={e=>setStartBeat(Math.max(0,finite(e.target.value,0)))} className="w-full rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45" /></label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PRESETS.map(([label,values]) => <button key={label} type="button" disabled={disabled || busy} onClick={()=>{setDegrees(values); setPreview(null);}} className={`rounded-lg border px-2 py-1.5 text-[7px] ${degrees.join(",")===values.join(",") ? "border-[#d6a66a]/25 bg-[#d6a66a]/[0.05] text-[#efd29f]/65" : "border-white/7 text-white/28"}`}>{label} · {values.join("-")}</button>)}
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={disabled || busy} onClick={()=>void request("preview_progression")} className="inline-flex items-center gap-1 rounded-lg border border-white/8 px-2.5 py-1.5 text-[8px] text-white/38 disabled:opacity-20"><WandSparkles className="h-3 w-3" /> Preview chords</button>
          <button type="button" disabled={disabled || busy || !selection.clip} onClick={()=>void request("insert_progression")} className="inline-flex items-center gap-1 rounded-lg border border-[#d6a66a]/20 bg-[#d6a66a]/[0.05] px-2.5 py-1.5 text-[8px] text-[#efd29f]/70 disabled:opacity-20"><Plus className="h-3 w-3" /> Insert MIDI</button>
        </div>
      </div>

      {preview ? <div className="mt-3 grid gap-2 md:grid-cols-4">{preview.chords.map((chord,index)=><div key={`${chord.start_beat}-${index}`} className="rounded-xl border border-white/7 bg-black/20 p-2"><div className="text-[8px] text-white/45">{chord.root_note} · degree {chord.degree}</div><div className="mt-1 text-[7px] text-[#efd29f]/45">{chord.note_names.join(" · ")}</div><div className="mt-1 text-[6px] text-white/15">beat {finite(chord.start_beat,0)} → {finite(chord.start_beat,0)+finite(chord.duration_beats,0)}</div></div>)}</div> : null}
      <div className="mt-2 text-[7px] text-white/15">Scale lock, progression insertion and later piano-roll edits remain non-destructive MIDI operations. Provider jobs: none.</div>
      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/55">{error}</div> : null}
    </div>
  );
}
