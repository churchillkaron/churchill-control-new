"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RefreshCw, Square } from "lucide-react";

import { startMusicUnifiedWorkstationPreviewV3 } from "@/lib/creative/music/client/MusicUnifiedWorkstationTransportV3";
import { resolveMusicTrackPreviewClips } from "@/lib/creative/music/client/MusicMultitrackPreviewEngine";
import { ensureMusicTempoMap, musicBeatToSeconds } from "@/lib/creative/music/runtime/CreativeMusicTempoMapRuntime";

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value, min))); }
function formatTime(seconds) { const safe = Math.max(0, finite(seconds, 0)); const minutes = Math.floor(safe / 60); const remain = safe - minutes * 60; return `${minutes}:${remain.toFixed(1).padStart(4, "0")}`; }
function tempoMap(session) { return ensureMusicTempoMap(session?.tempo_map || {}, session || {}); }
function laneLengthSeconds(session) {
  const map = tempoMap(session);
  const audioEnds = (session?.tracks || []).flatMap((track) => resolveMusicTrackPreviewClips(track).map((clip) => finite(clip.start_seconds, 0) + finite(clip.duration_seconds, 0)));
  const midiEnds = (session?.midi?.tracks || []).flatMap((track) => (track.clips || []).map((clip) => musicBeatToSeconds(map, finite(clip.start_beat, 0) + finite(clip.duration_beats, 0))));
  return Math.max(30, ...audioEnds, ...midiEnds);
}

export default function MusicUnifiedTimelinePanel({ organizationId, projectId, onRevisionChange }) {
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [loop, setLoop] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(8);
  const [transportEvidence, setTransportEvidence] = useState(null);
  const transportRef = useRef(null);
  const tickRef = useRef(null);

  async function load() {
    if (!organizationId || !projectId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/creative/music/multitrack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "load", organization_id: organizationId, creative_project_id: projectId }) });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Unified Workstation could not load");
      setPayload(body);
      setPlayhead((current) => Math.min(current, laneLengthSeconds(body.session)));
      onRevisionChange?.(body.revision || 0);
    } catch (cause) { setError(cause?.message || "Unified Workstation could not load"); }
    finally { setBusy(false); }
  }

  function stopTicker() { if (tickRef.current) cancelAnimationFrame(tickRef.current); tickRef.current = null; }
  function stop({ keepPosition = true } = {}) {
    stopTicker(); const active = transportRef.current; transportRef.current = null;
    if (active) { const position = active.stop(); if (keepPosition && Number.isFinite(position)) setPlayhead(position); }
    setPlaying(false);
  }
  function tick() {
    const active = transportRef.current; if (!active) return;
    const position = active.currentPosition(); setPlayhead(position);
    if (loop && position >= loopEnd - 0.03) { stop({ keepPosition: false }); setPlayhead(loopStart); void play(loopStart); return; }
    tickRef.current = requestAnimationFrame(tick);
  }
  async function play(from = playhead) {
    if (!payload?.session || transportRef.current) return;
    const length = laneLengthSeconds(payload.session);
    const start = clamp(loop ? Math.max(loopStart, from) : from, 0, length);
    const stopAt = loop ? clamp(loopEnd, start + 0.05, length) : length;
    setError("");
    try {
      const transport = await startMusicUnifiedWorkstationPreviewV3({
        session: payload.session,
        assetUrls: payload.asset_urls || {},
        sampler: payload.sampler || null,
        sampleUrls: payload.sample_urls || {},
        startSeconds: start,
        stopAtSeconds: stopAt,
        onEnded: ({ position_seconds: position, natural }) => {
          if (transportRef.current !== transport) return;
          transportRef.current = null; stopTicker(); setPlaying(false);
          if (loop && natural) { setPlayhead(loopStart); void play(loopStart); }
          else setPlayhead(Number.isFinite(position) ? position : start);
        },
      });
      transportRef.current = transport;
      setTransportEvidence({ contract: transport.contract, synth_notes: transport.synth_note_count || 0, sampler_hits: transport.sampler_hit_count || 0, tempo_map_aware: transport.tempo_map_aware === true });
      setPlaying(true); setPlayhead(start); tickRef.current = requestAnimationFrame(tick);
    } catch (cause) { setError(cause?.message || "Unified playback could not start"); }
  }

  useEffect(() => { void load(); }, [organizationId, projectId]);
  useEffect(() => () => stop({ keepPosition: false }), []);

  const session = payload?.session || null;
  const map = useMemo(() => tempoMap(session), [session]);
  const songLength = useMemo(() => laneLengthSeconds(session), [session]);
  const audioLanes = session?.tracks || [];
  const midiLanes = session?.midi?.tracks || [];

  if (!projectId) return null;

  return (
    <section className="border-b border-white/8 bg-[#090909] px-4 py-4 text-white">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#d6a66a]/75">Unified Workstation Timeline</div>
          <div className="mt-1 text-[9px] text-white/28">Audio + MIDI + sampler + tempo map share one transport clock · revision {payload?.revision || 0}</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" disabled={!session || busy} onClick={() => playing ? stop() : void play()} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#d6a66a]/30 bg-[#d6a66a]/10 text-[#efd29f] disabled:opacity-25">{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
          <button type="button" disabled={!playing} onClick={() => stop()} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.02] text-white/45 disabled:opacity-20"><Square className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={busy || playing} onClick={() => void load()} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.02] text-white/35 disabled:opacity-20"><RefreshCw className="h-3.5 w-3.5" /></button>
          <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 font-mono text-[10px] text-white/55">{formatTime(playhead)}</div>
          <button type="button" onClick={() => setLoop((value) => !value)} className={`rounded-lg border px-2.5 py-2 text-[8px] ${loop ? "border-[#d6a66a]/30 bg-[#d6a66a]/10 text-[#efd29f]" : "border-white/8 text-white/32"}`}>LOOP</button>
          <input type="number" step="0.1" min="0" value={loopStart} onChange={(event) => setLoopStart(clamp(event.target.value, 0, songLength))} className="w-16 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45" />
          <span className="text-[8px] text-white/20">→</span>
          <input type="number" step="0.1" min="0.1" value={loopEnd} onChange={(event) => setLoopEnd(clamp(event.target.value, 0.1, songLength))} className="w-16 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45" />
        </div>
      </div>

      {transportEvidence ? <div className="mt-2 text-[7px] text-emerald-100/30">Transport V3 · tempo map {transportEvidence.tempo_map_aware ? "active" : "off"} · synth {transportEvidence.synth_notes} · sampler {transportEvidence.sampler_hits}</div> : null}
      {map.tempo_events.length > 1 || map.meter_events.length > 1 ? <div className="mt-1 text-[7px] text-[#d6a66a]/35">{map.tempo_events.length} tempo events · {map.meter_events.length} meter events</div> : null}
      {error ? <div className="mt-3 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-3 py-2 text-[8px] text-red-100/55">{error}</div> : null}

      {session ? <div className="mt-4 overflow-x-auto rounded-xl border border-white/7 bg-black/20">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[180px_1fr] border-b border-white/7 text-[7px] text-white/20">
            <div className="border-r border-white/7 px-3 py-2">TRACK</div>
            <button type="button" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const next = ((event.clientX - rect.left) / Math.max(1, rect.width)) * songLength; const wasPlaying = Boolean(transportRef.current); if (wasPlaying) stop({ keepPosition: false }); setPlayhead(next); if (wasPlaying) void play(next); }} className="relative h-8 text-left">
              {Array.from({ length: 9 }, (_, index) => <span key={index} className="absolute top-0 h-full border-l border-white/[0.05] px-1 pt-2" style={{ left: `${index / 8 * 100}%` }}>{formatTime(index / 8 * songLength)}</span>)}
              <span className="absolute inset-y-0 w-px bg-[#d6a66a]/70" style={{ left: `${Math.min(100, playhead / songLength * 100)}%` }} />
            </button>
          </div>

          {audioLanes.map((track) => <div key={`audio-${track.id}`} className="grid grid-cols-[180px_1fr] border-b border-white/[0.05]">
            <div className="border-r border-white/7 px-3 py-3"><div className="text-[8px] text-white/50">{track.name}</div><div className="mt-1 text-[6px] uppercase tracking-[0.15em] text-white/18">Audio · {track.type}</div></div>
            <div className="relative h-12 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:6.25%_100%]">
              {resolveMusicTrackPreviewClips(track).map((clip) => { const left = clamp(finite(clip.start_seconds, 0) / songLength * 100, 0, 100); const width = Math.max(0.8, Math.min(100 - left, finite(clip.duration_seconds, 0) / songLength * 100)); return <div key={clip.id} className="absolute top-2 h-8 rounded-md border border-[#d6a66a]/20 bg-[#d6a66a]/[0.08] px-2 py-1 text-[6px] text-[#efd29f]/60" style={{ left: `${left}%`, width: `${width}%` }}>Audio</div>; })}
              <span className="pointer-events-none absolute inset-y-0 w-px bg-[#d6a66a]/55" style={{ left: `${Math.min(100, playhead / songLength * 100)}%` }} />
            </div>
          </div>)}

          {midiLanes.map((track) => <div key={`midi-${track.id}`} className="grid grid-cols-[180px_1fr] border-b border-white/[0.05] bg-[#d6a66a]/[0.012]">
            <div className="border-r border-white/7 px-3 py-3"><div className="text-[8px] text-white/50">{track.name}</div><div className="mt-1 text-[6px] uppercase tracking-[0.15em] text-[#d6a66a]/35">MIDI · {track.instrument?.kind || "instrument"}</div></div>
            <div className="relative h-12 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:6.25%_100%]">
              {(track.clips || []).map((clip) => { const startSeconds = musicBeatToSeconds(map, finite(clip.start_beat, 0)); const endSeconds = musicBeatToSeconds(map, finite(clip.start_beat, 0) + finite(clip.duration_beats, 0)); const durationSeconds = Math.max(0, endSeconds - startSeconds); const left = clamp(startSeconds / songLength * 100, 0, 100); const width = Math.max(0.8, Math.min(100 - left, durationSeconds / songLength * 100)); return <div key={clip.id} className="absolute top-2 h-8 overflow-hidden rounded-md border border-emerald-300/20 bg-emerald-300/[0.06] px-2 py-1" style={{ left: `${left}%`, width: `${width}%` }}><div className="truncate text-[6px] text-emerald-100/55">{clip.name || "MIDI Clip"}</div><div className="mt-0.5 flex gap-[2px]">{(clip.notes || []).slice(0, 16).map((note) => <span key={note.id} className="h-1 flex-1 rounded-sm bg-emerald-200/25" />)}</div></div>; })}
              <span className="pointer-events-none absolute inset-y-0 w-px bg-[#d6a66a]/55" style={{ left: `${Math.min(100, playhead / songLength * 100)}%` }} />
            </div>
          </div>)}
        </div>
      </div> : <div className="mt-4 text-[8px] text-white/25">{busy ? "Loading unified timeline…" : "Timeline unavailable."}</div>}

      <div className="mt-2 text-[7px] text-white/18">Transport V3 schedules owned synth and sampler performances against the multitrack WebAudio clock using the project tempo map. Browser preview remains separate from release mastering.</div>
    </section>
  );
}
