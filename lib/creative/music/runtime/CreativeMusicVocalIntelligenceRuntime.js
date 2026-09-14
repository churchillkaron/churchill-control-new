export const MUSIC_VOCAL_INTELLIGENCE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_INTELLIGENCE_V1";
const PITCH_CONTRACT = "AVANTIQO_MUSIC_VOCAL_PITCH_ANALYSIS_V1";
const TIMING_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_ANALYSIS_V1";
const ENGINEERING_CONTRACT = "AVANTIQO_MUSIC_VOCAL_ENGINEERING_EVIDENCE_V1";
const MAX_CLIPS = 12;
const MAX_REGIONS = 24;
const ROLE_MAP = Object.freeze({
  lead: "LEAD", lead_vocal: "LEAD",
  backing: "BACKING", backing_vocal: "BACKING",
  harmony: "HARMONY", harmony_vocal: "HARMONY",
  choir: "CHOIR", adlib: "ADLIB", ad_lib: "ADLIB",
});

function text(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function rounded(value, digits = 3) {
  const number = finite(value);
  return number === null ? null : Number(number.toFixed(digits));
}
function median(values = []) {
  const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
}

function bindingMatches(analysis, clip, contract) {
  if (!analysis || analysis.contract !== contract) return false;
  if (text(analysis.source_asset_id, 180) !== text(clip.source_asset_id, 180)) return false;
  const offset = finite(analysis.source_offset_seconds);
  const clipOffset = finite(clip.source_offset_seconds) ?? 0;
  const duration = finite(analysis.source_duration_seconds);
  const clipDuration = finite(clip.duration_seconds);
  if (offset === null || Math.abs(offset - clipOffset) > 0.001) return false;
  if (duration === null || clipDuration === null || Math.abs(duration - clipDuration) > 0.01) return false;
  return true;
}

function declaredRole(track = {}) {
  const raw = text(track.vocal_role || track.role, 80).toLowerCase().replace(/[\s-]+/g, "_");
  return ROLE_MAP[raw] || null;
}
function pitchSummary(analysis = {}) {
  if (!analysis || analysis.contract !== PITCH_CONTRACT) return null;
  const segments = list(analysis.note_segments).slice(0, MAX_REGIONS);
  const cents = segments.map((row) => finite(row.mean_cents_deviation)).filter((value) => value !== null);
  const midi = segments.map((row) => finite(row.midi)).filter((value) => value !== null);
  const withinTen = cents.filter((value) => Math.abs(value) <= 10).length;
  return {
    voiced_ratio: rounded(analysis.voiced_ratio),
    mean_confidence: rounded(analysis.mean_confidence),
    stable_note_count: segments.length,
    lowest_midi: midi.length ? Math.min(...midi) : null,
    highest_midi: midi.length ? Math.max(...midi) : null,
    median_cents_deviation: rounded(median(cents), 1),
    mean_absolute_cents_deviation: cents.length ? rounded(cents.reduce((sum, value) => sum + Math.abs(value), 0) / cents.length, 1) : null,
    within_10_cents_ratio: cents.length ? rounded(withinTen / cents.length) : null,
    measured: true,
  };
}

function timingSummary(analysis = {}) {
  if (!analysis || analysis.contract !== TIMING_CONTRACT) return null;
  const phrases = list(analysis.phrases).slice(0, MAX_REGIONS);
  const raw = phrases.map((row) => finite(row.raw_shift_ms)).filter((value) => value !== null);
  const early = raw.filter((value) => value > 4).length;
  const late = raw.filter((value) => value < -4).length;
  return {
    phrase_count: phrases.length,
    active_duration_seconds: rounded(phrases.reduce((sum, row) => sum + (finite(row.duration_seconds) || 0), 0), 2),
    mean_absolute_grid_offset_ms: raw.length ? rounded(raw.reduce((sum, value) => sum + Math.abs(value), 0) / raw.length, 1) : null,
    early_phrase_count: early,
    late_phrase_count: late,
    grid_tendency: early > late ? "EARLY" : late > early ? "LATE" : raw.length ? "BALANCED" : null,
    suggested_move_count: Number(analysis.suggested_move_count || 0),
    measured: true,
  };
}
function engineeringSummary(evidence = {}) {
  if (!evidence || evidence.contract !== ENGINEERING_CONTRACT || evidence.source_audio_measured !== true) return null;
  const measured = evidence.measured && typeof evidence.measured === "object" ? evidence.measured : {};
  return {
    source_mean_db: rounded(measured.source_mean_db, 2),
    source_peak_dbfs: rounded(measured.source_peak_dbfs, 2),
    body_vs_presence_db: rounded(measured.body_vs_presence_db, 2),
    sibilance_vs_presence_db: rounded(measured.sibilance_vs_presence_db, 2),
    rumble_vs_body_db: rounded(measured.rumble_vs_body_db, 2),
    body_dominant: measured.body_dominant === true ? true : measured.body_dominant === false ? false : null,
    presence_deficit: measured.presence_deficit === true ? true : measured.presence_deficit === false ? false : null,
    sibilance_elevated: measured.sibilance_elevated === true ? true : measured.sibilance_elevated === false ? false : null,
    sub_rumble_elevated: measured.sub_rumble_elevated === true ? true : measured.sub_rumble_elevated === false ? false : null,
    measured: true,
  };
}

function phraseRegions(analysis = {}) {
  return list(analysis.phrases).slice(0, MAX_REGIONS).map((row) => ({
    start_seconds: finite(row.source_start_seconds),
    end_seconds: finite(row.source_end_seconds),
    duration_seconds: finite(row.duration_seconds),
    mean_rms: finite(row.mean_rms),
    raw_shift_ms: finite(row.raw_shift_ms),
    proposed_shift_ms: finite(row.proposed_shift_ms),
    eligible: row.eligible === true,
    safety_reason: text(row.safety_reason, 180) || null,
  })).filter((row) => row.start_seconds !== null && row.end_seconds !== null && row.end_seconds > row.start_seconds);
}

function clipSummary(track = {}, clip = {}) {
  const pitch = bindingMatches(clip.vocal_pitch_analysis, clip, PITCH_CONTRACT) ? clip.vocal_pitch_analysis : null;
  const timing = bindingMatches(clip.vocal_timing_analysis, clip, TIMING_CONTRACT) ? clip.vocal_timing_analysis : null;
  const engineering = bindingMatches(clip.vocal_engineering_evidence, clip, ENGINEERING_CONTRACT) ? clip.vocal_engineering_evidence : null;
  if (!pitch && !timing && !engineering) return null;
  return {
    track_id: text(track.id, 180) || null,
    clip_id: text(clip.id, 180) || null,
    source_asset_id: text(clip.source_asset_id, 180) || null,
    declared_vocal_role: declaredRole(track),
    role_inferred_from_audio: false,
    pitch: pitchSummary(pitch),
    timing: timingSummary(timing),
    engineering: engineeringSummary(engineering),
    phrase_regions: timing ? phraseRegions(timing) : [],
  };
}

function projectBrief(clips = []) {
  const brief = [];
  for (const clip of clips.slice(0, 6)) {
    if (clip.pitch?.voiced_ratio !== null && clip.pitch?.voiced_ratio !== undefined) brief.push(`Vocal clip ${clip.clip_id}: voiced ratio ${clip.pitch.voiced_ratio}.`);
    if (clip.pitch?.mean_absolute_cents_deviation !== null && clip.pitch?.mean_absolute_cents_deviation !== undefined) brief.push(`Vocal clip ${clip.clip_id}: mean absolute pitch deviation ${clip.pitch.mean_absolute_cents_deviation} cents.`);
    if (clip.timing?.grid_tendency) brief.push(`Vocal clip ${clip.clip_id}: phrase timing tendency ${clip.timing.grid_tendency.toLowerCase()} with ${clip.timing.suggested_move_count} conservative move suggestions.`);
    if (clip.engineering?.body_vs_presence_db !== null && clip.engineering?.body_vs_presence_db !== undefined) brief.push(`Vocal clip ${clip.clip_id}: measured body-versus-presence balance ${clip.engineering.body_vs_presence_db} dB.`);
    if (clip.engineering?.sibilance_vs_presence_db !== null && clip.engineering?.sibilance_vs_presence_db !== undefined) brief.push(`Vocal clip ${clip.clip_id}: measured sibilance-versus-presence balance ${clip.engineering.sibilance_vs_presence_db} dB.`);
  }
  return brief.slice(0, 18);
}
export function buildMusicVocalIntelligence({ multitrack_session = {} } = {}) {
  const clips = [];
  for (const track of list(multitrack_session.tracks)) {
    if (text(track.type, 80).toLowerCase() !== "vocal") continue;
    for (const clip of list(track.clips)) {
      const summary = clipSummary(track, clip);
      if (summary) clips.push(summary);
      if (clips.length >= MAX_CLIPS) break;
    }
    if (clips.length >= MAX_CLIPS) break;
  }
  return Object.freeze({
    contract: MUSIC_VOCAL_INTELLIGENCE_CONTRACT,
    source_scope: "TRUSTED_VOCAL_WORKSTATION_CLIPS_ONLY",
    clip_count: clips.length,
    clips,
    reasoning_brief: projectBrief(clips),
    lead_backing_relationship_available: false,
    vocal_role_inference_available: false,
    sibilance_available: clips.some((clip) => clip.engineering?.sibilance_vs_presence_db !== null && clip.engineering?.sibilance_vs_presence_db !== undefined),
    tonal_balance_available: clips.some((clip) => clip.engineering?.body_vs_presence_db !== null && clip.engineering?.body_vs_presence_db !== undefined),
    source_level_available: clips.some((clip) => clip.engineering?.source_mean_db !== null && clip.engineering?.source_mean_db !== undefined),
    breath_analysis_available: false,
    dynamics_envelope_available: false,
    recommendations_may_inform_advice_only: true,
    may_infer_user_intent: false,
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export const CreativeMusicVocalIntelligenceRuntime = Object.freeze({
  contract: MUSIC_VOCAL_INTELLIGENCE_CONTRACT,
  build: buildMusicVocalIntelligence,
});
