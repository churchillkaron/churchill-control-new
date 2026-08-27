const CONTRACT = "AVANTIQO_MUSIC_TAKE_LANE_COMPING_V1";

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

function requiredId(value, code) {
  const id = text(value);
  if (!id) throw new Error(code);
  return id;
}

export function createMusicTakeLane(input = {}) {
  return {
    contract: CONTRACT,
    id: text(input.id) || `take-lane-${crypto.randomUUID()}`,
    track_id: requiredId(input.track_id, "CREATIVE_MUSIC_TAKE_LANE_TRACK_REQUIRED"),
    name: text(input.name || "Take lane").slice(0, 120),
    take_ids: Array.isArray(input.take_ids) ? [...new Set(input.take_ids.map(text).filter(Boolean))] : [],
    active: input.active !== false,
    collapsed: input.collapsed === true,
    preserve_all_source_takes: true,
  };
}

export function createMusicCompRegion(input = {}) {
  const start = Math.max(0, finite(input.start_seconds, 0));
  const end = Math.max(start, finite(input.end_seconds, start));
  if (end <= start) throw new Error("CREATIVE_MUSIC_COMP_REGION_DURATION_REQUIRED");
  return {
    id: text(input.id) || `comp-region-${crypto.randomUUID()}`,
    take_id: requiredId(input.take_id, "CREATIVE_MUSIC_COMP_REGION_TAKE_REQUIRED"),
    source_asset_id: requiredId(input.source_asset_id, "CREATIVE_MUSIC_COMP_REGION_SOURCE_REQUIRED"),
    start_seconds: start,
    end_seconds: end,
    source_offset_seconds: Math.max(0, finite(input.source_offset_seconds, start)),
    gain_db: clamp(input.gain_db, -24, 24, 0),
    fade_in_seconds: clamp(input.fade_in_seconds, 0, (end - start) / 2, 0.01),
    fade_out_seconds: clamp(input.fade_out_seconds, 0, (end - start) / 2, 0.01),
    selected: true,
    immutable_source: true,
    destructive_edit: false,
  };
}

export function buildMusicComp(input = {}) {
  const trackId = requiredId(input.track_id, "CREATIVE_MUSIC_COMP_TRACK_REQUIRED");
  const regions = (Array.isArray(input.regions) ? input.regions : [])
    .map(createMusicCompRegion)
    .sort((a, b) => a.start_seconds - b.start_seconds);
  if (!regions.length) throw new Error("CREATIVE_MUSIC_COMP_REGIONS_REQUIRED");
  for (let index = 1; index < regions.length; index += 1) {
    if (regions[index].start_seconds < regions[index - 1].end_seconds) {
      throw new Error("CREATIVE_MUSIC_COMP_REGION_OVERLAP_INVALID");
    }
  }
  const start = regions[0].start_seconds;
  const end = regions.at(-1).end_seconds;
  return {
    contract: CONTRACT,
    id: text(input.id) || `comp-${crypto.randomUUID()}`,
    track_id: trackId,
    name: text(input.name || "Comp").slice(0, 120),
    regions,
    start_seconds: start,
    end_seconds: end,
    duration_seconds: end - start,
    crossfade_default_seconds: clamp(input.crossfade_default_seconds, 0, 0.25, 0.015),
    source_take_ids: [...new Set(regions.map((region) => region.take_id))],
    source_asset_ids: [...new Set(regions.map((region) => region.source_asset_id))],
    preserve_all_source_takes: true,
    render_required_for_release: true,
    browser_preview_derived_only: true,
    destructive_edit: false,
  };
}

export function applyMusicCompToTrack(track = {}, comp = {}) {
  if (!track?.id || track.id !== comp.track_id) throw new Error("CREATIVE_MUSIC_COMP_TRACK_MISMATCH");
  const takeIds = new Set((track.takes || []).map((take) => text(take.id)));
  const sourceIds = new Set((track.takes || []).map((take) => text(take.source_asset_id)));
  for (const region of comp.regions || []) {
    if (!takeIds.has(region.take_id)) throw new Error(`CREATIVE_MUSIC_COMP_TAKE_NOT_FOUND:${region.take_id}`);
    if (!sourceIds.has(region.source_asset_id)) throw new Error(`CREATIVE_MUSIC_COMP_SOURCE_NOT_FOUND:${region.source_asset_id}`);
  }
  return {
    ...track,
    comp,
    takes: (track.takes || []).map((take) => ({
      ...take,
      selected_for_comp: comp.source_take_ids.includes(take.id),
      original_take: true,
      immutable_source: true,
    })),
    destructive_processing_allowed: false,
  };
}

export function validateMusicComp(track = {}) {
  const comp = track.comp;
  if (!comp) return { success: true, contract: CONTRACT, comp_present: false };
  if (comp.contract !== CONTRACT || comp.destructive_edit === true || comp.preserve_all_source_takes !== true) {
    throw new Error("CREATIVE_MUSIC_COMP_NON_DESTRUCTIVE_REQUIRED");
  }
  applyMusicCompToTrack(track, comp);
  return {
    success: true,
    contract: CONTRACT,
    comp_present: true,
    region_count: comp.regions.length,
    source_take_count: comp.source_take_ids.length,
    source_takes_preserved: true,
    destructive_edit: false,
  };
}

export const CreativeMusicCompingRuntime = {
  contract: CONTRACT,
  createTakeLane: createMusicTakeLane,
  createCompRegion: createMusicCompRegion,
  buildComp: buildMusicComp,
  applyToTrack: applyMusicCompToTrack,
  validate: validateMusicComp,
};
