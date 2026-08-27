"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Gauge } from "lucide-react";

const METER_EVENT = "avantiqo:music-meter";

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

function LevelBar({ peak, clipping = false }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={`h-full transition-[width] duration-75 ${clipping ? "bg-red-300/80" : "bg-current text-emerald-100/55"}`}
        style={{ width: `${percentFromDb(peak)}%` }}
      />
    </div>
  );
}

export default function MusicLiveEngineeringMeters({ trackId = null }) {
  const [snapshot, setSnapshot] = useState({ active: false, master: null, tracks: [] });

  useEffect(() => {
    const handle = (event) => {
      const detail = event?.detail;
      if (detail?.contract !== "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V1") return;
      setSnapshot(detail);
    };
    globalThis.addEventListener?.(METER_EVENT, handle);
    return () => globalThis.removeEventListener?.(METER_EVENT, handle);
  }, []);

  const track = useMemo(
    () => snapshot.tracks?.find((entry) => entry.track_id === trackId) || null,
    [snapshot.tracks, trackId],
  );
  const master = snapshot.master || {};

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Activity className="h-3.5 w-3.5" /> Live engineering meters</div>
          <div className="mt-1 text-[8px] text-white/20">Actual post-fader signal and live dynamics reduction</div>
        </div>
        <div className={`rounded-lg border px-2 py-1 text-[8px] ${snapshot.active ? "border-emerald-300/15 text-emerald-100/50" : "border-white/7 text-white/20"}`}>{snapshot.active ? "LIVE" : "IDLE"}</div>
      </div>

      <div className="mt-4 rounded-xl border border-white/7 bg-black/20 p-3">
        <div className="flex items-center justify-between text-[9px]"><span className="font-medium text-white/48">Master</span><span className={master.clipping ? "text-red-200" : "text-white/28"}>{dbLabel(finite(master.peak_dbfs))} peak</span></div>
        <div className="mt-2"><LevelBar peak={finite(master.peak_dbfs)} clipping={master.clipping === true} /></div>
        <div className="mt-2 flex items-center justify-between text-[8px] text-white/23"><span>RMS {dbLabel(finite(master.rms_dbfs))}</span><span>{Number.isFinite(master.headroom_db) ? `${master.headroom_db.toFixed(1)} dB headroom` : "—"}</span></div>
        {master.clipping ? <div className="mt-2 text-[8px] text-red-200/70">Master clipping detected — reduce track, bus or return gain.</div> : null}
      </div>

      <div className="mt-3 rounded-xl border border-white/7 bg-black/20 p-3">
        <div className="flex items-center justify-between text-[9px]"><span className="font-medium text-white/48">{track?.track_name || "Selected track"}</span><span className={track?.clipping ? "text-red-200" : "text-white/28"}>{dbLabel(finite(track?.peak_dbfs))} peak</span></div>
        <div className="mt-2"><LevelBar peak={finite(track?.peak_dbfs)} clipping={track?.clipping === true} /></div>
        <div className="mt-2 text-[8px] text-white/23">RMS {dbLabel(finite(track?.rms_dbfs))}</div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/6 bg-white/[0.015] p-2 text-center"><div className="text-[7px] uppercase tracking-[0.12em] text-white/18">Gate</div><div className="mt-1 text-[9px] text-white/45">{reductionLabel(track?.gate_reduction_db)}</div><div className="mt-0.5 text-[7px] text-white/17">reduction</div></div>
          <div className="rounded-lg border border-white/6 bg-white/[0.015] p-2 text-center"><div className="text-[7px] uppercase tracking-[0.12em] text-white/18">De-esser</div><div className="mt-1 text-[9px] text-white/45">{reductionLabel(track?.deesser_reduction_db)}</div><div className="mt-0.5 text-[7px] text-white/17">reduction</div></div>
          <div className="rounded-lg border border-white/6 bg-white/[0.015] p-2 text-center"><div className="text-[7px] uppercase tracking-[0.12em] text-white/18">Comp</div><div className="mt-1 text-[9px] text-white/45">{reductionLabel(track?.compressor_reduction_db)}</div><div className="mt-0.5 text-[7px] text-white/17">reduction</div></div>
        </div>

        {track?.clipping ? <div className="mt-2 text-[8px] text-red-200/70">Track clipping detected after the fader/pan stage.</div> : null}
      </div>

      <div className="mt-3 flex items-start gap-2 text-[8px] leading-4 text-white/18"><Gauge className="mt-0.5 h-3 w-3 shrink-0" />These are browser-preview engineering meters, not release loudness/true-peak certification. Final mastering QC remains a separate release-stage gate.</div>
    </div>
  );
}
