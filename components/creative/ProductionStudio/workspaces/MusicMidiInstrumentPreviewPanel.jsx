"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Waves } from "lucide-react";
import { startMusicMidiInstrumentPreview } from "@/lib/creative/music/client/MusicMidiInstrumentEngine";

const PRESETS = Object.freeze([
  ["studio_keys", "Studio Keys"],
  ["warm_pad", "Warm Pad"],
  ["mono_bass", "Mono Bass"],
  ["bright_lead", "Bright Lead"],
]);

export default function MusicMidiInstrumentPreviewPanel({ session, disabled = false }) {
  const [trackId, setTrackId] = useState("");
  const [clipId, setClipId] = useState("");
  const [preset, setPreset] = useState("studio_keys");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const transportRef = useRef(null);

  const tracks = session?.midi?.tracks || [];
  const track = useMemo(() => tracks.find((entry) => entry.id === trackId) || tracks[0] || null, [tracks, trackId]);
  const clip = useMemo(() => track?.clips?.find((entry) => entry.id === clipId) || track?.clips?.[0] || null, [track, clipId]);

  useEffect(() => {
    if (track && track.id !== trackId) setTrackId(track.id);
  }, [track, trackId]);
  useEffect(() => {
    if (clip && clip.id !== clipId) setClipId(clip.id);
  }, [clip, clipId]);

  async function stop() {
    const active = transportRef.current;
    transportRef.current = null;
    setPlaying(false);
    if (active) await active.stop();
  }

  async function play() {
    if (!clip || disabled || transportRef.current) return;
    setError("");
    try {
      const transport = await startMusicMidiInstrumentPreview({
        clip,
        bpm: session?.bpm || 120,
        preset,
        onEnded: () => {
          if (transportRef.current === transport) transportRef.current = null;
          setPlaying(false);
        },
      });
      transportRef.current = transport;
      setPlaying(true);
    } catch (cause) {
      setError(cause?.message || "MIDI instrument preview could not start");
    }
  }

  useEffect(() => () => { void stop(); }, []);

  return (
    <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d6a66a]/65"><Waves className="h-3.5 w-3.5" /> Owned MIDI Instrument</div>
          <div className="mt-1 text-[8px] leading-4 text-white/24">Browser WebAudio instrument preview. No external VST, no provider request and no generation cost.</div>
        </div>
        <button type="button" disabled={disabled || !clip} onClick={() => playing ? void stop() : void play()} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#d6a66a]/25 bg-[#d6a66a]/[0.06] text-[#efd29f] disabled:opacity-25">{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <select disabled={disabled || playing || !tracks.length} value={track?.id || ""} onChange={(event) => { setTrackId(event.target.value); setClipId(""); }} className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-25">
          {!tracks.length ? <option value="">No MIDI tracks</option> : null}
          {tracks.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        <select disabled={disabled || playing || !track?.clips?.length} value={clip?.id || ""} onChange={(event) => setClipId(event.target.value)} className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-25">
          {!track?.clips?.length ? <option value="">No MIDI clips</option> : null}
          {(track?.clips || []).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        <select disabled={disabled || playing} value={preset} onChange={(event) => setPreset(event.target.value)} className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-25">
          {PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      {clip ? <div className="mt-2 text-[7px] text-white/18">{clip.notes?.length || 0} notes · {session?.bpm || 120} BPM · preview only, not release render</div> : null}
      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/55">{error}</div> : null}
    </div>
  );
}
