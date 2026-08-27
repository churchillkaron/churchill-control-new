"use client";

import { Copy, MoveHorizontal, Scissors, Volume2 } from "lucide-react";

import {
  duplicateMusicClip,
  moveMusicClip,
  replaceClipInTrack,
  setMusicClipFades,
  setMusicClipGain,
  splitMusicClip,
  trimMusicClipEnd,
  trimMusicClipStart,
  validateMusicClipEdit,
} from "@/lib/creative/music/runtime/CreativeMusicClipEditRuntime";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function Field({ label, children }) {
  return <label className="block"><div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-white/22">{label}</div>{children}</label>;
}

function snappedSeconds(value, bpm, snap) {
  const seconds = Math.max(0, finite(value, 0));
  if (String(snap || "off").toLowerCase() !== "beat") return seconds;
  const beatSeconds = 60 / Math.max(30, Math.min(300, finite(bpm, 96)));
  return Math.max(0, Math.round(seconds / beatSeconds) * beatSeconds);
}

export default function MusicClipEditorPanel({
  track,
  clipId,
  playhead = 0,
  bpm = 96,
  snap = "off",
  disabled = false,
  onChange,
  onSelectClip,
}) {
  const clip = track?.clips?.find((entry) => entry.id === clipId) || null;
  if (!track || !clip) return null;
  const start = finite(clip.start_seconds, 0);
  const duration = Math.max(0.001, finite(clip.duration_seconds, 0.001));
  const end = start + duration;
  const editPlayhead = snappedSeconds(playhead, bpm, snap);
  const playheadInside = editPlayhead > start && editPlayhead < end;
  const beatSeconds = 60 / Math.max(30, Math.min(300, finite(bpm, 96)));
  const beatSnap = String(snap || "off").toLowerCase() === "beat";

  function commit(replacement, selectId = null) {
    const next = replaceClipInTrack(track, clip.id, replacement);
    validateMusicClipEdit(next);
    onChange?.(next);
    if (selectId) onSelectClip?.(selectId);
  }

  function updateDirect(nextClip) {
    commit(nextClip, nextClip.id);
  }

  function setMuted(value) {
    updateDirect({ ...clip, muted: value, preserve_source_asset: true, destructive_edit: false });
  }

  function trimLeft() {
    if (!playheadInside) return;
    updateDirect(trimMusicClipStart(clip, editPlayhead));
  }

  function trimRight() {
    if (!playheadInside) return;
    updateDirect(trimMusicClipEnd(clip, editPlayhead));
  }

  function split() {
    if (!playheadInside) return;
    const { left, right } = splitMusicClip(clip, editPlayhead);
    commit([left, right], right.id);
  }

  function duplicate() {
    const copy = duplicateMusicClip(clip);
    const next = structuredClone(track);
    const index = next.clips.findIndex((entry) => entry.id === clip.id);
    next.clips.splice(index + 1, 0, copy);
    validateMusicClipEdit(next);
    onChange?.(next);
    onSelectClip?.(copy.id);
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Scissors className="h-3.5 w-3.5" /> Clip editor</div>
          <div className="mt-1 text-[9px] text-white/25">Non-destructive source reference</div>
        </div>
        <label className="flex items-center gap-2 text-[9px] text-white/35"><input type="checkbox" checked={clip.muted === true} disabled={disabled} onChange={(event) => setMuted(event.target.checked)} className="accent-[#d6a66a]" /> Mute</label>
      </div>

      <div className="mt-3 rounded-lg border border-white/6 bg-black/15 px-3 py-2 text-[8px] text-white/25">Grid: {beatSnap ? `Beat · ${finite(bpm, 96)} BPM · ${beatSeconds.toFixed(3)}s` : "Free seconds"}{beatSnap && Math.abs(editPlayhead - finite(playhead, 0)) > 0.0005 ? ` · playhead snaps ${finite(playhead, 0).toFixed(3)} → ${editPlayhead.toFixed(3)}s` : ""}</div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Timeline start">
          <input type="number" step={beatSnap ? beatSeconds : 0.01} min="0" disabled={disabled} value={Number(start.toFixed(3))} onChange={(event) => updateDirect(moveMusicClip(clip, snappedSeconds(event.target.value, bpm, snap)))} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[10px] text-white/55 disabled:opacity-25" />
        </Field>
        <Field label="Source offset">
          <div className="rounded-lg border border-white/6 bg-black/15 px-2 py-2 text-[10px] text-white/30">{finite(clip.source_offset_seconds, 0).toFixed(3)} s</div>
        </Field>
        <Field label="Duration">
          <div className="rounded-lg border border-white/6 bg-black/15 px-2 py-2 text-[10px] text-white/30">{duration.toFixed(3)} s</div>
        </Field>
        <Field label="End">
          <div className="rounded-lg border border-white/6 bg-black/15 px-2 py-2 text-[10px] text-white/30">{end.toFixed(3)} s</div>
        </Field>
      </div>

      <div className="mt-4 space-y-3">
        <Field label="Clip gain">
          <div className="flex items-center gap-2"><Volume2 className="h-3.5 w-3.5 text-white/25" /><input type="range" min="-60" max="24" step="0.5" disabled={disabled} value={finite(clip.gain_db, 0)} onChange={(event) => updateDirect(setMusicClipGain(clip, event.target.value))} className="w-full accent-[#d6a66a] disabled:opacity-25" /><span className="w-14 text-right text-[9px] text-white/30">{finite(clip.gain_db, 0).toFixed(1)} dB</span></div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fade in">
            <input type="number" min="0" max={duration / 2} step="0.01" disabled={disabled} value={finite(clip.fade_in_seconds, 0)} onChange={(event) => updateDirect(setMusicClipFades(clip, { fade_in_seconds: event.target.value }))} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[10px] text-white/55 disabled:opacity-25" />
          </Field>
          <Field label="Fade out">
            <input type="number" min="0" max={duration / 2} step="0.01" disabled={disabled} value={finite(clip.fade_out_seconds, 0)} onChange={(event) => updateDirect(setMusicClipFades(clip, { fade_out_seconds: event.target.value }))} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[10px] text-white/55 disabled:opacity-25" />
          </Field>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled || !playheadInside} onClick={trimLeft} className="rounded-lg border border-white/8 px-2 py-2 text-[9px] text-white/42 disabled:opacity-20">Trim left → {beatSnap ? "grid" : "playhead"}</button>
        <button type="button" disabled={disabled || !playheadInside} onClick={trimRight} className="rounded-lg border border-white/8 px-2 py-2 text-[9px] text-white/42 disabled:opacity-20">Trim right ← {beatSnap ? "grid" : "playhead"}</button>
        <button type="button" disabled={disabled || !playheadInside} onClick={split} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/8 px-2 py-2 text-[9px] text-white/42 disabled:opacity-20"><Scissors className="h-3 w-3" /> Split at {beatSnap ? "grid" : "playhead"}</button>
        <button type="button" disabled={disabled} onClick={duplicate} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/8 px-2 py-2 text-[9px] text-white/42 disabled:opacity-20"><Copy className="h-3 w-3" /> Duplicate after</button>
      </div>

      <div className="mt-3 flex items-start gap-2 text-[8px] leading-4 text-white/18"><MoveHorizontal className="mt-0.5 h-3 w-3 shrink-0" />Move changes timeline position only. Trim/split change source offsets and references; the original WAV asset is never rewritten. Beat snap quantizes edit positions only and never time-stretches the source.</div>
    </div>
  );
}
