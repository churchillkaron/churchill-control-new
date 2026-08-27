"use client";

import { AudioLines, ShieldCheck, Sparkles, Waves } from "lucide-react";

import {
  upsertMusicInsert,
  validateMusicInserts,
} from "@/lib/creative/music/runtime/CreativeMusicInsertRuntime";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function Field({ label, children }) {
  return <label className="block"><div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-white/22">{label}</div>{children}</label>;
}

function Toggle({ checked, disabled, onChange, label }) {
  return <label className="flex items-center gap-2 text-[8px] text-white/30"><input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="accent-[#d6a66a] disabled:opacity-25" />{label}</label>;
}

function insertFor(track, type) {
  return track?.inserts?.find((insert) => insert.type === type) || null;
}

export default function MusicEngineeringInsertsPanel({ track, disabled = false, onChange }) {
  if (!track) return null;
  const gate = insertFor(track, "gate");
  const deesser = insertFor(track, "deesser");
  const saturation = insertFor(track, "saturation");

  function commit(type, values = {}) {
    const current = insertFor(track, type) || {};
    const next = upsertMusicInsert(track, {
      ...current,
      type,
      enabled: values.enabled ?? current.enabled ?? true,
      bypass: values.bypass ?? current.bypass ?? false,
      parameters: {
        ...(current.parameters || {}),
        ...(values.parameters || {}),
      },
    });
    validateMusicInserts(next);
    onChange?.(next);
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><AudioLines className="h-3.5 w-3.5" /> Engineering inserts</div>
      <div className="mt-1 text-[8px] text-white/20">Audible non-destructive processing before the channel compressor</div>

      <div className="mt-4 rounded-xl border border-white/7 bg-black/15 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-medium text-white/55">Gate / Expander</div>
          <div className="flex items-center gap-3">
            <Toggle checked={gate?.enabled === true} disabled={disabled} onChange={(event) => commit("gate", { enabled: event.target.checked })} label="On" />
            <Toggle checked={gate?.bypass === true} disabled={disabled || !gate} onChange={(event) => commit("gate", { bypass: event.target.checked })} label="Bypass" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Threshold"><input type="number" min="-90" max="-5" step="1" disabled={disabled} value={finite(gate?.parameters?.threshold_db, -48)} onChange={(event) => commit("gate", { enabled: true, parameters: { threshold_db: finite(event.target.value, -48) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Range"><input type="number" min="-90" max="0" step="1" disabled={disabled} value={finite(gate?.parameters?.range_db, -60)} onChange={(event) => commit("gate", { enabled: true, parameters: { range_db: finite(event.target.value, -60) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Attack ms"><input type="number" min="0.1" max="100" step="0.1" disabled={disabled} value={finite(gate?.parameters?.attack_ms, 2)} onChange={(event) => commit("gate", { enabled: true, parameters: { attack_ms: finite(event.target.value, 2) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Hold ms"><input type="number" min="0" max="500" step="1" disabled={disabled} value={finite(gate?.parameters?.hold_ms, 35)} onChange={(event) => commit("gate", { enabled: true, parameters: { hold_ms: finite(event.target.value, 35) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Release ms"><input type="number" min="5" max="2000" step="1" disabled={disabled} value={finite(gate?.parameters?.release_ms, 140)} onChange={(event) => commit("gate", { enabled: true, parameters: { release_ms: finite(event.target.value, 140) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/7 bg-black/15 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-medium text-white/55"><Waves className="h-3.5 w-3.5" /> De-esser</div>
          <div className="flex items-center gap-3">
            <Toggle checked={deesser?.enabled === true} disabled={disabled} onChange={(event) => commit("deesser", { enabled: event.target.checked })} label="On" />
            <Toggle checked={deesser?.bypass === true} disabled={disabled || !deesser} onChange={(event) => commit("deesser", { bypass: event.target.checked })} label="Bypass" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Frequency Hz"><input type="number" min="2500" max="12000" step="100" disabled={disabled} value={finite(deesser?.parameters?.frequency_hz, 6500)} onChange={(event) => commit("deesser", { enabled: true, parameters: { frequency_hz: finite(event.target.value, 6500) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Threshold"><input type="number" min="-60" max="0" step="1" disabled={disabled} value={finite(deesser?.parameters?.threshold_db, -26)} onChange={(event) => commit("deesser", { enabled: true, parameters: { threshold_db: finite(event.target.value, -26) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Ratio"><input type="number" min="1" max="12" step="0.1" disabled={disabled} value={finite(deesser?.parameters?.ratio, 4)} onChange={(event) => commit("deesser", { enabled: true, parameters: { ratio: finite(event.target.value, 4) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Max reduction"><input type="number" min="0" max="18" step="0.5" disabled={disabled} value={finite(deesser?.parameters?.max_reduction_db, 8)} onChange={(event) => commit("deesser", { enabled: true, parameters: { max_reduction_db: finite(event.target.value, 8) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Attack ms"><input type="number" min="0.1" max="30" step="0.1" disabled={disabled} value={finite(deesser?.parameters?.attack_ms, 1.5)} onChange={(event) => commit("deesser", { enabled: true, parameters: { attack_ms: finite(event.target.value, 1.5) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Release ms"><input type="number" min="10" max="500" step="1" disabled={disabled} value={finite(deesser?.parameters?.release_ms, 85)} onChange={(event) => commit("deesser", { enabled: true, parameters: { release_ms: finite(event.target.value, 85) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/7 bg-black/15 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-medium text-white/55"><Sparkles className="h-3.5 w-3.5" /> Saturation</div>
          <div className="flex items-center gap-3">
            <Toggle checked={saturation?.enabled === true} disabled={disabled} onChange={(event) => commit("saturation", { enabled: event.target.checked })} label="On" />
            <Toggle checked={saturation?.bypass === true} disabled={disabled || !saturation} onChange={(event) => commit("saturation", { bypass: event.target.checked })} label="Bypass" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Field label="Drive dB"><input type="number" min="0" max="24" step="0.5" disabled={disabled} value={finite(saturation?.parameters?.drive_db, 3)} onChange={(event) => commit("saturation", { enabled: true, parameters: { drive_db: finite(event.target.value, 3) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Mix %"><input type="number" min="0" max="100" step="1" disabled={disabled} value={Math.round(finite(saturation?.parameters?.mix, 0.18) * 100)} onChange={(event) => commit("saturation", { enabled: true, parameters: { mix: finite(event.target.value, 18) / 100 } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Output dB"><input type="number" min="-18" max="12" step="0.5" disabled={disabled} value={finite(saturation?.parameters?.output_db, 0)} onChange={(event) => commit("saturation", { enabled: true, parameters: { output_db: finite(event.target.value, 0) } })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 text-[8px] leading-4 text-white/18"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-100/35" />Insert settings remain editable project data. Enabled processors run in the browser preview signal chain; original takes and rendered dry comps are never overwritten.</div>
    </div>
  );
}
