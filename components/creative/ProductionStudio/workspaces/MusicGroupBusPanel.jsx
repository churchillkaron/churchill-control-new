"use client";

import { Layers3, Plus, Trash2 } from "lucide-react";
import {
  createMusicGroupBus,
  ensureMusicEngineeringBuses,
  removeMusicGroupBus,
  routeMusicTrackToBus,
  validateMusicMixerRouting,
} from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";

const PRESETS = ["Drums", "Guitars", "Backing Vocals", "Keys", "Percussion", "Strings", "Synths"];

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeId(name, existingIds) {
  const base = String(name || "group")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "group";
  let id = `bus-group-${base}`;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `bus-group-${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

export default function MusicGroupBusPanel({ session, track, disabled = false, onChange }) {
  if (!session || !track) return null;
  const normalized = ensureMusicEngineeringBuses(session);
  const groups = normalized.buses.filter((bus) => bus.type === "group");
  const currentTrack = normalized.tracks.find((entry) => entry.id === track.id) || track;

  function commit(mutator) {
    const next = ensureMusicEngineeringBuses(session);
    mutator(next);
    validateMusicMixerRouting(next);
    onChange?.(next);
  }

  function createGroup(name) {
    const label = String(name || "Group").trim().slice(0, 120) || "Group";
    commit((next) => {
      const ids = new Set(next.buses.map((bus) => bus.id));
      next.buses.push(createMusicGroupBus({ id: safeId(label, ids), name: label }));
    });
  }

  function routeSelectedTrack(busId) {
    commit((next) => {
      const index = next.tracks.findIndex((entry) => entry.id === currentTrack.id);
      if (index >= 0) next.tracks[index] = routeMusicTrackToBus(next.tracks[index], busId);
    });
  }

  function updateGroup(groupId, values) {
    commit((next) => {
      const group = next.buses.find((bus) => bus.id === groupId && bus.type === "group");
      if (!group) return;
      if (values.name !== undefined) group.name = String(values.name || "Group").slice(0, 120);
      if (values.gain_db !== undefined) group.gain_db = Math.max(-60, Math.min(12, finite(values.gain_db, 0)));
      if (values.pan !== undefined) group.pan = Math.max(-1, Math.min(1, finite(values.pan, 0)));
      if (values.mute !== undefined) group.mute = values.mute === true;
      if (values.output_bus_id !== undefined) group.output_bus_id = values.output_bus_id;
      group.destructive_processing_allowed = false;
    });
  }

  function removeGroup(groupId) {
    const next = removeMusicGroupBus(session, groupId);
    validateMusicMixerRouting(next);
    onChange?.(next);
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Layers3 className="h-3.5 w-3.5" /> Group buses</div>
          <div className="mt-1 text-[8px] text-white/20">Route tracks through shared subgroup faders before Master</div>
        </div>
        <div className="rounded-lg border border-white/7 px-2 py-1 text-[8px] text-white/24">{groups.length} groups</div>
      </div>

      <div className="mt-4 rounded-xl border border-white/7 bg-black/20 p-3">
        <div className="text-[8px] uppercase tracking-[0.14em] text-white/22">Selected track output</div>
        <select disabled={disabled} value={currentTrack.output_bus_id || "bus-master"} onChange={(event) => routeSelectedTrack(event.target.value)} className="mt-2 w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[9px] text-white/55 disabled:opacity-25">
          <option value="bus-master">Master</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => <button key={preset} type="button" disabled={disabled || groups.length >= 32} onClick={() => createGroup(preset)} className="inline-flex items-center gap-1 rounded-lg border border-white/7 bg-black/15 px-2 py-1.5 text-[8px] text-white/34 disabled:opacity-25"><Plus className="h-3 w-3" /> {preset}</button>)}
        <button type="button" disabled={disabled || groups.length >= 32} onClick={() => createGroup(`Group ${groups.length + 1}`)} className="inline-flex items-center gap-1 rounded-lg border border-[#d6a66a]/18 bg-[#d6a66a]/[0.04] px-2 py-1.5 text-[8px] text-[#efd29f]/60 disabled:opacity-25"><Plus className="h-3 w-3" /> Custom</button>
      </div>

      <div className="mt-4 space-y-2">
        {groups.map((group) => {
          const memberCount = normalized.tracks.filter((entry) => (entry.output_bus_id || "bus-master") === group.id).length;
          const downstreamGroups = groups.filter((candidate) => candidate.id !== group.id);
          return (
            <div key={group.id} className="rounded-xl border border-white/7 bg-black/15 p-3">
              <div className="flex items-center gap-2">
                <input disabled={disabled} value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-white/7 bg-black/20 px-2 py-1.5 text-[9px] text-white/52 disabled:opacity-25" />
                <span className="text-[8px] text-white/20">{memberCount} track{memberCount === 1 ? "" : "s"}</span>
                <button type="button" disabled={disabled} onClick={() => removeGroup(group.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/7 text-white/25 hover:text-red-100 disabled:opacity-25"><Trash2 className="h-3 w-3" /></button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block text-[8px] uppercase tracking-[0.12em] text-white/20">Gain<div className="mt-1 flex items-center gap-2"><input type="range" min="-60" max="12" step="0.5" disabled={disabled} value={finite(group.gain_db, 0)} onChange={(event) => updateGroup(group.id, { gain_db: Number(event.target.value) })} className="min-w-0 flex-1 accent-[#d6a66a]" /><span className="w-10 text-right text-[8px] text-white/25">{finite(group.gain_db, 0).toFixed(1)}</span></div></label>
                <label className="block text-[8px] uppercase tracking-[0.12em] text-white/20">Pan<div className="mt-1 flex items-center gap-2"><input type="range" min="-1" max="1" step="0.01" disabled={disabled} value={finite(group.pan, 0)} onChange={(event) => updateGroup(group.id, { pan: Number(event.target.value) })} className="min-w-0 flex-1 accent-[#d6a66a]" /><span className="w-10 text-right text-[8px] text-white/25">{finite(group.pan, 0).toFixed(2)}</span></div></label>
                <label className="flex items-center gap-2 text-[8px] text-white/30"><input type="checkbox" disabled={disabled} checked={group.mute === true} onChange={(event) => updateGroup(group.id, { mute: event.target.checked })} className="accent-[#d6a66a]" /> Mute group</label>
                <label className="block text-[8px] uppercase tracking-[0.12em] text-white/20">Output<select disabled={disabled} value={group.output_bus_id || "bus-master"} onChange={(event) => updateGroup(group.id, { output_bus_id: event.target.value })} className="mt-1 w-full rounded-lg border border-white/7 bg-[#0a0a0a] px-2 py-1.5 text-[8px] text-white/45 disabled:opacity-25"><option value="bus-master">Master</option>{downstreamGroups.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
              </div>
            </div>
          );
        })}
        {!groups.length ? <div className="rounded-xl border border-dashed border-white/8 px-3 py-5 text-center text-[9px] text-white/20">Create a subgroup, then route tracks into it. Example: all drum microphones → Drums → Master.</div> : null}
      </div>

      <div className="mt-3 text-[8px] leading-4 text-white/18">Group routing is non-destructive project state. Nested groups are cycle-checked before Save. Group Solo is intentionally withheld until solo-safe nested routing is implemented.</div>
    </div>
  );
}
