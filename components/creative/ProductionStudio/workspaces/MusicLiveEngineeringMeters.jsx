"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Gauge, RadioTower, ShieldAlert } from "lucide-react";

const METER_EVENT = "avantiqo:music-meter";
const CONTRACTS = new Set([
  "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V1",
  "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V2",
  "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V3",
  "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V4",
  "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V5",
  "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V6",
]);

function finite(value, fallback = -Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbLabel(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dB` : "-∞ dB";
}

function percentFromDb(value, floor = -60) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, ((value - floor) / Math.abs(floor)) * 100));
}

function reductionLabel(value) {
  return `${Math.max(0, finite(value, 0)).toFixed(1)} dB`;
}

function correlationLabel(value) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function StereoSummary({ meter, label }) {
  const available = meter?.stereo_meter_available === true;
  const correlation = finite(meter?.stereo_correlation, NaN);
  const warning = meter?.mono_compatibility_warning === true;
  const phaseRisk = meter?.phase_risk === true;
  return (
    <div className={`mt-3 rounded-xl border p-3 ${phaseRisk ? "border-red-300/15 bg-red-400/[0.025]" : warning ? "border-amber-300/15 bg-amber-300/[0.02]" : "border-white/7 bg-black/20"}`}>
      <div className="flex items-center justify-between gap-3 text-[9px]"><span className="flex items-center gap-2 font-medium text-white/45"><RadioTower className="h-3 w-3" /> {label} stereo</span><span className={phaseRisk ? "text-red-200/80" : warning ? "text-amber-100/70" : "text-white/28"}>{available ? `Corr ${correlationLabel(correlation)}` : "Unavailable"}</span></div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[8px] text-white/24"><div>L {dbLabel(finite(meter?.left_rms_dbfs))} RMS</div><div>R {dbLabel(finite(meter?.right_rms_dbfs))} RMS</div><div>Balance {Number.isFinite(meter?.balance_db) ? `${meter.balance_db.toFixed(1)} dB` : "—"}</div><div>{phaseRisk ? "PHASE RISK" : warning ? "CHECK MONO" : available ? "Mono compatible" : "—"}</div></div>
      {phaseRisk ? <div className="mt-2 text-[8px] leading-4 text-red-200/70">Negative correlation detected. Check polarity, stereo widening, doubled sources and time offsets before mastering.</div> : warning ? <div className="mt-2 text-[8px] leading-4 text-amber-100/60">Low correlation may lose level or elements when summed to mono.</div> : null}
    </div>
  );
}

function SourceDiagnostics({ track }) {
  const available = track?.source_diagnostics_available === true;
  const floorWindows = Number(track?.floor_history_windows || 0);
  const floorReady = available && floorWindows >= 4 && Number.isFinite(track?.background_floor_estimate_dbfs);
  const humWarning = track?.hum_warning === true;
  const dcWarning = track?.dc_offset_warning === true;
  const cleanupActive = track?.source_cleanup_active === true;
  const warning = humWarning || dcWarning;
  return (
    <div className={`mt-3 rounded-xl border p-3 ${warning ? "border-amber-300/15 bg-amber-300/[0.02]" : "border-white/7 bg-black/20"}`}>
      <div className="flex items-center justify-between gap-3 text-[9px]"><span className="flex items-center gap-2 font-medium text-white/45"><ShieldAlert className="h-3 w-3" /> Source diagnostics</span><span className={warning ? "text-amber-100/70" : "text-white/28"}>{available ? cleanupActive ? "PRE-CLEANUP · CLEANUP ON" : "PRE-CLEANUP" : "Unavailable"}</span></div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[8px] text-white/24">
        <div>Floor {floorReady ? `${track.background_floor_estimate_dbfs.toFixed(1)} dBFS` : available ? "Learning…" : "—"}</div>
        <div>History {available ? `${floorWindows} windows` : "—"}</div>
        <div>50 Hz {Number.isFinite(track?.hum_50_relative_db) ? `${track.hum_50_relative_db.toFixed(1)} dB rel` : "—"}</div>
        <div>60 Hz {Number.isFinite(track?.hum_60_relative_db) ? `${track.hum_60_relative_db.toFixed(1)} dB rel` : "—"}</div>
        <div>DC {Number.isFinite(track?.dc_offset) ? track.dc_offset.toFixed(4) : "—"}</div>
        <div>{track?.dc_blocker_enabled ? "DC blocker ON" : track?.hum_notch_enabled ? "Hum notch ON" : humWarning ? `${track.dominant_hum_hz || "?"} Hz HUM` : dcWarning ? "DC OFFSET" : available ? "Source clean" : "—"}</div>
      </div>
      {track?.output_bus_id && track.output_bus_id !== "bus-master" ? <div className="mt-2 text-[7px] text-white/18">Output → {track.output_bus_id}</div> : null}
      {humWarning ? <div className="mt-2 text-[8px] leading-4 text-amber-100/65">Mains hum is elevated before cleanup. Check power, cables, grounding, DI/interface gain and nearby electrical equipment before relying on notches.</div> : null}
      {dcWarning ? <div className="mt-2 text-[8px] leading-4 text-amber-100/65">DC offset is elevated before cleanup. Correct the recording/interface path when possible; the project DC blocker remains reversible.</div> : null}
      <div className="mt-2 text-[7px] leading-3 text-white/15">Background floor is an estimate from the quietest recent source windows. Diagnostics intentionally remain before cleanup so correction never hides the evidence.</div>
    </div>
  );
}

function LevelBar({ peak, clipping = false }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full transition-[width] duration-75 ${clipping ? "bg-red-300/80" : "bg-current text-emerald-100/55"}`} style={{ width: `${percentFromDb(peak)}%` }} /></div>;
}

export default function MusicLiveEngineeringMeters({ trackId = null }) {
  const [snapshot, setSnapshot] = useState({ active: false, master: null, tracks: [] });

  useEffect(() => {
    const handle = (event) => {
      const detail = event?.detail;
      if (!CONTRACTS.has(detail?.contract)) return;
      setSnapshot(detail);
    };
    globalThis.addEventListener?.(METER_EVENT, handle);
    return () => globalThis.removeEventListener?.(METER_EVENT, handle);
  }, []);

  const track = useMemo(() => snapshot.tracks?.find((entry) => entry.track_id === trackId) || null, [snapshot.tracks, trackId]);
  const master = snapshot.master || {};

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-center justify-between gap-3">
        <div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Activity className="h-3.5 w-3.5" /> Live engineering meters</div><div className="mt-1 text-[8px] text-white/20">Post-fader level, dynamics, subgroup routing, stereo/phase and raw pre-cleanup source health</div></div>
        <div className={`rounded-lg border px-2 py-1 text-[8px] ${snapshot.active ? "border-emerald-300/15 text-emerald-100/50" : "border-white/7 text-white/20"}`}>{snapshot.active ? "LIVE" : "IDLE"}</div>
      </div>
      <div className="mt-4 rounded-xl border border-white/7 bg-black/20 p-3">
        <div className="flex items-center justify-between text-[9px]"><span className="font-medium text-white/48">Master</span><span className={master.clipping ? "text-red-200" : "text-white/28"}>{dbLabel(finite(master.peak_dbfs))} peak</span></div>
        <div className="mt-2"><LevelBar peak={finite(master.peak_dbfs)} clipping={master.clipping === true} /></div>
        <div className="mt-2 flex items-center justify-between text-[8px] text-white/23"><span>RMS {dbLabel(finite(master.rms_dbfs))}</span><span>{Number.isFinite(master.headroom_db) ? `${master.headroom_db.toFixed(1)} dB headroom` : "—"}</span></div>
        {master.clipping ? <div className="mt-2 text-[8px] text-red-200/70">Master clipping detected — reduce track, group, bus or return gain.</div> : null}
      </div>
      <StereoSummary meter={master} label="Master" />
      <div className="mt-3 rounded-xl border border-white/7 bg-black/20 p-3">
        <div className="flex items-center justify-between text-[9px]"><span className="font-medium text-white/48">{track?.track_name || "Selected track"}</span><span className={track?.clipping ? "text-red-200" : "text-white/28"}>{dbLabel(finite(track?.peak_dbfs))} peak</span></div>
        <div className="mt-2"><LevelBar peak={finite(track?.peak_dbfs)} clipping={track?.clipping === true} /></div>
        <div className="mt-2 text-[8px] text-white/23">RMS {dbLabel(finite(track?.rms_dbfs))}</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/6 bg-white/[0.015] p-2 text-center"><div className="text-[7px] uppercase tracking-[0.12em] text-white/18">Gate</div><div className="mt-1 text-[9px] text-white/45">{reductionLabel(track?.gate_reduction_db)}</div></div>
          <div className="rounded-lg border border-white/6 bg-white/[0.015] p-2 text-center"><div className="text-[7px] uppercase tracking-[0.12em] text-white/18">De-esser</div><div className="mt-1 text-[9px] text-white/45">{reductionLabel(track?.deesser_reduction_db)}</div></div>
          <div className="rounded-lg border border-white/6 bg-white/[0.015] p-2 text-center"><div className="text-[7px] uppercase tracking-[0.12em] text-white/18">Comp</div><div className="mt-1 text-[9px] text-white/45">{reductionLabel(track?.compressor_reduction_db)}</div></div>
        </div>
        {track?.clipping ? <div className="mt-2 text-[8px] text-red-200/70">Track clipping detected after the fader/pan stage.</div> : null}
      </div>
      <SourceDiagnostics track={track || {}} />
      <StereoSummary meter={track || {}} label="Track" />
      <div className="mt-3 flex items-start gap-2 text-[8px] leading-4 text-white/18"><Gauge className="mt-0.5 h-3 w-3 shrink-0" />Browser-preview meters are engineering guidance, not release loudness/true-peak certification. Final mastering QC remains a separate release-stage gate.</div>
    </div>
  );
}
