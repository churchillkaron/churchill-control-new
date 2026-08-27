"use client";

import { Clock3, Gauge, RadioTower, Waves } from "lucide-react";

import {
  ensureMusicEngineeringBuses,
  upsertMusicTrackSend,
  validateMusicMixerRouting,
} from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import MusicEngineeringInsertsPanel from "./MusicEngineeringInsertsPanel";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function Field({ label, children }) {
  return <label className="block"><div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-white/22">{label}</div>{children}</label>;
}

const DELAY_DIVISIONS = [
  ["1/4", 1],
  ["1/8D", 0.75],
  ["1/8", 0.5],
  ["1/16D", 0.375],
  ["1/16", 0.25],
];

export default function MusicMixerSendsPanel({ session, track, disabled = false, onChange }) {
  if (!session || !track) return null;
  const normalized = ensureMusicEngineeringBuses(session);
  const currentTrack = normalized.tracks.find((entry) => entry.id === track.id) || track;
  const reverbBus = normalized.buses.find((bus) => bus.id === "bus-reverb");
  const delayBus = normalized.buses.find((bus) => bus.id === "bus-delay");
  const reverbSend = currentTrack.sends?.find((send) => send.bus_id === "bus-reverb") || null;
  const delaySend = currentTrack.sends?.find((send) => send.bus_id === "bus-delay") || null;
  const compressor = currentTrack.channel_strip?.compressor || {};
  const bpm = Math.max(30, Math.min(300, finite(session.bpm, 96)));

  function commit(mutator) {
    const next = ensureMusicEngineeringBuses(session);
    mutator(next);
    validateMusicMixerRouting(next);
    onChange?.(next);
  }

  function replaceTrack(nextTrack) {
    commit((next) => {
      const index = next.tracks.findIndex((entry) => entry.id === nextTrack.id);
      if (index >= 0) next.tracks[index] = nextTrack;
    });
  }

  function updateSend(busId, values) {
    commit((next) => {
      const index = next.tracks.findIndex((entry) => entry.id === currentTrack.id);
      if (index < 0) return;
      next.tracks[index] = upsertMusicTrackSend(next.tracks[index], {
        bus_id: busId,
        level_db: values.level_db ?? next.tracks[index].sends?.find((send) => send.bus_id === busId)?.level_db ?? -18,
        enabled: values.enabled ?? next.tracks[index].sends?.find((send) => send.bus_id === busId)?.enabled ?? true,
        pre_fader: values.pre_fader ?? next.tracks[index].sends?.find((send) => send.bus_id === busId)?.pre_fader ?? false,
      });
    });
  }

  function updateBus(busId, mutator) {
    commit((next) => {
      const bus = next.buses.find((entry) => entry.id === busId);
      if (bus) mutator(bus);
    });
  }

  function updateCompressor(values = {}) {
    commit((next) => {
      const target = next.tracks.find((entry) => entry.id === currentTrack.id);
      if (!target) return;
      target.channel_strip = target.channel_strip || {};
      target.channel_strip.compressor = {
        enabled: values.enabled ?? target.channel_strip.compressor?.enabled ?? false,
        threshold_db: clamp(values.threshold_db ?? target.channel_strip.compressor?.threshold_db, -60, 0, -18),
        ratio: clamp(values.ratio ?? target.channel_strip.compressor?.ratio, 1, 20, 3),
        attack_ms: clamp(values.attack_ms ?? target.channel_strip.compressor?.attack_ms, 0.1, 200, 15),
        release_ms: clamp(values.release_ms ?? target.channel_strip.compressor?.release_ms, 10, 2000, 150),
        knee_db: clamp(values.knee_db ?? target.channel_strip.compressor?.knee_db, 0, 40, 6),
        makeup_db: clamp(values.makeup_db ?? target.channel_strip.compressor?.makeup_db, -12, 18, 0),
      };
      target.destructive_processing_allowed = false;
    });
  }

  function setDelayDivision(label, multiplier) {
    const seconds = Math.max(0.01, Math.min(2, (60 / bpm) * multiplier));
    updateBus("bus-delay", (bus) => {
      bus.parameters.time_seconds = seconds;
      bus.parameters.tempo_sync_division = label;
    });
  }

  return (
    <div className="space-y-4">
      <MusicEngineeringInsertsPanel
        track={currentTrack}
        disabled={disabled}
        onChange={replaceTrack}
      />

      <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Gauge className="h-3.5 w-3.5" /> Channel compressor</div>
            <div className="mt-1 text-[8px] text-white/20">Post-inserts dynamics before fader, pan and aux sends</div>
          </div>
          <label className="flex items-center gap-2 text-[8px] text-white/30"><input type="checkbox" disabled={disabled} checked={compressor.enabled === true} onChange={(event) => updateCompressor({ enabled: event.target.checked })} className="accent-[#d6a66a] disabled:opacity-25" /> On</label>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Threshold dB"><input type="number" min="-60" max="0" step="0.5" disabled={disabled} value={finite(compressor.threshold_db, -18)} onChange={(event) => updateCompressor({ threshold_db: event.target.value, enabled: true })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Ratio"><input type="number" min="1" max="20" step="0.1" disabled={disabled} value={finite(compressor.ratio, 3)} onChange={(event) => updateCompressor({ ratio: event.target.value, enabled: true })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Attack ms"><input type="number" min="0.1" max="200" step="0.1" disabled={disabled} value={finite(compressor.attack_ms, 15)} onChange={(event) => updateCompressor({ attack_ms: event.target.value, enabled: true })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Release ms"><input type="number" min="10" max="2000" step="1" disabled={disabled} value={finite(compressor.release_ms, 150)} onChange={(event) => updateCompressor({ release_ms: event.target.value, enabled: true })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Knee dB"><input type="number" min="0" max="40" step="0.5" disabled={disabled} value={finite(compressor.knee_db, 6)} onChange={(event) => updateCompressor({ knee_db: event.target.value, enabled: true })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          <Field label="Makeup dB"><input type="number" min="-12" max="18" step="0.5" disabled={disabled} value={finite(compressor.makeup_db, 0)} onChange={(event) => updateCompressor({ makeup_db: event.target.value, enabled: true })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
        </div>
      </div>

      <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
        <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><RadioTower className="h-3.5 w-3.5" /> Aux sends</div>
        <div className="mt-1 text-[8px] text-white/20">Real post/pre-fader routing into audible shared effects buses</div>

        <div className="mt-4 rounded-xl border border-white/7 bg-black/15 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] font-medium text-white/55"><Waves className="h-3.5 w-3.5" /> Studio Reverb</div>
            <label className="flex items-center gap-2 text-[8px] text-white/30"><input type="checkbox" disabled={disabled} checked={reverbSend?.enabled === true} onChange={(event) => updateSend("bus-reverb", { enabled: event.target.checked })} className="accent-[#d6a66a]" /> Send</label>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Send level"><input type="range" min="-60" max="6" step="0.5" disabled={disabled} value={finite(reverbSend?.level_db, -18)} onChange={(event) => updateSend("bus-reverb", { level_db: Number(event.target.value), enabled: true })} className="w-full accent-[#d6a66a] disabled:opacity-25" /><div className="text-right text-[8px] text-white/25">{finite(reverbSend?.level_db, -18).toFixed(1)} dB</div></Field>
            <label className="flex items-center gap-2 self-center text-[9px] text-white/32"><input type="checkbox" disabled={disabled} checked={reverbSend?.pre_fader === true} onChange={(event) => updateSend("bus-reverb", { pre_fader: event.target.checked, enabled: true })} className="accent-[#d6a66a]" /> Pre-fader</label>
            <Field label="Pre-delay"><input type="number" min="0" max="250" step="1" disabled={disabled} value={finite(reverbBus?.parameters?.pre_delay_ms, 18)} onChange={(event) => updateBus("bus-reverb", (bus) => { bus.parameters.pre_delay_ms = Math.max(0, Math.min(250, finite(event.target.value, 18))); })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
            <Field label="Decay"><input type="number" min="0.1" max="12" step="0.1" disabled={disabled} value={finite(reverbBus?.parameters?.decay_seconds, 2.2)} onChange={(event) => updateBus("bus-reverb", (bus) => { bus.parameters.decay_seconds = Math.max(0.1, Math.min(12, finite(event.target.value, 2.2))); })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
            <Field label="Damping"><input type="number" min="1000" max="20000" step="100" disabled={disabled} value={finite(reverbBus?.parameters?.damping_hz, 8500)} onChange={(event) => updateBus("bus-reverb", (bus) => { bus.parameters.damping_hz = Math.max(1000, Math.min(20000, finite(event.target.value, 8500))); })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
            <Field label="Return"><input type="range" min="-60" max="6" step="0.5" disabled={disabled} value={finite(reverbBus?.parameters?.wet_db, -3)} onChange={(event) => updateBus("bus-reverb", (bus) => { bus.parameters.wet_db = Number(event.target.value); })} className="w-full accent-[#d6a66a] disabled:opacity-25" /></Field>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/7 bg-black/15 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] font-medium text-white/55"><Clock3 className="h-3.5 w-3.5" /> Tempo Delay</div>
            <label className="flex items-center gap-2 text-[8px] text-white/30"><input type="checkbox" disabled={disabled} checked={delaySend?.enabled === true} onChange={(event) => updateSend("bus-delay", { enabled: event.target.checked })} className="accent-[#d6a66a]" /> Send</label>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Send level"><input type="range" min="-60" max="6" step="0.5" disabled={disabled} value={finite(delaySend?.level_db, -18)} onChange={(event) => updateSend("bus-delay", { level_db: Number(event.target.value), enabled: true })} className="w-full accent-[#d6a66a] disabled:opacity-25" /><div className="text-right text-[8px] text-white/25">{finite(delaySend?.level_db, -18).toFixed(1)} dB</div></Field>
            <label className="flex items-center gap-2 self-center text-[9px] text-white/32"><input type="checkbox" disabled={disabled} checked={delaySend?.pre_fader === true} onChange={(event) => updateSend("bus-delay", { pre_fader: event.target.checked, enabled: true })} className="accent-[#d6a66a]" /> Pre-fader</label>
            <Field label="Tempo division"><select disabled={disabled} value={delayBus?.parameters?.tempo_sync_division || "1/8D"} onChange={(event) => { const item = DELAY_DIVISIONS.find(([label]) => label === event.target.value) || DELAY_DIVISIONS[1]; setDelayDivision(item[0], item[1]); }} className="w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[9px] text-white/50 disabled:opacity-25">{DELAY_DIVISIONS.map(([label]) => <option key={label}>{label}</option>)}</select></Field>
            <Field label="Delay time"><div className="rounded-lg border border-white/6 bg-black/15 px-2 py-2 text-[9px] text-white/28">{finite(delayBus?.parameters?.time_seconds, 0.375).toFixed(3)} s</div></Field>
            <Field label="Feedback"><input type="range" min="0" max="0.92" step="0.01" disabled={disabled} value={finite(delayBus?.parameters?.feedback, 0.28)} onChange={(event) => updateBus("bus-delay", (bus) => { bus.parameters.feedback = Number(event.target.value); })} className="w-full accent-[#d6a66a] disabled:opacity-25" /></Field>
            <Field label="High cut"><input type="number" min="1000" max="20000" step="100" disabled={disabled} value={finite(delayBus?.parameters?.high_cut_hz, 7000)} onChange={(event) => updateBus("bus-delay", (bus) => { bus.parameters.high_cut_hz = Math.max(1000, Math.min(20000, finite(event.target.value, 7000))); })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
            <Field label="Low cut"><input type="number" min="20" max="1000" step="10" disabled={disabled} value={finite(delayBus?.parameters?.low_cut_hz, 180)} onChange={(event) => updateBus("bus-delay", (bus) => { bus.parameters.low_cut_hz = Math.max(20, Math.min(1000, finite(event.target.value, 180))); })} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/50 disabled:opacity-25" /></Field>
          </div>
        </div>

        <div className="mt-3 text-[8px] leading-4 text-white/18">Shared aux returns preserve mix cohesion and CPU. Inserts, compressor and sends remain editable project data; nothing is printed into the original take or dry comp asset.</div>
      </div>
    </div>
  );
}
