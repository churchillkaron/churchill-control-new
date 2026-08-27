"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ShieldCheck, Sparkles, Waves } from "lucide-react";

import {
  applyMusicSourceCleanup,
  normalizeMusicSourceCleanup,
  recommendMusicSourceCleanup,
  validateMusicSourceCleanup,
} from "@/lib/creative/music/runtime/CreativeMusicSourceCleanupRuntime";

const METER_EVENT = "avantiqo:music-meter";
const CONTRACTS = new Set([
  "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V3",
  "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V4",
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export default function MusicSourceCleanupPanel({ track, disabled = false, onChange }) {
  const [liveDiagnostics, setLiveDiagnostics] = useState(null);
  const cleanup = useMemo(() => normalizeMusicSourceCleanup(track?.source_cleanup || {}), [track?.source_cleanup]);
  const recommendation = useMemo(
    () => recommendMusicSourceCleanup(liveDiagnostics || {}),
    [liveDiagnostics],
  );

  useEffect(() => {
    const handle = (event) => {
      const detail = event?.detail;
      if (!CONTRACTS.has(detail?.contract)) return;
      const next = detail.tracks?.find((entry) => entry.track_id === track?.id) || null;
      if (next) setLiveDiagnostics(next);
    };
    globalThis.addEventListener?.(METER_EVENT, handle);
    return () => globalThis.removeEventListener?.(METER_EVENT, handle);
  }, [track?.id]);

  if (!track) return null;

  function commit(nextCleanup) {
    const next = applyMusicSourceCleanup(track, nextCleanup);
    validateMusicSourceCleanup(next);
    onChange?.(next);
  }

  function updateDc(values = {}) {
    commit({
      ...cleanup,
      enabled: true,
      dc_blocker: { ...cleanup.dc_blocker, ...values },
    });
  }

  function updateHum(values = {}) {
    commit({
      ...cleanup,
      enabled: true,
      hum_notch: { ...cleanup.hum_notch, ...values },
    });
  }

  function applyRecommendation(item) {
    if (item.type === "dc_blocker") updateDc(item.suggested);
    if (item.type === "hum_notch") updateHum(item.suggested);
  }

  const floorReady = recommendation.floor_estimate_ready === true;
  const floor = finite(liveDiagnostics?.background_floor_estimate_dbfs, -Infinity);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><ShieldCheck className="h-3.5 w-3.5" /> Source cleanup</div>
          <div className="mt-1 text-[8px] text-white/20">Reversible correction after diagnostics, before trim and creative processing</div>
        </div>
        <div className={`rounded-lg border px-2 py-1 text-[8px] ${cleanup.dc_blocker.enabled || cleanup.hum_notch.enabled ? "border-emerald-300/15 text-emerald-100/50" : "border-white/7 text-white/20"}`}>{cleanup.dc_blocker.enabled || cleanup.hum_notch.enabled ? "ACTIVE" : "BYPASSED"}</div>
      </div>

      <div className="mt-4 rounded-xl border border-white/7 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-medium text-white/52"><Activity className="h-3.5 w-3.5" /> Evidence</div>
          <span className="text-[8px] text-white/24">{liveDiagnostics?.source_diagnostics_available ? "LIVE PRE-INSERT" : "Play audio to analyze"}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[8px] text-white/24">
          <div>Floor {floorReady && Number.isFinite(floor) ? `${floor.toFixed(1)} dBFS est.` : "Learning…"}</div>
          <div>DC {Number.isFinite(liveDiagnostics?.dc_offset) ? liveDiagnostics.dc_offset.toFixed(4) : "—"}</div>
          <div>50 Hz {Number.isFinite(liveDiagnostics?.hum_50_relative_db) ? `${liveDiagnostics.hum_50_relative_db.toFixed(1)} dB rel` : "—"}</div>
          <div>60 Hz {Number.isFinite(liveDiagnostics?.hum_60_relative_db) ? `${liveDiagnostics.hum_60_relative_db.toFixed(1)} dB rel` : "—"}</div>
        </div>
      </div>

      {recommendation.recommendations.length ? (
        <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.02] p-3">
          <div className="flex items-center gap-2 text-[9px] font-medium text-amber-100/65"><Sparkles className="h-3.5 w-3.5" /> Suggested cleanup</div>
          <div className="mt-2 space-y-2">
            {recommendation.recommendations.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/7 bg-black/15 p-2">
                <div className="min-w-0"><div className="text-[8px] font-medium text-white/45">{item.type === "dc_blocker" ? "Remove DC offset" : `Notch ${item.suggested.frequency_hz} Hz hum`}</div><div className="mt-0.5 text-[7px] text-white/18">{item.severity} · evidence-based · manual apply only</div></div>
                <button type="button" disabled={disabled} onClick={() => applyRecommendation(item)} className="rounded-lg border border-[#d6a66a]/20 bg-[#d6a66a]/[0.05] px-2 py-1.5 text-[8px] text-[#efd29f]/70 disabled:opacity-25">Apply</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-white/7 bg-black/15 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-medium text-white/52">DC blocker</div>
          <label className="flex items-center gap-2 text-[8px] text-white/30"><input type="checkbox" disabled={disabled} checked={cleanup.dc_blocker.enabled} onChange={(event) => updateDc({ enabled: event.target.checked })} className="accent-[#d6a66a]" /> On</label>
        </div>
        <label className="mt-3 block text-[8px] uppercase tracking-[0.12em] text-white/20">Cutoff Hz<input type="number" min="5" max="35" step="1" disabled={disabled} value={cleanup.dc_blocker.cutoff_hz} onChange={(event) => updateDc({ enabled: true, cutoff_hz: finite(event.target.value, 15) })} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></label>
      </div>

      <div className="mt-3 rounded-xl border border-white/7 bg-black/15 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-medium text-white/52"><Waves className="h-3.5 w-3.5" /> Mains hum notch</div>
          <label className="flex items-center gap-2 text-[8px] text-white/30"><input type="checkbox" disabled={disabled} checked={cleanup.hum_notch.enabled} onChange={(event) => updateHum({ enabled: event.target.checked })} className="accent-[#d6a66a]" /> On</label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="block text-[8px] uppercase tracking-[0.12em] text-white/20">Mains<select disabled={disabled} value={cleanup.hum_notch.frequency_hz} onChange={(event) => updateHum({ enabled: true, frequency_hz: Number(event.target.value) })} className="mt-1.5 w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[9px] text-white/50 disabled:opacity-25"><option value={50}>50 Hz</option><option value={60}>60 Hz</option></select></label>
          <label className="block text-[8px] uppercase tracking-[0.12em] text-white/20">Q<input type="number" min="4" max="40" step="1" disabled={disabled} value={cleanup.hum_notch.q} onChange={(event) => updateHum({ enabled: true, q: finite(event.target.value, 18) })} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></label>
          <label className="block text-[8px] uppercase tracking-[0.12em] text-white/20">Harmonics<input type="number" min="1" max="4" step="1" disabled={disabled} value={cleanup.hum_notch.harmonics} onChange={(event) => updateHum({ enabled: true, harmonics: Math.round(finite(event.target.value, 3)) })} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></label>
        </div>
      </div>

      <div className="mt-3 text-[8px] leading-4 text-white/18">Avantiqo never auto-enables cleanup. Compare with bypass by toggling each stage while the same passage loops. Corrections remain project settings; originals are never overwritten.</div>
    </div>
  );
}
