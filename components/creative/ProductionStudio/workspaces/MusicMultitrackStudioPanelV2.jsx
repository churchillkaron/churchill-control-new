"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDot,
  Gauge,
  Headphones,
  Layers3,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Square,
  Volume2,
} from "lucide-react";

import { startMusicMultitrackPreview } from "@/lib/creative/music/client/MusicMultitrackPreviewEngine";

const TRACK_TYPES = [
  ["vocal", "Vocal"], ["guitar", "Guitar"], ["bass", "Bass"],
  ["keys", "Keys"], ["drums", "Drums"], ["instrument", "Instrument"],
  ["backing", "Backing"], ["stem", "Stem"], ["audio", "Audio"],
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function makeChannelStrip() {
  return {
    contract: "AVANTIQO_MUSIC_ENGINEER_CHANNEL_STRIP_V1",
    input_trim_db: 0,
    polarity_invert: false,
    high_pass_hz: 20,
    low_shelf_db: 0,
    presence_db: 0,
    high_shelf_db: 0,
    compressor: { enabled: false, threshold_db: -18, ratio: 3, attack_ms: 15, release_ms: 150, knee_db: 6, makeup_db: 0 },
    engineering_order: ["input_trim", "polarity", "high_pass", "low_shelf", "presence", "high_shelf", "compressor", "fader", "pan", "bus"],
  };
}

function makeTrack(type, index) {
  return {
    id: crypto.randomUUID(), type,
    name: `${TRACK_TYPES.find(([id]) => id === type)?.[1] || "Audio"} ${index + 1}`,
    armed: false, input_device_id: null, input_channel: 1, monitor: "off",
    mute: false, solo: false, gain_db: 0, pan: 0, output_bus_id: "bus-master",
    color_token: null, channel_strip: makeChannelStrip(), clips: [], takes: [], comp: null,
    inserts: [], sends: [], automation_lane_ids: [], destructive_processing_allowed: false,
  };
}

function Field({ label, children }) {
  return <label className="block"><div className="mb-1.5 text-[9px] uppercase tracking-[0.16em] text-white/28">{label}</div>{children}</label>;
}

function TinyButton({ active = false, children, onClick, title }) {
  return <button type="button" title={title} onClick={onClick} className={`min-w-8 rounded-lg border px-2 py-1.5 text-[10px] font-medium ${active ? "border-[#d6a66a]/40 bg-[#d6a66a]/12 text-[#efd29f]" : "border-white/8 bg-white/[0.02] text-white/40 hover:text-white/75"}`}>{children}</button>;
}

export default function MusicMultitrackStudioPanelV2({ organizationId, projectId, projectName = "Music Project" }) {
  const [session, setSession] = useState(null);
  const [assetUrls, setAssetUrls] = useState({});
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [newTrackType, setNewTrackType] = useState("vocal");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(8);
  const transportRef = useRef(null);
  const tickRef = useRef(null);

  async function request(payload) {
    const response = await fetch("/api/creative/music/multitrack", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "Multitrack request failed");
    return body;
  }

  function stopTicker() {
    if (tickRef.current) cancelAnimationFrame(tickRef.current);
    tickRef.current = null;
  }

  function stopTransport({ keepPosition = true } = {}) {
    stopTicker();
    const active = transportRef.current;
    transportRef.current = null;
    if (active) {
      const position = active.stop();
      if (keepPosition && Number.isFinite(position)) setPlayhead(position);
    }
    setPlaying(false);
  }

  useEffect(() => () => stopTransport({ keepPosition: false }), []);

  async function load() {
    if (!organizationId || !projectId) return;
    stopTransport({ keepPosition: false });
    setBusy(true); setError("");
    try {
      const result = await request({ action: "load", organization_id: organizationId, creative_project_id: projectId });
      setSession(result.session); setAssetUrls(result.asset_urls || {});
      setSelectedTrackId(result.session?.tracks?.[0]?.id || null);
      setPlayhead(Number(result.session?.timeline?.playhead_seconds || 0));
      setDirty(false);
    } catch (cause) { setError(cause?.message || "Multitrack project could not load"); }
    finally { setBusy(false); }
  }

  useEffect(() => { load(); }, [organizationId, projectId]);

  function updateSession(mutator) {
    setSession((current) => {
      if (!current) return current;
      const next = structuredClone(current); mutator(next); return next;
    });
    setDirty(true);
  }

  function updateTrack(trackId, mutator) {
    updateSession((draft) => { const track = draft.tracks.find((entry) => entry.id === trackId); if (track) mutator(track); });
  }

  function addTrack() {
    updateSession((draft) => { const track = makeTrack(newTrackType, draft.tracks.length); draft.tracks.push(track); setSelectedTrackId(track.id); });
  }

  async function save() {
    if (!session) return;
    setBusy(true); setError("");
    try {
      const submitted = structuredClone(session);
      submitted.timeline = { ...(submitted.timeline || {}), playhead_seconds: playhead, loop_enabled: loopEnabled, loop_start_seconds: loopStart, loop_end_seconds: loopEnd };
      const result = await request({ action: "save", organization_id: organizationId, creative_project_id: projectId, session: submitted });
      setSession(result.session); setAssetUrls(result.asset_urls || assetUrls); setDirty(false);
    } catch (cause) { setError(cause?.message || "Multitrack project could not save"); }
    finally { setBusy(false); }
  }

  const songLength = useMemo(() => {
    const end = Math.max(0, ...(session?.tracks || []).flatMap((track) => (track.clips || []).map((clip) => Number(clip.start_seconds || 0) + Number(clip.duration_seconds || 0))));
    return Math.max(30, Math.ceil(end / 10) * 10 || 30);
  }, [session]);
  const selectedTrack = useMemo(() => session?.tracks?.find((track) => track.id === selectedTrackId) || session?.tracks?.[0] || null, [session, selectedTrackId]);

  function tick() {
    const active = transportRef.current;
    if (!active) return;
    const position = active.currentPosition(); setPlayhead(position);
    if (loopEnabled && position >= loopEnd - 0.03) {
      active.stop(); transportRef.current = null; setPlaying(false);
      setPlayhead(loopStart); void play(loopStart); return;
    }
    tickRef.current = requestAnimationFrame(tick);
  }

  async function play(from = playhead) {
    if (!session || playing) return;
    setError("");
    const start = clamp(loopEnabled ? Math.max(loopStart, from) : from, 0, songLength);
    const stopAt = loopEnabled ? clamp(loopEnd, start + 0.05, songLength) : null;
    try {
      const transport = await startMusicMultitrackPreview({
        session, assetUrls, startSeconds: start, stopAtSeconds: stopAt,
        onEnded: ({ position_seconds: position, natural }) => {
          if (transportRef.current !== transport) return;
          transportRef.current = null; stopTicker(); setPlaying(false);
          if (loopEnabled && natural) { setPlayhead(loopStart); void play(loopStart); }
          else setPlayhead(Number.isFinite(position) ? position : start);
        },
      });
      transportRef.current = transport; setPlaying(true); setPlayhead(start); tickRef.current = requestAnimationFrame(tick);
    } catch (cause) { setError(cause?.message || "Playback could not start"); }
  }

  function seek(seconds) {
    const next = clamp(seconds, 0, songLength);
    const wasPlaying = playing;
    if (wasPlaying) stopTransport({ keepPosition: false });
    setPlayhead(next);
    if (wasPlaying) void play(next);
  }

  function timelineSeek(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    seek(((event.clientX - rect.left) / Math.max(1, rect.width)) * songLength);
  }

  if (!projectId) return <div className="p-8 text-sm text-white/42">Open or create a Music project before using the Workstation.</div>;
  if (!session) return <div className="p-8 text-sm text-white/42">{busy ? "Loading multitrack project…" : error || "Workstation unavailable."}</div>;

  return (
    <section className="min-h-[760px] bg-[#070707] text-white">
      <div className="border-b border-white/8 bg-black/25 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]/75"><Layers3 className="h-3.5 w-3.5" /> Music Workstation V2</div><div className="mt-1 text-lg font-medium text-white/82">{session.title || projectName}</div><div className="mt-1 text-[10px] text-white/28">24-bit · non-destructive · synchronized transport · revision {session.revision || 0}</div></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => playing ? stopTransport() : play()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d6a66a]/30 bg-[#d6a66a]/12 text-[#efd29f]">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
            <button type="button" onClick={() => stopTransport()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/55"><Square className="h-4 w-4" /></button>
            <button type="button" onClick={() => { stopTransport({ keepPosition: false }); setPlayhead(0); }} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/55"><RotateCcw className="h-4 w-4" /></button>
            <div className="min-w-20 rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-center font-mono text-xs text-white/65">{formatTime(playhead)}</div>
            <button type="button" disabled={!dirty || busy} onClick={save} className="inline-flex items-center gap-2 rounded-xl border border-[#d6a66a]/30 bg-[#d6a66a]/12 px-4 py-2.5 text-xs text-[#efd29f] disabled:opacity-30"><Save className="h-4 w-4" /> Save</button>
          </div>
        </div>
        {error ? <div className="mt-3 rounded-xl border border-red-400/15 bg-red-400/[0.05] px-4 py-2.5 text-xs text-red-100/70">{error}</div> : null}
      </div>

      <div className="border-b border-white/7 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><select value={newTrackType} onChange={(e) => setNewTrackType(e.target.value)} className="rounded-lg border border-white/8 bg-[#0c0c0c] px-3 py-2 text-xs text-white/55">{TRACK_TYPES.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select><button onClick={addTrack} className="inline-flex items-center gap-2 rounded-lg border border-white/8 px-3 py-2 text-xs text-white/55"><Plus className="h-3.5 w-3.5" /> Add track</button></div>
          <div className="ml-auto flex items-center gap-2 text-[10px]"><TinyButton active={loopEnabled} onClick={() => setLoopEnabled((v) => !v)}>LOOP</TinyButton><input type="number" step="0.1" min="0" value={loopStart} onChange={(e) => setLoopStart(clamp(e.target.value,0,songLength))} className="w-16 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-white/55"/><span className="text-white/25">→</span><input type="number" step="0.1" min="0.1" value={loopEnd} onChange={(e) => setLoopEnd(clamp(e.target.value,0.1,songLength))} className="w-16 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-white/55"/><span className="text-emerald-100/45">6 dB headroom</span></div>
        </div>
      </div>

      <div className="grid min-h-[660px] xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 border-r border-white/8">
          <div className="grid grid-cols-[220px_minmax(600px,1fr)] border-b border-white/7 bg-black/20 text-[9px] text-white/24"><div className="border-r border-white/7 px-4 py-2">TRACKS</div><button type="button" onClick={timelineSeek} className="relative h-10 text-left">
            {Array.from({length:7},(_,i) => <div key={i} className="absolute top-0 h-full border-l border-white/[0.06] px-1 pt-2" style={{left:`${i/6*100}%`}}>{formatTime(songLength/6*i)}</div>)}
            <div className="absolute inset-y-0 w-px bg-[#d6a66a]" style={{left:`${Math.min(100,playhead/songLength*100)}%`}} />
            {loopEnabled ? <div className="absolute inset-y-0 border-x border-[#d6a66a]/35 bg-[#d6a66a]/[0.04]" style={{left:`${loopStart/songLength*100}%`,width:`${Math.max(0,(loopEnd-loopStart)/songLength*100)}%`}} /> : null}
          </button></div>

          <div className="overflow-x-auto">
            {session.tracks.map((track) => <div key={track.id} className={`grid min-w-[820px] grid-cols-[220px_minmax(600px,1fr)] border-b border-white/[0.055] ${selectedTrack?.id===track.id ? "bg-[#d6a66a]/[0.025]" : ""}`}>
              <button type="button" onClick={() => setSelectedTrackId(track.id)} className="border-r border-white/7 p-3 text-left"><div className="flex items-center justify-between"><span className="text-xs font-medium text-white/68">{track.name}</span><span className="text-[8px] uppercase text-white/20">{track.type}</span></div><div className="mt-3 flex gap-1.5"><TinyButton active={track.armed} onClick={() => updateTrack(track.id,d=>{d.armed=!d.armed;})}>R</TinyButton><TinyButton active={track.mute} onClick={() => updateTrack(track.id,d=>{d.mute=!d.mute;})}>M</TinyButton><TinyButton active={track.solo} onClick={() => updateTrack(track.id,d=>{d.solo=!d.solo;})}>S</TinyButton><TinyButton active={track.monitor!=="off"} onClick={() => updateTrack(track.id,d=>{d.monitor=d.monitor==="off"?"auto":"off";})}>I</TinyButton></div></button>
              <button type="button" onClick={timelineSeek} className="relative h-[88px] bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:10%_100%] text-left">
                {(track.clips||[]).map((clip) => { const left=clamp(Number(clip.start_seconds||0)/songLength*100,0,100); const width=Math.max(1,Math.min(100-left,Number(clip.duration_seconds||0)/songLength*100)); return <div key={clip.id} className="absolute top-3 h-[60px] overflow-hidden rounded-lg border border-[#d6a66a]/20 bg-[#d6a66a]/[0.08] px-2 py-2" style={{left:`${left}%`,width:`${width}%`}}><div className="truncate text-[9px] font-medium text-[#efd29f]/75">Take</div><div className="mt-1 text-[8px] text-white/25">{formatTime(clip.duration_seconds)}</div></div>; })}
                <div className="absolute inset-y-0 w-px bg-[#d6a66a]/75" style={{left:`${Math.min(100,playhead/songLength*100)}%`}} />
              </button>
            </div>)}
          </div>
        </div>

        <aside className="bg-black/20 p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d6a66a]/65"><SlidersHorizontal className="h-3.5 w-3.5" /> Engineer channel</div>{selectedTrack ? <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4"><div className="text-sm font-medium text-white/70">{selectedTrack.name}</div><div className="mt-4 grid grid-cols-2 gap-3"><Field label="Input trim"><input type="range" min="-24" max="24" step="0.5" value={selectedTrack.channel_strip?.input_trim_db||0} onChange={e=>updateTrack(selectedTrack.id,d=>{d.channel_strip.input_trim_db=Number(e.target.value);})} className="w-full accent-[#d6a66a]"/></Field><Field label="High-pass"><input type="range" min="20" max="400" value={selectedTrack.channel_strip?.high_pass_hz||20} onChange={e=>updateTrack(selectedTrack.id,d=>{d.channel_strip.high_pass_hz=Number(e.target.value);})} className="w-full accent-[#d6a66a]"/></Field><Field label="Low shelf"><input type="range" min="-12" max="12" step="0.5" value={selectedTrack.channel_strip?.low_shelf_db||0} onChange={e=>updateTrack(selectedTrack.id,d=>{d.channel_strip.low_shelf_db=Number(e.target.value);})} className="w-full accent-[#d6a66a]"/></Field><Field label="Presence"><input type="range" min="-12" max="12" step="0.5" value={selectedTrack.channel_strip?.presence_db||0} onChange={e=>updateTrack(selectedTrack.id,d=>{d.channel_strip.presence_db=Number(e.target.value);})} className="w-full accent-[#d6a66a]"/></Field></div><label className="mt-4 flex items-center justify-between rounded-xl border border-white/7 px-3 py-2.5 text-xs text-white/48"><span className="flex items-center gap-2"><Radio className="h-3.5 w-3.5"/>Polarity invert</span><input type="checkbox" checked={selectedTrack.channel_strip?.polarity_invert===true} onChange={e=>updateTrack(selectedTrack.id,d=>{d.channel_strip.polarity_invert=e.target.checked;})} className="accent-[#d6a66a]"/></label></div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs text-white/58"><Gauge className="h-3.5 w-3.5"/>Compressor</div><input type="checkbox" checked={selectedTrack.channel_strip?.compressor?.enabled===true} onChange={e=>updateTrack(selectedTrack.id,d=>{d.channel_strip.compressor.enabled=e.target.checked;})} className="accent-[#d6a66a]"/></div></div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4"><div className="flex items-center gap-2 text-xs text-white/58"><Volume2 className="h-3.5 w-3.5"/>Fader & pan</div><Field label="Fader"><input type="range" min="-60" max="12" step="0.5" value={selectedTrack.gain_db} onChange={e=>updateTrack(selectedTrack.id,d=>{d.gain_db=Number(e.target.value);})} className="w-full accent-[#d6a66a]"/></Field><Field label="Pan"><input type="range" min="-1" max="1" step="0.01" value={selectedTrack.pan} onChange={e=>updateTrack(selectedTrack.id,d=>{d.pan=Number(e.target.value);})} className="w-full accent-[#d6a66a]"/></Field></div>
          <div className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[0.025] p-4 text-[10px] leading-5 text-emerald-100/45"><div className="flex items-center gap-2 text-emerald-100/60"><Headphones className="h-3.5 w-3.5"/>Live preview is not release mastering.</div><div className="mt-2">Clip gain → trim → polarity → EQ → compression → fader/pan → master. Original takes remain immutable.</div></div>
        </div> : <div className="mt-8 text-center text-xs text-white/25"><CircleDot className="mx-auto mb-2 h-6 w-6"/>Select a track.</div>}</aside>
      </div>
    </section>
  );
}
