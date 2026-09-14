"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SlidersHorizontal, Sparkles } from "lucide-react";

import { startMusicMidiInstrumentPreview } from "@/lib/creative/music/client/MusicMidiInstrumentEngine";
import {
  designMusicOwnedInstrument,
  listMusicOwnedInstrumentPresets,
  normalizeMusicOwnedInstrument,
  resolveMusicOwnedInstrumentDefinition,
} from "@/lib/creative/music/runtime/CreativeMusicOwnedInstrumentRuntime";

const PRESETS = listMusicOwnedInstrumentPresets();
const field = "rounded-lg border border-black/[0.08] bg-white px-2.5 py-2 text-[10px] text-[#49443E] outline-none focus:border-[#B98A57]/45 disabled:opacity-40";

function number(value, fallback) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

export default function MusicInstrumentDesignerPanel({ organizationId, projectId, session, disabled = false, onReload }) {
  const tracks = useMemo(() => (session?.midi?.tracks || []).filter((track) => !["sampler", "drum_machine", "drum_rack"].includes(String(track.instrument?.kind || "").toLowerCase())), [session]);
  const [trackId, setTrackId] = useState("");
  const [intent, setIntent] = useState("warm, expressive studio instrument");
  const [preset, setPreset] = useState("studio_keys");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const previewRef = useRef(null);

  const track = useMemo(() => tracks.find((item) => item.id === trackId) || tracks[0] || null, [tracks, trackId]);
  const clip = track?.clips?.[0] || null;

  useEffect(() => {
    if (!track) return;
    if (track.id !== trackId) setTrackId(track.id);
    const resolved = resolveMusicOwnedInstrumentDefinition(track);
    setPreset(resolved.preset_id || "studio_keys");
    setDraft(resolved);
    setIntent(track.instrument?.design?.intent || track.instrument?.design?.label || resolved.label || "owned instrument");
  }, [track?.id, session?.revision]);

  async function stopPreview() {
    const active = previewRef.current;
    previewRef.current = null;
    setPlaying(false);
    if (active) await active.stop();
  }

  async function audition() {
    if (!clip || !draft || disabled || previewRef.current) return;
    setError("");
    try {
      const transport = await startMusicMidiInstrumentPreview({
        clip,
        bpm: session?.bpm || 120,
        instrument: { ...(track.instrument || {}), preset_id: draft.preset_id, design: draft },
        onEnded: () => { previewRef.current = null; setPlaying(false); },
      });
      previewRef.current = transport;
      setPlaying(true);
    } catch (cause) { setError(cause?.message || "Instrument audition could not start"); }
  }

  useEffect(() => () => { void stopPreview(); }, []);

  function shapeFromIntent() {
    if (!track) return;
    const next = designMusicOwnedInstrument({ intent, preset_id: preset, label: intent });
    setDraft(next);
  }

  function patch(key, value) {
    if (!draft) return;
    setDraft(normalizeMusicOwnedInstrument({ ...draft, [key]: value }, draft.preset_id || preset));
  }

  async function save() {
    if (!track || !draft || disabled || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/creative/music/midi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_instrument_design", organization_id: organizationId, creative_project_id: projectId, expected_revision: session?.revision || 0, track_id: track.id, design: { ...draft, intent }, preset_id: preset }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Instrument design could not save");
      await onReload?.();
    } catch (cause) { setError(cause?.message || "Instrument design could not save"); }
    finally { setBusy(false); }
  }

  if (!tracks.length) return null;

  return (
    <section className="mt-4 rounded-[20px] border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]"><Sparkles className="h-3.5 w-3.5" /> Owned Instrument Designer</div>
          <div className="mt-1 text-[15px] font-medium text-[#29251F]">Design a playable sound from musical intent</div>
          <div className="mt-1 max-w-3xl text-[10px] leading-5 text-[#817B73]">One fingerprinted synth definition is used by preview, unified playback and offline 24-bit bounce. No VST, external provider or generation cost.</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={!clip || disabled} onClick={() => playing ? void stopPreview() : void audition()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-[#F7F4EF] px-3 text-[9px] font-semibold text-[#625B53] disabled:opacity-35">{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Audition</button>
          <button type="button" disabled={disabled || busy || !draft} onClick={() => void save()} className="h-9 rounded-xl bg-[#25221E] px-4 text-[9px] font-semibold text-white disabled:opacity-35">{busy ? "Saving…" : "Save Sound"}</button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto]">
        <select className={field} disabled={disabled || playing} value={track?.id || ""} onChange={(event) => setTrackId(event.target.value)}>{tracks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select className={field} disabled={disabled || playing} value={preset} onChange={(event) => setPreset(event.target.value)}>{PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <input className={field} disabled={disabled || playing} value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="e.g. dark warm analog bass, soft attack, subtle movement" />
        <button type="button" disabled={disabled || playing} onClick={shapeFromIntent} className="rounded-xl border border-[#B98A57]/30 bg-[#FCFAF6] px-3 text-[9px] font-semibold text-[#8A643C] disabled:opacity-35">Shape</button>
      </div>

      {draft ? <div className="mt-4 grid gap-3 md:grid-cols-5">
        <label className="rounded-xl bg-[#F7F4EF] p-3 text-[8px] text-[#756F67]">Attack <span className="float-right font-semibold text-[#4B453E]">{Math.round(draft.attack_seconds * 1000)} ms</span><input className="mt-2 w-full" type="range" min="1" max="1500" step="1" value={Math.round(draft.attack_seconds * 1000)} onChange={(event) => patch("attack_seconds", number(event.target.value, 8) / 1000)} /></label>
        <label className="rounded-xl bg-[#F7F4EF] p-3 text-[8px] text-[#756F67]">Release <span className="float-right font-semibold text-[#4B453E]">{draft.release_seconds.toFixed(2)} s</span><input className="mt-2 w-full" type="range" min="0.05" max="4" step="0.01" value={draft.release_seconds} onChange={(event) => patch("release_seconds", number(event.target.value, 0.4))} /></label>
        <label className="rounded-xl bg-[#F7F4EF] p-3 text-[8px] text-[#756F67]">Filter <span className="float-right font-semibold text-[#4B453E]">{Math.round(draft.filter_cutoff_hz)} Hz</span><input className="mt-2 w-full" type="range" min="120" max="14000" step="20" value={draft.filter_cutoff_hz} onChange={(event) => patch("filter_cutoff_hz", number(event.target.value, 5000))} /></label>
        <label className="rounded-xl bg-[#F7F4EF] p-3 text-[8px] text-[#756F67]">Resonance <span className="float-right font-semibold text-[#4B453E]">{draft.filter_q.toFixed(2)}</span><input className="mt-2 w-full" type="range" min="0.01" max="8" step="0.01" value={draft.filter_q} onChange={(event) => patch("filter_q", number(event.target.value, 0.35))} /></label>
        <label className="rounded-xl bg-[#F7F4EF] p-3 text-[8px] text-[#756F67]">Vibrato <span className="float-right font-semibold text-[#4B453E]">{Math.round(draft.vibrato_depth_cents)} ct</span><input className="mt-2 w-full" type="range" min="0" max="70" step="1" value={draft.vibrato_depth_cents} onChange={(event) => patch("vibrato_depth_cents", number(event.target.value, 0))} /></label>
      </div> : null}

      {draft ? <div className="mt-3 flex flex-wrap gap-1.5 text-[8px] text-[#817B73]">
        {draft.oscillators.map(([wave, semitone, level], index) => <span key={`${wave}-${index}`} className="rounded-full border border-black/[0.06] bg-[#FCFBF8] px-2.5 py-1">{wave} {semitone >= 0 ? "+" : ""}{semitone} st · {Math.round(level * 100)}%</span>)}
        <span className="rounded-full border border-black/[0.06] bg-[#FCFBF8] px-2.5 py-1">{draft.fingerprint}</span>
      </div> : null}
      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[9px] text-red-700">{error}</div> : null}
    </section>
  );
}
