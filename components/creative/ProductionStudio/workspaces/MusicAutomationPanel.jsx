"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, CircleDot, Plus, Square, Trash2 } from "lucide-react";
import {
  removeMusicAutomationLane,
  upsertMusicAutomationLane,
  validateMusicAutomation,
} from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";

const WRITE_MODES = Object.freeze(["READ", "TOUCH", "LATCH", "WRITE"]);
const MIN_CAPTURE_INTERVAL_SECONDS = 0.1;

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(parameter, value) { return parameter === "pan" ? Math.max(-1, Math.min(1, finite(value, 0))) : Math.max(-60, Math.min(12, finite(value, 0))); }
function targetOptions(session, track) { return [{ type: "track", id: track.id, label: `Track · ${track.name || "Selected"}` }, ...(session.buses || []).filter((bus) => bus.type === "group").map((bus) => ({ type: "group", id: bus.id, label: `Group · ${bus.name}` })), { type: "master", id: "bus-master", label: "Master" }]; }
function baseValue(session, target, parameter) { if (target.type === "track") { const item = session.tracks.find((entry) => entry.id === target.id); return parameter === "pan" ? finite(item?.pan, 0) : finite(item?.gain_db, 0); } const bus = session.buses.find((entry) => entry.id === target.id); return parameter === "pan" ? finite(bus?.pan, 0) : finite(bus?.gain_db, 0); }
function laneFor(session, target, parameter) { return (session.automation_lanes || []).find((lane) => lane.target_type === target.type && lane.target_id === target.id && lane.parameter === parameter) || null; }
function withPoint(session, target, parameter, time, value, overwriteWindow = false) {
  const current = laneFor(session, target, parameter);
  const safeTime = Math.max(0, finite(time, 0));
  const safeValue = clamp(parameter, value);
  const radius = overwriteWindow ? MIN_CAPTURE_INTERVAL_SECONDS * 0.75 : 0.001;
  const points = (current?.points || []).filter((point) => Math.abs(finite(point.time_seconds) - safeTime) > radius);
  points.push({ time_seconds: safeTime, value: safeValue });
  points.sort((a, b) => a.time_seconds - b.time_seconds);
  const thinned = [];
  for (const point of points) {
    const prior = thinned[thinned.length - 1];
    if (prior && Math.abs(point.time_seconds - prior.time_seconds) < 0.025 && Math.abs(point.value - prior.value) < (parameter === "pan" ? 0.005 : 0.05)) continue;
    thinned.push(point);
  }
  return upsertMusicAutomationLane(session, { ...(current || {}), target_type: target.type, target_id: target.id, parameter, interpolation: current?.interpolation || "linear", enabled: current?.enabled !== false, points: thinned.slice(-2048) });
}

export default function MusicAutomationPanel({ session, track, playhead = 0, disabled = false, onChange }) {
  const [writeMode, setWriteMode] = useState("READ");
  const [captureFader, setCaptureFader] = useState(finite(track?.gain_db, 0));
  const [capturePan, setCapturePan] = useState(finite(track?.pan, 0));
  const latchFader = useRef(false);
  const latchPan = useRef(false);
  const touchFader = useRef(false);
  const touchPan = useRef(false);
  const lastCaptureTime = useRef(-Infinity);

  useEffect(() => { setCaptureFader(finite(track?.gain_db, 0)); setCapturePan(finite(track?.pan, 0)); latchFader.current = false; latchPan.current = false; touchFader.current = false; touchPan.current = false; lastCaptureTime.current = -Infinity; }, [track?.id]);
  useEffect(() => { if (writeMode === "READ" || writeMode === "TOUCH") { latchFader.current = false; latchPan.current = false; } }, [writeMode]);

  if (!session || !track) return null;
  const targets = targetOptions(session, track);
  const selectedTarget = targets[0];

  function findLane(target, parameter) { return laneFor(session, target, parameter); }
  function commitLane(target, parameter, mutator) {
    const current = findLane(target, parameter);
    const draft = { ...(current || {}), target_type: target.type, target_id: target.id, parameter, interpolation: current?.interpolation || "linear", enabled: current?.enabled !== false, points: structuredClone(current?.points || []) };
    mutator(draft);
    const next = upsertMusicAutomationLane(session, draft);
    validateMusicAutomation(next); onChange?.(next);
  }
  function removeLane(laneId) { const next = removeMusicAutomationLane(session, laneId); validateMusicAutomation(next); onChange?.(next); }

  function capture(points, overwrite = false) {
    let next = session;
    for (const [parameter, value] of points) next = withPoint(next, selectedTarget, parameter, playhead, value, overwrite);
    validateMusicAutomation(next);
    onChange?.(next);
    lastCaptureTime.current = finite(playhead, 0);
  }

  function moveCapture(parameter, value) {
    const safe = clamp(parameter, value);
    if (parameter === "gain_db") setCaptureFader(safe); else setCapturePan(safe);
    if (writeMode === "READ") return;
    if (writeMode === "TOUCH") capture([[parameter, safe]], false);
    if (writeMode === "LATCH") { if (parameter === "gain_db") latchFader.current = true; else latchPan.current = true; capture([[parameter, safe]], false); }
    if (writeMode === "WRITE") capture([[parameter, safe]], true);
  }

  useEffect(() => {
    if (disabled || writeMode === "READ" || writeMode === "TOUCH") return;
    const time = finite(playhead, 0);
    if (Math.abs(time - lastCaptureTime.current) < MIN_CAPTURE_INTERVAL_SECONDS) return;
    if (writeMode === "WRITE") capture([["gain_db", captureFader], ["pan", capturePan]], true);
    else if (writeMode === "LATCH") {
      const points = [];
      if (latchFader.current) points.push(["gain_db", captureFader]);
      if (latchPan.current) points.push(["pan", capturePan]);
      if (points.length) capture(points, true);
    }
  }, [playhead, writeMode, captureFader, capturePan, disabled]);

  function LaneEditor({ target, parameter }) {
    const lane = findLane(target, parameter); const points = lane?.points || []; const writeValue = baseValue(session, target, parameter); const label = parameter === "pan" ? "Pan" : "Fader"; const unit = parameter === "pan" ? "" : " dB";
    return <div className="rounded-xl border border-white/7 bg-black/15 p-3">
      <div className="flex items-center justify-between gap-2"><div><div className="text-[9px] font-medium text-white/48">{label}</div><div className="mt-0.5 text-[7px] text-white/18">{target.label}</div></div><div className="flex items-center gap-2">{lane ? <select disabled={disabled} value={lane.interpolation || "linear"} onChange={(event) => commitLane(target, parameter, (draft) => { draft.interpolation = event.target.value; })} className="rounded-lg border border-white/7 bg-[#0a0a0a] px-1.5 py-1 text-[8px] text-white/35"><option value="linear">Linear</option><option value="step">Step</option></select> : null}{lane ? <label className="flex items-center gap-1 text-[7px] text-white/25"><input type="checkbox" disabled={disabled} checked={lane.enabled !== false} onChange={(event) => commitLane(target, parameter, (draft) => { draft.enabled = event.target.checked; })} className="accent-[#d6a66a]" />On</label> : null}</div></div>
      <button type="button" disabled={disabled} onClick={() => commitLane(target, parameter, (draft) => { const time = Math.max(0, finite(playhead, 0)); const remaining = draft.points.filter((point) => Math.abs(point.time_seconds - time) > 0.001); remaining.push({ time_seconds: time, value: writeValue }); draft.points = remaining.sort((a, b) => a.time_seconds - b.time_seconds); })} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#d6a66a]/18 bg-[#d6a66a]/[0.04] px-2 py-2 text-[8px] text-[#efd29f]/65 disabled:opacity-25"><Plus className="h-3 w-3" /> Write {writeValue.toFixed(parameter === "pan" ? 2 : 1)}{unit} at {finite(playhead, 0).toFixed(2)}s</button>
      <div className="mt-3 space-y-1.5">{points.map((point, index) => <div key={`${point.time_seconds}-${index}`} className="grid grid-cols-[1fr_1fr_24px] gap-1.5"><input disabled={disabled} type="number" min="0" step="0.01" value={point.time_seconds} onChange={(event) => commitLane(target, parameter, (draft) => { draft.points[index].time_seconds = Math.max(0, finite(event.target.value, 0)); draft.points.sort((a, b) => a.time_seconds - b.time_seconds); })} className="rounded-lg border border-white/7 bg-black/20 px-2 py-1.5 text-[8px] text-white/40 disabled:opacity-25" /><input disabled={disabled} type="number" min={parameter === "pan" ? -1 : -60} max={parameter === "pan" ? 1 : 12} step={parameter === "pan" ? 0.01 : 0.5} value={point.value} onChange={(event) => commitLane(target, parameter, (draft) => { draft.points[index].value = finite(event.target.value, 0); })} className="rounded-lg border border-white/7 bg-black/20 px-2 py-1.5 text-[8px] text-white/40 disabled:opacity-25" /><button type="button" disabled={disabled} onClick={() => commitLane(target, parameter, (draft) => { draft.points.splice(index, 1); })} className="inline-flex items-center justify-center rounded-lg border border-white/7 text-white/20 hover:text-red-100 disabled:opacity-25">×</button></div>)}{!points.length ? <div className="text-[8px] text-white/16">No automation points.</div> : null}</div>
      {lane ? <button type="button" disabled={disabled} onClick={() => removeLane(lane.id)} className="mt-2 inline-flex items-center gap-1 text-[7px] text-white/20 hover:text-red-100 disabled:opacity-25"><Trash2 className="h-3 w-3" /> Remove lane</button> : null}
    </div>;
  }

  return <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Activity className="h-3.5 w-3.5" /> Automation</div><div className="mt-1 text-[8px] text-white/20">Sample-clock fader/pan lanes with Read, Touch, Latch and Write capture</div></div><div className="rounded-lg border border-white/7 px-2 py-1 text-[8px] text-white/24">{(session.automation_lanes || []).length} lanes</div></div>

    <div className="mt-4 rounded-xl border border-[#d6a66a]/12 bg-[#d6a66a]/[0.018] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[8px] font-medium text-white/48">Live automation capture · {track.name}</div><div className="mt-0.5 text-[7px] text-white/18">Move these controls while the Workstation playhead runs. Capture is thinned to ≥100 ms spacing and remains editable.</div></div><div className="flex gap-1">{WRITE_MODES.map((mode) => <button key={mode} type="button" disabled={disabled} onClick={() => { setWriteMode(mode); if (mode !== "LATCH") { latchFader.current = false; latchPan.current = false; } lastCaptureTime.current = -Infinity; }} className={`rounded border px-2 py-1 text-[7px] ${writeMode === mode ? mode === "READ" ? "border-white/12 text-white/55" : "border-[#d6a66a]/30 bg-[#d6a66a]/[0.06] text-[#efd29f]/70" : "border-white/7 text-white/22"}`}>{mode}</button>)}</div></div>
      <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-[7px] text-white/20"><div className="mb-1 flex justify-between"><span>Fader</span><span>{captureFader.toFixed(1)} dB</span></div><input disabled={disabled} type="range" min="-60" max="12" step="0.25" value={captureFader} onPointerDown={() => { touchFader.current = true; }} onPointerUp={() => { touchFader.current = false; if (writeMode === "TOUCH") capture([["gain_db", captureFader]], false); }} onChange={(event) => moveCapture("gain_db", event.target.value)} className="w-full accent-[#d6a66a]" /></label><label className="text-[7px] text-white/20"><div className="mb-1 flex justify-between"><span>Pan</span><span>{capturePan.toFixed(2)}</span></div><input disabled={disabled} type="range" min="-1" max="1" step="0.01" value={capturePan} onPointerDown={() => { touchPan.current = true; }} onPointerUp={() => { touchPan.current = false; if (writeMode === "TOUCH") capture([["pan", capturePan]], false); }} onChange={(event) => moveCapture("pan", event.target.value)} className="w-full accent-[#d6a66a]" /></label></div>
      <div className="mt-2 flex items-center justify-between text-[7px] text-white/18"><span>{writeMode === "READ" ? "Playback only" : writeMode === "TOUCH" ? "Writes while you move a control" : writeMode === "LATCH" ? "Continues last touched value until stopped/disarmed" : "Overwrites fader + pan along the moving playhead"}</span>{writeMode !== "READ" ? <button type="button" onClick={() => { setWriteMode("READ"); latchFader.current = false; latchPan.current = false; }} className="inline-flex items-center gap-1 rounded border border-white/7 px-2 py-1 text-white/30"><Square className="h-2.5 w-2.5" /> Stop writing</button> : <span className="inline-flex items-center gap-1"><CircleDot className="h-2.5 w-2.5" /> safe</span>}</div>
    </div>

    <div className="mt-4 space-y-3">{targets.map((target) => <div key={`${target.type}-${target.id}`} className="space-y-2"><div className="text-[8px] uppercase tracking-[0.14em] text-white/24">{target.label}</div><LaneEditor target={target} parameter="gain_db" />{target.type !== "master" ? <LaneEditor target={target} parameter="pan" /> : null}</div>)}</div>
    <div className="mt-3 text-[8px] leading-4 text-white/18">Automation is non-destructive. Muted tracks/groups remain muted even when gain automation exists. Browser preview and release rendering consume the same persisted lanes.</div>
  </div>;
}
