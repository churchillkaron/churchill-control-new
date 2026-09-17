export const MUSIC_MASTERING_DESTINATION_CONTRACT = "AVANTIQO_MUSIC_MASTERING_DESTINATION_V2";

const PROFILE_DEFINITIONS = Object.freeze({
  streaming: Object.freeze({ id: "streaming", label: "Streaming", target_lufs: -14, true_peak_dbtp: -1, loudness_range_lu: 8, sample_rate: 48000, bit_depth: 24, channels: 2, deliveries: ["wav", "mp3"] }),
  video_web: Object.freeze({ id: "video_web", label: "Web video", target_lufs: -14, true_peak_dbtp: -1, loudness_range_lu: 10, sample_rate: 48000, bit_depth: 24, channels: 2, deliveries: ["wav", "aac"] }),
  film_video_music: Object.freeze({ id: "film_video_music", label: "Film / video music", target_lufs: -18, true_peak_dbtp: -2, loudness_range_lu: 12, sample_rate: 48000, bit_depth: 24, channels: 2, deliveries: ["wav"] }),
  club: Object.freeze({ id: "club", label: "Club playback", target_lufs: -9, true_peak_dbtp: -0.8, loudness_range_lu: 6, sample_rate: 48000, bit_depth: 24, channels: 2, deliveries: ["wav", "mp3"] }),
  live_backing: Object.freeze({ id: "live_backing", label: "Live backing track", target_lufs: -12, true_peak_dbtp: -1, loudness_range_lu: 8, sample_rate: 48000, bit_depth: 24, channels: 2, deliveries: ["wav"] }),
  archival: Object.freeze({ id: "archival", label: "Archival master", target_lufs: -18, true_peak_dbtp: -3, loudness_range_lu: 14, sample_rate: 96000, bit_depth: 24, channels: 2, deliveries: ["wav", "flac"] }),
});

function text(value, max = 160) { return String(value ?? "").trim().toLowerCase().slice(0, max); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function cloneProfile(profile) { return profile ? { ...profile, deliveries: [...profile.deliveries] } : null; }

function alias(value) {
  const source = text(value).replace(/[\s-]+/g, "_");
  if (["spotify", "apple_music", "music_streaming", "stream", "streaming_general"].includes(source)) return "streaming";
  if (["youtube", "youtube_music", "web_video", "social_video", "video"].includes(source)) return "video_web";
  if (["film", "cinema", "score", "broadcast_music", "film_video", "picture"].includes(source)) return "film_video_music";
  if (["dj", "dancefloor", "nightclub", "club_playback"].includes(source)) return "club";
  if (["backing", "backing_track", "stage", "live", "performance"].includes(source)) return "live_backing";
  if (["archive", "preservation", "premaster", "hi_res", "hires"].includes(source)) return "archival";
  return source;
}

export function resolveMusicMasteringDestination(value) {
  const id = alias(value || "streaming");
  return cloneProfile(PROFILE_DEFINITIONS[id] || null);
}

function inferredDestinations(input = {}) {
  const explicit = list(input.mastering_destinations || input.delivery_destinations || input.destinations);
  if (explicit.length) return explicit;
  if (input.mastering_profile) return [input.mastering_profile];
  const objective = text(input.objective || input.title, 1200);
  const found = [];
  if (/(spotify|apple music|streaming|release|single|album)/.test(objective)) found.push("streaming");
  if (/(youtube|web video|social video|video soundtrack)/.test(objective)) found.push("video_web");
  if (/(film|cinema|score|picture)/.test(objective)) found.push("film_video_music");
  if (/(club|dj|nightclub|dancefloor)/.test(objective)) found.push("club");
  if (/(backing track|live show|stage|live performance)/.test(objective)) found.push("live_backing");
  if (/(archive|archival|hi[- ]?res|preservation)/.test(objective)) found.push("archival");
  return found.length ? found : ["streaming"];
}

function variantKey(profile) {
  return [profile.target_lufs, profile.true_peak_dbtp, profile.loudness_range_lu, profile.sample_rate, profile.bit_depth || 24, profile.channels].join(":");
}

export function buildMusicDestinationMasteringPlan(input = {}) {
  const requested = inferredDestinations(input).map((value) => text(value)).filter(Boolean).slice(0, 8);
  const resolved = requested.map((value) => ({ requested: value, profile: resolveMusicMasteringDestination(value) }));
  const unsupported = resolved.filter((row) => !row.profile).map((row) => row.requested);
  if (unsupported.length) {
    return Object.freeze({ contract: MUSIC_MASTERING_DESTINATION_CONTRACT, status: "UNSUPPORTED_DESTINATION", supported: false, requested, unsupported, variants: [], publication_authorized: false });
  }
  const groups = new Map();
  for (const row of resolved) {
    const key = variantKey(row.profile);
    const current = groups.get(key) || { ...row.profile, destinations: [], deliveries: new Set() };
    if (!current.destinations.includes(row.profile.id)) current.destinations.push(row.profile.id);
    for (const delivery of row.profile.deliveries) current.deliveries.add(delivery);
    groups.set(key, current);
  }
  const variants = [...groups.values()].map((group, index) => Object.freeze({
    id: `master-${index + 1}-${group.destinations.join("-")}`,
    destinations: [...group.destinations],
    target_lufs: group.target_lufs,
    true_peak_dbtp: group.true_peak_dbtp,
    loudness_range_lu: group.loudness_range_lu,
    sample_rate: group.sample_rate,
    bit_depth: group.bit_depth || 24,
    channels: group.channels,
    internal_processing_format: "float32",
    delivery_dither_required: true,
    native_high_resolution_required_for_native_claim: group.sample_rate > 48000,
    deliveries: [...group.deliveries],
    non_destructive: true,
  }));
  return Object.freeze({
    contract: MUSIC_MASTERING_DESTINATION_CONTRACT,
    status: "READY",
    supported: true,
    requested,
    variants,
    separate_masters_required: variants.length > 1,
    one_master_fits_all_claimed: false,
    reasoning_brief: variants.map((variant) => `${variant.destinations.join(" + ")}: ${variant.target_lufs} LUFS target, ${variant.true_peak_dbtp} dBTP ceiling; ${variant.bit_depth}-bit/${variant.sample_rate} Hz ${variant.deliveries.join("/")} delivery.`),
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export function evaluateMusicDestinationMaster({ plan = {}, master_report = {} } = {}) {
  const master = master_report.master || master_report || {};
  const measuredLufs = finite(master.integrated_lufs ?? master.lufs);
  const measuredPeak = finite(master.true_peak_dbtp ?? master.true_peak_dbfs ?? master.true_peak);
  const variants = list(plan.variants).map((variant) => {
    const loudnessDelta = measuredLufs === null ? null : Number((measuredLufs - variant.target_lufs).toFixed(2));
    const peakHeadroom = measuredPeak === null ? null : Number((variant.true_peak_dbtp - measuredPeak).toFixed(2));
    return {
      id: variant.id,
      destinations: variant.destinations,
      measured_lufs: measuredLufs,
      target_lufs: variant.target_lufs,
      loudness_delta_lu: loudnessDelta,
      measured_true_peak_dbtp: measuredPeak,
      ceiling_true_peak_dbtp: variant.true_peak_dbtp,
      loudness_pass: loudnessDelta !== null && Math.abs(loudnessDelta) <= 0.5,
      true_peak_pass: measuredPeak !== null && measuredPeak <= variant.true_peak_dbtp + 0.1,
    };
  });
  return Object.freeze({
    contract: "AVANTIQO_MUSIC_DESTINATION_MASTER_QC_V1",
    variants,
    measured: measuredLufs !== null && measuredPeak !== null,
    passed: variants.length > 0 && variants.every((row) => row.loudness_pass && row.true_peak_pass),
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export const CreativeMusicDestinationMasteringRuntime = Object.freeze({
  contract: MUSIC_MASTERING_DESTINATION_CONTRACT,
  profiles: PROFILE_DEFINITIONS,
  resolve: resolveMusicMasteringDestination,
  plan: buildMusicDestinationMasteringPlan,
  evaluate: evaluateMusicDestinationMaster,
});
