"use client";

import { SlidersHorizontal } from "lucide-react";

import {
  ensureMusicParametricEq,
  updateMusicEqBand,
  validateMusicParametricEq,
} from "@/lib/creative/music/runtime/CreativeMusicParametricEqRuntime";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function Field({ label, children }) {
  return <label className="block"><div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-white/22">{label}</div>{children}</label>;
}

export default function MusicParametricEqPanel({ track, disabled = false, onChange }) {
  if (!track) return null;
  const normalized = ensureMusicParametricEq(track);
  const bands = normalized.channel_strip.eq_bands || [];

  function changeBand(bandId, values) {
    const next = updateMusicEqBand(normalized, bandId, values);
    validateMusicParametricEq(next);
    onChange?.(next);
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><SlidersHorizontal className="h-3.5 w-3.5" /> Parametric EQ</div>
      <div className="mt-1 text-[8px] text-white/20">Four precision bands after the fast tone controls and before de-essing</div>

      <div className="mt-4 space-y-2">
        {bands.map((band, index) => (
          <div key={band.id} className="rounded-xl border border-white/7 bg-black/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[9px] font-medium text-white/45">Band {index + 1}</div>
              <label className="flex items-center gap-2 text-[8px] text-white/28"><input type="checkbox" disabled={disabled} checked={band.enabled !== false} onChange={(event) => changeBand(band.id, { enabled: event.target.checked })} className="accent-[#d6a66a] disabled:opacity-25" /> On</label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Type">
                <select disabled={disabled} value={band.type} onChange={(event) => changeBand(band.id, { type: event.target.value })} className="w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[9px] text-white/50 disabled:opacity-25">
                  <option value="bell">Bell</option><option value="lowshelf">Low shelf</option><option value="highshelf">High shelf</option><option value="notch">Notch</option><option value="highpass">High-pass</option><option value="lowpass">Low-pass</option>
                </select>
              </Field>
              <Field label="Frequency Hz"><input type="number" min="20" max="20000" step="1" disabled={disabled} value={Math.round(finite(band.frequency_hz, 1000))} onChange={(event) => changeBand(band.id, { frequency_hz: finite(event.target.value, 1000) })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
              <Field label="Gain dB"><input type="number" min="-18" max="18" step="0.5" disabled={disabled || ["notch", "highpass", "lowpass"].includes(band.type)} value={finite(band.gain_db, 0)} onChange={(event) => changeBand(band.id, { gain_db: finite(event.target.value, 0) })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
              <Field label="Q"><input type="number" min="0.1" max="18" step="0.1" disabled={disabled} value={finite(band.q, 1)} onChange={(event) => changeBand(band.id, { q: finite(event.target.value, 1) })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[8px] leading-4 text-white/18">EQ changes remain non-destructive project settings. Narrow boosts/cuts and notches are available without altering any recorded or rendered source file.</div>
    </div>
  );
}
