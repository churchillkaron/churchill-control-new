const CONTRACT = "AVANTIQO_MUSIC_CLIP_EDIT_V1";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function cloneClip(clip = {}) {
  if (!text(clip.id) || !text(clip.source_asset_id)) {
    throw new Error("CREATIVE_MUSIC_CLIP_EDIT_SOURCE_REQUIRED");
  }
  if (clip.destructive_edit === true || clip.preserve_source_asset !== true) {
    throw new Error("CREATIVE_MUSIC_CLIP_EDIT_NON_DESTRUCTIVE_REQUIRED");
  }
  return structuredClone(clip);
}

function normalizeFades(clip) {
  const duration = Math.max(0.001, finite(clip.duration_seconds, 0.001));
  clip.fade_in_seconds = clamp(clip.fade_in_seconds, 0, duration / 2, 0);
  clip.fade_out_seconds = clamp(clip.fade_out_seconds, 0, duration / 2, 0);
  return clip;
}

export function moveMusicClip(clip, startSeconds) {
  const next = cloneClip(clip);
  next.start_seconds = Math.max(0, finite(startSeconds, next.start_seconds));
  next.preserve_source_asset = true;
  next.destructive_edit = false;
  return next;
}

export function setMusicClipGain(clip, gainDb) {
  const next = cloneClip(clip);
  next.gain_db = clamp(gainDb, -60, 24, 0);
  return next;
}

export function setMusicClipFades(clip, { fade_in_seconds, fade_out_seconds } = {}) {
  const next = cloneClip(clip);
  if (fade_in_seconds !== undefined) next.fade_in_seconds = finite(fade_in_seconds, next.fade_in_seconds);
  if (fade_out_seconds !== undefined) next.fade_out_seconds = finite(fade_out_seconds, next.fade_out_seconds);
  return normalizeFades(next);
}

export function trimMusicClipStart(clip, newStartSeconds) {
  const next = cloneClip(clip);
  const oldStart = Math.max(0, finite(next.start_seconds, 0));
  const oldDuration = Math.max(0.001, finite(next.duration_seconds, 0.001));
  const oldEnd = oldStart + oldDuration;
  const target = clamp(newStartSeconds, oldStart, oldEnd - 0.001, oldStart);
  const delta = target - oldStart;
  next.start_seconds = target;
  next.source_offset_seconds = Math.max(0, finite(next.source_offset_seconds, 0) + delta);
  next.duration_seconds = oldDuration - delta;
  return normalizeFades(next);
}

export function trimMusicClipEnd(clip, newEndSeconds) {
  const next = cloneClip(clip);
  const start = Math.max(0, finite(next.start_seconds, 0));
  const oldEnd = start + Math.max(0.001, finite(next.duration_seconds, 0.001));
  const target = clamp(newEndSeconds, start + 0.001, oldEnd, oldEnd);
  next.duration_seconds = target - start;
  return normalizeFades(next);
}

export function splitMusicClip(clip, splitSeconds) {
  const source = cloneClip(clip);
  const start = Math.max(0, finite(source.start_seconds, 0));
  const duration = Math.max(0.001, finite(source.duration_seconds, 0.001));
  const end = start + duration;
  const split = finite(splitSeconds, start + duration / 2);
  if (split <= start || split >= end) {
    throw new Error("CREATIVE_MUSIC_CLIP_SPLIT_OUTSIDE_CLIP");
  }
  const leftDuration = split - start;
  const rightDuration = end - split;
  const sourceOffset = Math.max(0, finite(source.source_offset_seconds, 0));
  const left = normalizeFades({
    ...source,
    id: `${source.id}-L-${crypto.randomUUID()}`,
    duration_seconds: leftDuration,
    fade_out_seconds: Math.min(finite(source.fade_out_seconds, 0), leftDuration / 2),
    preserve_source_asset: true,
    destructive_edit: false,
  });
  const right = normalizeFades({
    ...source,
    id: `${source.id}-R-${crypto.randomUUID()}`,
    start_seconds: split,
    duration_seconds: rightDuration,
    source_offset_seconds: sourceOffset + leftDuration,
    fade_in_seconds: Math.min(finite(source.fade_in_seconds, 0), rightDuration / 2),
    preserve_source_asset: true,
    destructive_edit: false,
  });
  return { left, right };
}

export function duplicateMusicClip(clip, startSeconds = null) {
  const source = cloneClip(clip);
  return {
    ...source,
    id: `${source.id}-copy-${crypto.randomUUID()}`,
    start_seconds: startSeconds === null
      ? Math.max(0, finite(source.start_seconds, 0) + finite(source.duration_seconds, 0))
      : Math.max(0, finite(startSeconds, 0)),
    preserve_source_asset: true,
    destructive_edit: false,
  };
}

export function replaceClipInTrack(track = {}, clipId, replacement) {
  const next = structuredClone(track);
  const index = (next.clips || []).findIndex((clip) => clip.id === clipId);
  if (index < 0) throw new Error("CREATIVE_MUSIC_CLIP_EDIT_CLIP_NOT_FOUND");
  const replacements = Array.isArray(replacement) ? replacement : [replacement];
  for (const clip of replacements) cloneClip(clip);
  next.clips.splice(index, 1, ...replacements);
  next.destructive_processing_allowed = false;
  return next;
}

export function validateMusicClipEdit(track = {}) {
  for (const clip of track.clips || []) {
    cloneClip(clip);
    if (finite(clip.duration_seconds, 0) <= 0) throw new Error("CREATIVE_MUSIC_CLIP_EDIT_DURATION_INVALID");
    if (finite(clip.source_offset_seconds, 0) < 0) throw new Error("CREATIVE_MUSIC_CLIP_EDIT_SOURCE_OFFSET_INVALID");
  }
  return {
    success: true,
    contract: CONTRACT,
    clip_count: (track.clips || []).length,
    source_assets_preserved: true,
    destructive_edit: false,
  };
}

export const CreativeMusicClipEditRuntime = {
  contract: CONTRACT,
  move: moveMusicClip,
  setGain: setMusicClipGain,
  setFades: setMusicClipFades,
  trimStart: trimMusicClipStart,
  trimEnd: trimMusicClipEnd,
  split: splitMusicClip,
  duplicate: duplicateMusicClip,
  replaceInTrack: replaceClipInTrack,
  validate: validateMusicClipEdit,
};
