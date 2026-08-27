"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleDot,
  Gauge,
  Headphones,
  Layers3,
  Plus,
  Radio,
  Save,
  SlidersHorizontal,
  Speaker,
  Volume2,
} from "lucide-react";

const TRACK_TYPES = [
  ["vocal", "Vocal"],
  ["guitar", "Guitar"],
  ["bass", "Bass"],
  ["keys", "Keys"],
  ["drums", "Drums"],
  ["instrument", "Instrument"],
  ["backing", "Backing"],
  ["stem", "Stem"],
  ["audio", "Audio"],
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
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
    compressor: {
      enabled: false,
      threshold_db: -18,
      ratio: 3,
      attack_ms: 15,
      release_ms: 150,
      knee_db: 6,
      makeup_db: 0,
    },
    engineering_order: ["input_trim", "polarity", "high_pass", "low_shelf", "presence", "high_shelf", "compressor", "fader", "pan", "bus"],
  };
}

function makeTrack(type, index) {
  return {
    id: crypto.randomUUID(),
    type,
    name: `${TRACK_TYPES.find(([id]) => id === type)?.[1] || "Audio"} ${index + 1}`,
    armed: false,
    input_device_id: null,
    input_channel: 1,
    monitor: "off",
    mute: false,
    solo: false,
    gain_db: 0,
    pan: 0,
    output_bus_id: "bus-master",
    color_token: null,
    channel_strip: makeChannelStrip(),
    clips: [],
    takes: [],
    comp: null,
    inserts: [],
    sends: [],
    automation_lane_ids: [],
    destructive_processing_allowed: false,
  };
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[9px] uppercase tracking-[0.17em] text-white/28">{label}</div>
      {children}
    </label>
  );
}

function SmallButton({ active = false, children, onClick, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`min-w-8 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition ${active ? "border-[#d6a66a]/35 bg-[#d6a66a]/12 text-[#efd29f]" : "border-white/8 bg-white/[0.02] text-white/40 hover:text-white/70"}`}
    >
      {children}
    </button>
  );
}

export default function MusicMultitrackStudioPanel({ organizationId, projectId, projectName = "Music Project" }) {
  const [session, setSession] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [newTrackType, setNewTrackType] = useState("vocal");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  async function request(payload) {
    const response = await fetch("/api/creative/music/multitrack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "Multitrack request failed");
    return body;
  }

  async function load() {
    if (!organizationId || !projectId) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({ action: "load", organization_id: organizationId, creative_project_id: projectId });
      setSession(result.session);
      setSelectedTrackId(result.session?.tracks?.[0]?.id || null);
      setDirty(false);
    } catch (cause) {
      setError(cause?.message || "Multitrack project could not load");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, projectId]);

  function updateSession(mutator) {
    setSession((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
    setDirty(true);
  }

  function updateTrack(trackId, mutator) {
    updateSession((draft) => {
      const track = draft.tracks.find((entry) => entry.id === trackId);
      if (track) mutator(track);
    });
  }

  function addTrack() {
    updateSession((draft) => {
      const track = makeTrack(newTrackType, draft.tracks.length);
      draft.tracks.push(track);
      setSelectedTrackId(track.id);
    });
  }

  async function save() {
    if (!session || !organizationId || !projectId) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: "save",
        organization_id: organizationId,
        creative_project_id: projectId,
        session,
      });
      setSession(result.session);
      setDirty(false);
      setSavedAt(new Date());
    } catch (cause) {
      setError(cause?.message || "Multitrack project could not save");
    } finally {
      setBusy(false);
    }
  }

  const selectedTrack = useMemo(
    () => session?.tracks?.find((track) => track.id === selectedTrackId) || session?.tracks?.[0] || null,
    [session, selectedTrackId],
  );

  const songLength = useMemo(() => {
    const end = Math.max(0, ...(session?.tracks || []).flatMap((track) => (track.clips || []).map((clip) => Number(clip.start_seconds || 0) + Number(clip.duration_seconds || 0))));
    return Math.max(30, Math.ceil(end / 10) * 10 || 30);
  }, [session]);

  if (!projectId) {
    return <div className="p-8 text-sm text-white/42">Open or create a Music project before using the multitrack workstation.</div>;
  }

  if (!session) {
    return <div className="p-8 text-sm text-white/42">{busy ? "Loading multitrack project…" : error || "Multitrack project unavailable."}</div>;
  }

  return (
    <section className="min-h-[760px] bg-[#070707] text-white">
      <div className="border-b border-white/8 bg-black/25 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]/75"><Layers3 className="h-3.5 w-3.5" /> Music Workstation</div>
            <div className="mt-1 text-lg font-medium text-white/82">{session.title || projectName}</div>
            <div className="mt-1 text-[10px] text-white/28">24-bit project · non-destructive · original takes preserved · revision {session.revision || 0}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-white/55">
              <span className="text-white/25">BPM</span>{" "}
              <input
                type="number"
                min="30"
                max="300"
                value={session.bpm}
                onChange={(event) => updateSession((draft) => { draft.bpm = clamp(event.target.value, 30, 300); })}
                className="ml-2 w-14 bg-transparent text-right outline-none"
              />
            </div>
            <select
              value={session.time_signature}
              onChange={(event) => updateSession((draft) => { draft.time_signature = event.target.value; })}
              className="rounded-xl border border-white/8 bg-[#0b0b0b] px-3 py-2 text-xs text-white/60 outline-none"
            >
              <option>4/4</option><option>3/4</option><option>6/8</option><option>2/4</option>
            </select>
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={save}
              className="inline-flex items-center gap-2 rounded-xl border border-[#d6a66a]/30 bg-[#d6a66a]/12 px-4 py-2.5 text-xs font-medium text-[#efd29f] disabled:opacity-30"
            >
              <Save className="h-4 w-4" /> {busy ? "Saving…" : dirty ? "Save project" : "Saved"}
            </button>
          </div>
        </div>
        {savedAt ? <div className="mt-2 text-right text-[9px] text-white/22">Saved {savedAt.toLocaleTimeString()}</div> : null}
        {error ? <div className="mt-3 rounded-xl border border-red-400/15 bg-red-400/[0.05] px-4 py-2.5 text-xs text-red-100/70">{error}</div> : null}
      </div>

      <div className="grid min-h-[680px] xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 border-r border-white/8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/7 px-4 py-3">
            <div className="flex items-center gap-2">
              <select value={newTrackType} onChange={(event) => setNewTrackType(event.target.value)} className="rounded-lg border border-white/8 bg-[#0c0c0c] px-3 py-2 text-xs text-white/55 outline-none">
                {TRACK_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <button type="button" onClick={addTrack} className="inline-flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/55 hover:text-white/80"><Plus className="h-3.5 w-3.5" /> Add track</button>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-white/26">
              <span>{session.tracks.length} tracks</span>
              <span>{songLength}s timeline</span>
              <span className="text-emerald-100/45">6 dB pre-master headroom</span>
            </div>
          </div>

          <div className="grid grid-cols-[220px_minmax(600px,1fr)] border-b border-white/7 bg-black/20 text-[9px] text-white/24">
            <div className="border-r border-white/7 px-4 py-2">TRACKS</div>
            <div className="relative h-8 overflow-hidden">
              {Array.from({ length: 7 }, (_, index) => {
                const seconds = (songLength / 6) * index;
                return <div key={index} className="absolute top-0 h-full border-l border-white/[0.05] px-1 pt-2" style={{ left: `${(index / 6) * 100}%` }}>{formatTime(seconds)}</div>;
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            {(session.tracks.length ? session.tracks : []).map((track) => {
              const active = selectedTrack?.id === track.id;
              return (
                <div key={track.id} className={`grid min-w-[820px] grid-cols-[220px_minmax(600px,1fr)] border-b border-white/[0.055] ${active ? "bg-[#d6a66a]/[0.025]" : ""}`}>
                  <button type="button" onClick={() => setSelectedTrackId(track.id)} className="border-r border-white/7 p-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <input value={track.name} onClick={(event) => event.stopPropagation()} onChange={(event) => updateTrack(track.id, (draft) => { draft.name = event.target.value; })} className="min-w-0 flex-1 bg-transparent text-xs font-medium text-white/68 outline-none" />
                      <span className="text-[8px] uppercase tracking-[0.14em] text-white/20">{track.type}</span>
                    </div>
                    <div className="mt-3 flex gap-1.5">
                      <SmallButton active={track.armed} onClick={(event) => { event?.stopPropagation?.(); updateTrack(track.id, (draft) => { draft.armed = !draft.armed; }); }} title="Record arm">R</SmallButton>
                      <SmallButton active={track.mute} onClick={() => updateTrack(track.id, (draft) => { draft.mute = !draft.mute; })}>M</SmallButton>
                      <SmallButton active={track.solo} onClick={() => updateTrack(track.id, (draft) => { draft.solo = !draft.solo; })}>S</SmallButton>
                      <SmallButton active={track.monitor !== "off"} onClick={() => updateTrack(track.id, (draft) => { draft.monitor = draft.monitor === "off" ? "auto" : "off"; })}>I</SmallButton>
                    </div>
                  </button>

                  <div className="relative h-[86px] bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:10%_100%]">
                    {(track.clips || []).map((clip) => {
                      const left = Math.min(100, (Number(clip.start_seconds || 0) / songLength) * 100);
                      const width = Math.max(1, Math.min(100 - left, (Number(clip.duration_seconds || 0) / songLength) * 100));
                      return (
                        <div key={clip.id} className="absolute top-3 h-[60px] overflow-hidden rounded-lg border border-[#d6a66a]/20 bg-[#d6a66a]/[0.08] px-2 py-2" style={{ left: `${left}%`, width: `${width}%` }}>
                          <div className="truncate text-[9px] font-medium text-[#efd29f]/75">Take / asset</div>
                          <div className="mt-1 text-[8px] text-white/25">{formatTime(clip.duration_seconds)}</div>
                        </div>
                      );
                    })}
                    {!track.clips?.length ? <div className="absolute inset-0 flex items-center px-4 text-[9px] text-white/14">Drop or record audio here</div> : null}
                  </div>
                </div>
              );
            })}

            {!session.tracks.length ? (
              <div className="flex min-h-72 items-center justify-center text-center">
                <div>
                  <Layers3 className="mx-auto h-8 w-8 text-white/13" />
                  <div className="mt-3 text-sm text-white/38">Add a vocal, instrument, backing or stem track</div>
                  <div className="mt-1 text-xs text-white/20">Recorded takes will remain immutable source assets.</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="bg-black/20 p-4">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d6a66a]/65"><SlidersHorizontal className="h-3.5 w-3.5" /> Engineer channel</div>
          {selectedTrack ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
                <div className="flex items-center justify-between gap-3"><div className="text-sm font-medium text-white/70">{selectedTrack.name}</div><div className="text-[9px] text-white/22">→ Master</div></div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Field label="Input trim"><input type="range" min="-24" max="24" step="0.5" value={selectedTrack.channel_strip?.input_trim_db || 0} onChange={(event) => updateTrack(selectedTrack.id, (draft) => { draft.channel_strip.input_trim_db = Number(event.target.value); })} className="w-full accent-[#d6a66a]" /><div className="text-right text-[9px] text-white/28">{Number(selectedTrack.channel_strip?.input_trim_db || 0).toFixed(1)} dB</div></Field>
                  <Field label="High-pass"><input type="range" min="20" max="400" step="1" value={selectedTrack.channel_strip?.high_pass_hz || 20} onChange={(event) => updateTrack(selectedTrack.id, (draft) => { draft.channel_strip.high_pass_hz = Number(event.target.value); })} className="w-full accent-[#d6a66a]" /><div className="text-right text-[9px] text-white/28">{Math.round(selectedTrack.channel_strip?.high_pass_hz || 20)} Hz</div></Field>
                  <Field label="Low shelf"><input type="range" min="-12" max="12" step="0.5" value={selectedTrack.channel_strip?.low_shelf_db || 0} onChange={(event) => updateTrack(selectedTrack.id, (draft) => { draft.channel_strip.low_shelf_db = Number(event.target.value); })} className="w-full accent-[#d6a66a]" /></Field>
                  <Field label="Presence"><input type="range" min="-12" max="12" step="0.5" value={selectedTrack.channel_strip?.presence_db || 0} onChange={(event) => updateTrack(selectedTrack.id, (draft) => { draft.channel_strip.presence_db = Number(event.target.value); })} className="w-full accent-[#d6a66a]" /></Field>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/7 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-white/48"><Radio className="h-3.5 w-3.5" /> Polarity invert</div>
                  <input type="checkbox" checked={selectedTrack.channel_strip?.polarity_invert === true} onChange={(event) => updateTrack(selectedTrack.id, (draft) => { draft.channel_strip.polarity_invert = event.target.checked; })} className="h-4 w-4 accent-[#d6a66a]" />
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-medium text-white/58"><Gauge className="h-3.5 w-3.5" /> Compressor</div><input type="checkbox" checked={selectedTrack.channel_strip?.compressor?.enabled === true} onChange={(event) => updateTrack(selectedTrack.id, (draft) => { draft.channel_strip.compressor.enabled = event.target.checked; })} className="h-4 w-4 accent-[#d6a66a]" /></div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Field label="Threshold"><input type="number" min="-60" max="0" value={selectedTrack.channel_strip?.compressor?.threshold_db ?? -18} onChange={(event) => updateTrack(selectedTrack.id, (draft) => { draft.channel_strip.compressor.threshold_db = clamp(event.target.value, -60, 0); })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-xs text-white/60 outline-none" /></Field>
                  <Field label="Ratio"><input type="number" min="1" max="20" step="0.1" value={selectedTrack.channel_strip?.compressor?.ratio ?? 3} onChange={(event) => updateTrack(selectedTrack.id, (draft) => { draft.channel_strip.compressor.ratio = clamp(event.target.value, 1, 20); })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-xs text-white/60 outline-none" /></Field>
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-white/58"><Volume2 className="h-3.5 w-3.5" /> Fader & pan</div>
                <Field label="Track fader"><input type="range" min="-60" max="12" step="0.5" value={selectedTrack.gain_db} onChange={(event) => updateTrack(selectedTrack.id, (draft) => { draft.gain_db = Number(event.target.value); })} className="mt-3 w-full accent-[#d6a66a]" /><div className="text-right text-[9px] text-white/28">{Number(selectedTrack.gain_db).toFixed(1)} dB</div></Field>
                <Field label="Pan"><input type="range" min="-1" max="1" step="0.01" value={selectedTrack.pan} onChange={(event) => updateTrack(selectedTrack.id, (draft) => { draft.pan = Number(event.target.value); })} className="w-full accent-[#d6a66a]" /><div className="text-right text-[9px] text-white/28">{selectedTrack.pan < -0.02 ? `L ${Math.round(Math.abs(selectedTrack.pan) * 100)}` : selectedTrack.pan > 0.02 ? `R ${Math.round(selectedTrack.pan * 100)}` : "Center"}</div></Field>
              </div>

              <div className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[0.025] p-4 text-[10px] leading-5 text-emerald-100/45">
                <div className="flex items-center gap-2 font-medium text-emerald-100/60"><Speaker className="h-3.5 w-3.5" /> Engineering policy</div>
                <div className="mt-2">Clip gain → input trim → polarity → filters/EQ → compression → fader/pan → bus. Release limiting stays at the mastering stage; original source audio is never overwritten.</div>
              </div>
            </div>
          ) : (
            <div className="mt-8 text-center text-xs text-white/25"><Headphones className="mx-auto mb-2 h-6 w-6" />Select a track to open its channel strip.</div>
          )}
        </aside>
      </div>
    </section>
  );
}
