"use client";

import { Gauge, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  applyMusicMasterProcessing,
  normalizeMusicMasterProcessing,
  validateMusicMasterProcessing,
} from "@/lib/creative/music/runtime/CreativeMusicMasterBusRuntime";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function NumberField({ label, value, min, max, step = 1, disabled, onChange }) {
  return <label className="block text-[8px] uppercase tracking-[0.12em] text-white/20">{label}<input type="number" min={min} max={max} step={step} disabled={disabled} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></label>;
}

export default function MusicMasterBusPanel({ session, disabled = false, onChange }) {
  if (!session) return null;
  const master = (session.buses || []).find((bus) => bus.id === "bus-master");
  if (!master) return null;
  const processing = normalizeMusicMasterProcessing(master.processing || {});

  function commit(mutator) {
    const draft = structuredClone(processing);
    mutator(draft);
    const next = applyMusicMasterProcessing(session, draft);
    validateMusicMasterProcessing(next);
    onChange?.(next);
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><SlidersHorizontal className="h-3.5 w-3.5" /> Master bus</div><div className="mt-1 text-[8px] text-white/20">Non-destructive mix-bus tone and glue before release mastering</div></div>
        <div className="rounded-lg border border-emerald-300/12 px-2 py-1 text-[8px] text-emerald-100/45">6 dB target</div>
      </div>

      <div className="mt-4 rounded-xl border border-white/7 bg-black/15 p-3">
        <div className="text-[9px] font-medium text-white/42">Master EQ</div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="High-pass Hz" min={20} max={120} value={processing.eq.high_pass_hz} disabled={disabled} onChange={(value) => commit((draft) => { draft.eq.high_pass_hz = value; })} />
          <NumberField label="Low shelf dB" min={-6} max={6} step={0.25} value={processing.eq.low_shelf_db} disabled={disabled} onChange={(value) => commit((draft) => { draft.eq.low_shelf_db = value; })} />
          <NumberField label="Presence dB" min={-6} max={6} step={0.25} value={processing.eq.presence_db} disabled={disabled} onChange={(value) => commit((draft) => { draft.eq.presence_db = value; })} />
          <NumberField label="High shelf dB" min={-6} max={6} step={0.25} value={processing.eq.high_shelf_db} disabled={disabled} onChange={(value) => commit((draft) => { draft.eq.high_shelf_db = value; })} />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/7 bg-black/15 p-3">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[9px] font-medium text-white/42"><Gauge className="h-3.5 w-3.5" /> Glue compressor</div><label className="flex items-center gap-2 text-[8px] text-white/30"><input type="checkbox" disabled={disabled} checked={processing.compressor.enabled} onChange={(event) => commit((draft) => { draft.compressor.enabled = event.target.checked; })} className="accent-[#d6a66a]" /> On</label></div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="Threshold dB" min={-40} max={0} step={0.5} value={processing.compressor.threshold_db} disabled={disabled} onChange={(value) => commit((draft) => { draft.compressor.enabled = true; draft.compressor.threshold_db = value; })} />
          <NumberField label="Ratio" min={1} max={8} step={0.1} value={processing.compressor.ratio} disabled={disabled} onChange={(value) => commit((draft) => { draft.compressor.enabled = true; draft.compressor.ratio = value; })} />
          <NumberField label="Attack ms" min={1} max={200} step={1} value={processing.compressor.attack_ms} disabled={disabled} onChange={(value) => commit((draft) => { draft.compressor.enabled = true; draft.compressor.attack_ms = value; })} />
          <NumberField label="Release ms" min={20} max={2000} step={5} value={processing.compressor.release_ms} disabled={disabled} onChange={(value) => commit((draft) => { draft.compressor.enabled = true; draft.compressor.release_ms = value; })} />
          <NumberField label="Makeup dB" min={-6} max={6} step={0.25} value={processing.compressor.makeup_db} disabled={disabled} onChange={(value) => commit((draft) => { draft.compressor.enabled = true; draft.compressor.makeup_db = value; })} />
          <NumberField label="Headroom target" min={3} max={12} step={0.5} value={processing.headroom_target_db} disabled={disabled} onChange={(value) => commit((draft) => { draft.headroom_target_db = value; })} />
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.02] p-3 text-[8px] leading-4 text-emerald-100/40"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" /><span>Workstation Master intentionally has no limiter. True-peak limiting, LUFS targeting and release QC remain a separate render-stage process.</span></div>
    </div>
  );
}
