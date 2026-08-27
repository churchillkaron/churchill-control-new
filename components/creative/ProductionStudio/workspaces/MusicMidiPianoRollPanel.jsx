"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, KeyboardMusic, Plus, RotateCcw, Trash2, Wand2 } from "lucide-react";

const PITCH_MIN = 36;
const PITCH_MAX = 84;
const VISIBLE_PITCHES = Array.from({ length: PITCH_MAX - PITCH_MIN + 1 }, (_, index) => PITCH_MAX - index);
const QUANTIZE = ["off", "1/4", "1/8", "1/16", "1/32"];

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function noteName(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitch = Math.round(clamp(midi, 0, 127));
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

function isBlackKey(pitch) {
  return [1, 3, 6, 8, 10].includes(pitch % 12);
}

function beatsPerBar(signature = "4/4") {
  const [numeratorRaw, denominatorRaw] = String(signature || "4/4").split("/");
  const numerator = finite(numeratorRaw, 4);
  const denominator = finite(denominatorRaw, 4);
  return numerator * (4 / denominator);
}

function midiMessageToEvent(data, beat) {
  const status = data[0] || 0;
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const data1 = data[1] || 0;
  const data2 = data[2] || 0;
  if (command === 0xb0) {
    if (data1 === 64) return { type: "sustain", beat, value: data2, midi_channel: channel };
    if (data1 === 1) return { type: "modulation", beat, value: data2, midi_channel: channel };
    if (data1 === 11) return { type: "expression", beat, value: data2, midi_channel: channel };
    return { type: "control_change", beat, value: data2, controller: data1, midi_channel: channel };
  }
  if (command === 0xe0) {
    return { type: "pitch_bend", beat, value: ((data2 << 7) | data1) - 8192, midi_channel: channel };
  }
  if (command === 0xd0) return { type: "channel_pressure", beat, value: data1, midi_channel: channel };
  return null;
}

export default function MusicMidiPianoRollPanel({
  organizationId,
  projectId,
  session,
  disabled = false,
  onReload,
}) {
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [selectedClipId, setSelectedClipId] = useState("");
  const [velocity, setVelocity] = useState(100);
  const [noteLength, setNoteLength] = useState(1);
  const [quantizeDivision, setQuantizeDivision] = useState("1/16");
  const [quantizeStrength, setQuantizeStrength] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [midiAccess, setMidiAccess] = useState(null);
  const [midiInputs, setMidiInputs] = useState([]);
  const [inputId, setInputId] = useState("");
  const [recordingMidi, setRecordingMidi] = useState(false);
  const recordingRef = useRef(null);

  const midi = session?.midi || null;
  const tracks = midi?.tracks || [];
  const selectedTrack = useMemo(
    () => tracks.find((track) => track.id === selectedTrackId) || tracks[0] || null,
    [tracks, selectedTrackId],
  );
  const selectedClip = useMemo(
    () => selectedTrack?.clips?.find((clip) => clip.id === selectedClipId) || selectedTrack?.clips?.[0] || null,
    [selectedTrack, selectedClipId],
  );

  useEffect(() => {
    if (!selectedTrack && selectedTrackId) setSelectedTrackId("");
    else if (selectedTrack && selectedTrack.id !== selectedTrackId) setSelectedTrackId(selectedTrack.id);
  }, [selectedTrack, selectedTrackId]);

  useEffect(() => {
    if (!selectedClip && selectedClipId) setSelectedClipId("");
    else if (selectedClip && selectedClip.id !== selectedClipId) setSelectedClipId(selectedClip.id);
  }, [selectedClip, selectedClipId]);

  async function request(action, extra = {}) {
    if (!organizationId || !projectId || !session || busy) return null;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/creative/music/midi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          organization_id: organizationId,
          creative_project_id: projectId,
          expected_revision: session.revision || 0,
          ...extra,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "MIDI operation failed");
      setStatus(action.replaceAll("_", " ").toUpperCase());
      await onReload?.();
      return body;
    } catch (cause) {
      setError(cause?.message || "MIDI operation failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addTrack() {
    const body = await request("add_track", {
      track: { name: `MIDI Instrument ${tracks.length + 1}`, midi_channel: 1 },
    });
    const nextTracks = body?.midi?.tracks || [];
    if (nextTracks.length) setSelectedTrackId(nextTracks[nextTracks.length - 1].id);
  }

  async function addClip() {
    if (!selectedTrack) return;
    const bars = 4;
    const body = await request("add_clip", {
      track_id: selectedTrack.id,
      clip: {
        name: "MIDI 4 Bars",
        start_beat: 0,
        duration_beats: beatsPerBar(session.time_signature) * bars,
      },
    });
    const track = body?.midi?.tracks?.find((entry) => entry.id === selectedTrack.id);
    if (track?.clips?.length) setSelectedClipId(track.clips[track.clips.length - 1].id);
  }

  async function addNote(pitch, startBeat) {
    if (!selectedTrack || !selectedClip) return;
    await request("add_note", {
      track_id: selectedTrack.id,
      clip_id: selectedClip.id,
      note: {
        pitch,
        start_beat: Math.max(0, startBeat),
        duration_beats: noteLength,
        velocity,
      },
    });
  }

  async function updateNote(note, patch) {
    await request("update_note", {
      track_id: selectedTrack.id,
      clip_id: selectedClip.id,
      note_id: note.id,
      note: patch,
    });
  }

  async function deleteNote(note) {
    await request("delete_note", {
      track_id: selectedTrack.id,
      clip_id: selectedClip.id,
      note_id: note.id,
    });
  }

  async function connectMidi() {
    setError("");
    if (typeof navigator === "undefined" || typeof navigator.requestMIDIAccess !== "function") {
      setError("Web MIDI is not available in this browser.");
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      setMidiAccess(access);
      const inputs = [...access.inputs.values()];
      setMidiInputs(inputs);
      if (!inputId && inputs[0]) setInputId(inputs[0].id);
      setStatus(inputs.length ? "MIDI INPUT READY" : "NO MIDI INPUT FOUND");
    } catch (cause) {
      setError(cause?.message || "MIDI permission was not granted.");
    }
  }

  function stopMidiListeners() {
    if (!midiAccess) return;
    for (const input of midiAccess.inputs.values()) input.onmidimessage = null;
  }

  async function stopMidiRecording() {
    const current = recordingRef.current;
    stopMidiListeners();
    recordingRef.current = null;
    setRecordingMidi(false);
    if (!current || !selectedTrack || !selectedClip) return;

    const nowMs = performance.now();
    const secondsPerBeat = 60 / clamp(session.bpm || 120, 30, 300);
    for (const active of current.activeNotes.values()) {
      current.notes.push({
        pitch: active.pitch,
        start_beat: active.startBeat,
        duration_beats: Math.max(0.03125, ((nowMs - active.startedMs) / 1000) / secondsPerBeat),
        velocity: active.velocity,
        release_velocity: 64,
      });
    }
    current.activeNotes.clear();
    if (!current.notes.length && !current.events.length) {
      setStatus("NO MIDI PERFORMANCE CAPTURED");
      return;
    }
    await request("record_performance", {
      track_id: selectedTrack.id,
      clip_id: selectedClip.id,
      performance: {
        notes: current.notes,
        control_events: current.events,
        input_device_id: current.inputId,
        input_device_name: current.inputName,
        midi_channel: selectedTrack.midi_channel || 1,
        started_at: current.startedAt,
        stopped_at: new Date().toISOString(),
      },
    });
  }

  function startMidiRecording() {
    if (!midiAccess || !selectedTrack || !selectedClip || disabled || busy) return;
    const input = midiAccess.inputs.get(inputId) || [...midiAccess.inputs.values()][0];
    if (!input) {
      setError("Choose a MIDI input first.");
      return;
    }
    const startedMs = performance.now();
    const secondsPerBeat = 60 / clamp(session.bpm || 120, 30, 300);
    const state = {
      startedMs,
      startedAt: new Date().toISOString(),
      inputId: input.id,
      inputName: input.name || "MIDI Input",
      notes: [],
      events: [],
      activeNotes: new Map(),
    };
    recordingRef.current = state;
    stopMidiListeners();
    input.onmidimessage = (message) => {
      const data = message.data || [];
      const statusByte = data[0] || 0;
      const command = statusByte & 0xf0;
      const channel = (statusByte & 0x0f) + 1;
      if (channel !== (selectedTrack.midi_channel || 1)) return;
      const pitch = data[1] || 0;
      const value = data[2] || 0;
      const elapsedBeat = ((performance.now() - startedMs) / 1000) / secondsPerBeat;
      const key = `${channel}:${pitch}`;
      if (command === 0x90 && value > 0) {
        state.activeNotes.set(key, { pitch, velocity: value, startedMs: performance.now(), startBeat: elapsedBeat });
        return;
      }
      if (command === 0x80 || (command === 0x90 && value === 0)) {
        const active = state.activeNotes.get(key);
        if (!active) return;
        state.activeNotes.delete(key);
        state.notes.push({
          pitch,
          start_beat: active.startBeat,
          duration_beats: Math.max(0.03125, ((performance.now() - active.startedMs) / 1000) / secondsPerBeat),
          velocity: active.velocity,
          release_velocity: value || 64,
        });
        return;
      }
      const event = midiMessageToEvent(data, elapsedBeat);
      if (event) state.events.push(event);
    };
    setRecordingMidi(true);
    setStatus("RECORDING RAW MIDI PERFORMANCE");
  }

  useEffect(() => () => stopMidiListeners(), [midiAccess]);

  const clipBeats = selectedClip?.duration_beats || beatsPerBar(session?.time_signature || "4/4") * 4;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d6a66a]/65"><KeyboardMusic className="h-3.5 w-3.5" /> MIDI · Piano Roll</div>
          <div className="mt-1 text-[8px] leading-4 text-white/24">Draw notes or record a real MIDI keyboard. Raw timing, velocity and controls are preserved before reversible quantize/transpose.</div>
        </div>
        <button type="button" disabled={disabled || busy || recordingMidi} onClick={addTrack} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/42 disabled:opacity-25"><Plus className="h-3 w-3" /> MIDI track</button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <select disabled={disabled || busy || recordingMidi || !tracks.length} value={selectedTrack?.id || ""} onChange={(event) => { setSelectedTrackId(event.target.value); setSelectedClipId(""); }} className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/55 disabled:opacity-25">
          {!tracks.length ? <option value="">No MIDI tracks</option> : null}
          {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
        </select>
        <div className="flex gap-1">
          <select disabled={disabled || busy || recordingMidi || !selectedTrack} value={selectedClip?.id || ""} onChange={(event) => setSelectedClipId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/55 disabled:opacity-25">
            {!selectedTrack?.clips?.length ? <option value="">No MIDI clips</option> : null}
            {(selectedTrack?.clips || []).map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
          </select>
          <button type="button" disabled={disabled || busy || recordingMidi || !selectedTrack} onClick={addClip} className="rounded-lg border border-white/8 px-2 text-white/38 disabled:opacity-25"><Plus className="h-3 w-3" /></button>
        </div>
      </div>

      {selectedClip ? <>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[7px]">
          <label><div className="mb-1 uppercase text-white/18">Velocity</div><input type="number" min="1" max="127" disabled={disabled || busy || recordingMidi} value={velocity} onChange={(e) => setVelocity(Math.round(clamp(e.target.value, 1, 127)))} className="w-full rounded-md border border-white/7 bg-black/25 px-2 py-1 text-white/45 disabled:opacity-25" /></label>
          <label><div className="mb-1 uppercase text-white/18">Length beats</div><input type="number" min="0.03125" max="16" step="0.125" disabled={disabled || busy || recordingMidi} value={noteLength} onChange={(e) => setNoteLength(clamp(e.target.value, 0.03125, 16))} className="w-full rounded-md border border-white/7 bg-black/25 px-2 py-1 text-white/45 disabled:opacity-25" /></label>
          <div><div className="mb-1 uppercase text-white/18">Events</div><div className="rounded-md border border-white/7 px-2 py-1 text-white/35">{selectedClip.notes?.length || 0} notes · {selectedClip.control_events?.length || 0} ctrl</div></div>
        </div>

        <div className="mt-3 max-h-[280px] overflow-auto rounded-xl border border-white/7 bg-black/20">
          <div className="min-w-[620px]">
            {VISIBLE_PITCHES.map((pitch) => (
              <div key={pitch} className={`grid h-5 grid-cols-[42px_1fr] border-b border-white/[0.035] ${isBlackKey(pitch) ? "bg-white/[0.012]" : ""}`}>
                <div className="border-r border-white/7 px-1.5 pt-1 text-[7px] text-white/28">{noteName(pitch)}</div>
                <button type="button" disabled={disabled || busy || recordingMidi} onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const beat = clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * clipBeats, 0, clipBeats - 0.03125);
                  void addNote(pitch, Math.round(beat * 16) / 16);
                }} className="relative bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:6.25%_100%] disabled:cursor-not-allowed">
                  {(selectedClip.notes || []).filter((note) => note.pitch === pitch).map((note) => (
                    <span key={note.id} className="absolute inset-y-[2px] rounded-sm border border-[#d6a66a]/35 bg-[#d6a66a]/20" style={{ left: `${clamp(note.start_beat / clipBeats * 100, 0, 100)}%`, width: `${Math.max(0.6, Math.min(100, note.duration_beats / clipBeats * 100))}%` }} title={`${note.note_name} · vel ${note.velocity}`} />
                  ))}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          {(selectedClip.notes || []).slice().sort((a,b) => a.start_beat - b.start_beat || a.pitch - b.pitch).slice(0, 120).map((note) => (
            <div key={note.id} className="grid grid-cols-[42px_1fr_1fr_1fr_28px] items-center gap-1 text-[7px]">
              <span className="text-white/38">{note.note_name}</span>
              <input disabled={disabled || busy || recordingMidi} type="number" min="0" step="0.0625" defaultValue={note.start_beat} onBlur={(e) => void updateNote(note, { start_beat: Math.max(0, finite(e.target.value, note.start_beat)) })} className="rounded border border-white/7 bg-black/25 px-1 py-1 text-white/35 disabled:opacity-25" title="Start beat" />
              <input disabled={disabled || busy || recordingMidi} type="number" min="0.03125" step="0.0625" defaultValue={note.duration_beats} onBlur={(e) => void updateNote(note, { duration_beats: Math.max(0.03125, finite(e.target.value, note.duration_beats)) })} className="rounded border border-white/7 bg-black/25 px-1 py-1 text-white/35 disabled:opacity-25" title="Duration beats" />
              <input disabled={disabled || busy || recordingMidi} type="number" min="1" max="127" defaultValue={note.velocity} onBlur={(e) => void updateNote(note, { velocity: Math.round(clamp(e.target.value, 1, 127)) })} className="rounded border border-white/7 bg-black/25 px-1 py-1 text-white/35 disabled:opacity-25" title="Velocity" />
              <button type="button" disabled={disabled || busy || recordingMidi} onClick={() => void deleteNote(note)} className="text-white/25 hover:text-red-100/60 disabled:opacity-25"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-white/7 pt-3">
          <label className="text-[7px] text-white/20"><div className="mb-1 uppercase">Quantize</div><select disabled={disabled || busy || recordingMidi} value={quantizeDivision} onChange={(e) => setQuantizeDivision(e.target.value)} className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-25">{QUANTIZE.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-[7px] text-white/20"><div className="mb-1 uppercase">Strength %</div><input disabled={disabled || busy || recordingMidi} type="number" min="0" max="100" value={quantizeStrength} onChange={(e) => setQuantizeStrength(clamp(e.target.value, 0, 100))} className="w-16 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-25" /></label>
          <button type="button" disabled={disabled || busy || recordingMidi} onClick={() => void request("quantize", { track_id: selectedTrack.id, clip_id: selectedClip.id, quantize: { division: quantizeDivision, strength: quantizeStrength / 100, quantize_duration: false } })} className="inline-flex items-center gap-1 rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/40 disabled:opacity-25"><Wand2 className="h-3 w-3" /> Apply</button>
          <button type="button" disabled={disabled || busy || recordingMidi} onClick={() => void request("transpose", { track_id: selectedTrack.id, clip_id: selectedClip.id, semitones: -12 })} className="rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/40 disabled:opacity-25">−12</button>
          <button type="button" disabled={disabled || busy || recordingMidi} onClick={() => void request("transpose", { track_id: selectedTrack.id, clip_id: selectedClip.id, semitones: 12 })} className="rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/40 disabled:opacity-25">+12</button>
          <button type="button" disabled={disabled || busy || recordingMidi} onClick={() => void request("restore_original", { track_id: selectedTrack.id, clip_id: selectedClip.id })} className="inline-flex items-center gap-1 rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/40 disabled:opacity-25"><RotateCcw className="h-3 w-3" /> Original</button>
        </div>

        <div className="mt-3 rounded-xl border border-white/7 p-3">
          <div className="flex items-center justify-between gap-2"><div className="text-[8px] uppercase tracking-[0.15em] text-white/28">Web MIDI keyboard</div>{!midiAccess ? <button type="button" disabled={disabled || busy} onClick={connectMidi} className="rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/42 disabled:opacity-25">Connect MIDI</button> : null}</div>
          {midiAccess ? <div className="mt-2 flex gap-2"><select disabled={disabled || busy || recordingMidi} value={inputId} onChange={(e) => setInputId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-25">{midiInputs.map((input) => <option key={input.id} value={input.id}>{input.name || input.manufacturer || "MIDI input"}</option>)}</select>{recordingMidi ? <button type="button" onClick={() => void stopMidiRecording()} className="inline-flex items-center gap-1 rounded-lg border border-red-300/20 bg-red-400/[0.04] px-2 py-1.5 text-[8px] text-red-100/60"><CircleDot className="h-3 w-3" /> Stop</button> : <button type="button" disabled={disabled || busy || !selectedClip || !midiInputs.length} onClick={startMidiRecording} className="inline-flex items-center gap-1 rounded-lg border border-red-300/15 px-2 py-1.5 text-[8px] text-red-100/55 disabled:opacity-25"><CircleDot className="h-3 w-3" /> Record MIDI</button>}</div> : null}
          <div className="mt-2 text-[7px] leading-3 text-white/16">Records note timing, velocity, sustain, modulation, expression and pitch bend. It does not auto-quantize. Instrument audio playback is the next layer; this panel currently records and edits MIDI performance data.</div>
        </div>
      </> : <div className="mt-3 rounded-xl border border-white/7 p-3 text-[8px] text-white/25">Create a MIDI track and clip to open the piano roll.</div>}

      {status ? <div className="mt-2 text-[7px] text-emerald-100/35">{status}</div> : null}
      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/55">{error}</div> : null}
    </div>
  );
}
