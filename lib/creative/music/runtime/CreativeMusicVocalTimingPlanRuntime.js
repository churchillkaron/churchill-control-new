const CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_PLAN_V1";
const ANALYSIS_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_ANALYSIS_V1";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function assertAnalysis(analysis) {
  if (analysis?.contract !== ANALYSIS_CONTRACT) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_ANALYSIS_REQUIRED");
  if (analysis.auto_apply_forbidden !== true || analysis.provider_job_submitted === true) {
    throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_ANALYSIS_INVALID");
  }
  if (analysis.whole_phrase_translation_only !== true || analysis.time_stretch_used === true) {
    throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_NON_STRETCH_EVIDENCE_REQUIRED");
  }
}

function targetPocket(phrases, index, totalDuration, guardSeconds) {
  const previousEnd = index > 0 ? finite(phrases[index - 1].source_end_seconds, 0) : 0;
  const nextStart = index + 1 < phrases.length
    ? finite(phrases[index + 1].source_start_seconds, totalDuration)
    : totalDuration;
  return {
    start_seconds: Math.max(0, previousEnd + guardSeconds),
    end_seconds: Math.min(totalDuration, nextStart - guardSeconds),
  };
}

function validateMove(phrases, index, shiftMs, totalDuration, maximumShiftMs, guardSeconds) {
  const phrase = phrases[index];
  const bounded = clamp(shiftMs, -maximumShiftMs, maximumShiftMs, 0);
  if (Math.abs(bounded - finite(shiftMs, 0)) > 0.01) {
    return { safe: false, reason: "MUSICIAN_SHIFT_EXCEEDS_MAXIMUM", shift_ms: bounded };
  }
  const targetStart = finite(phrase.source_start_seconds, 0) + bounded / 1000;
  const targetEnd = targetStart + finite(phrase.duration_seconds, 0);
  const pocket = targetPocket(phrases, index, totalDuration, guardSeconds);
  if (targetStart < 0 || targetEnd > totalDuration) {
    return { safe: false, reason: "OUTSIDE_SOURCE_BOUNDS", shift_ms: bounded, target_start_seconds: targetStart };
  }
  if (targetStart < pocket.start_seconds || targetEnd > pocket.end_seconds) {
    return { safe: false, reason: "NEIGHBOR_PHRASE_COLLISION_RISK", shift_ms: bounded, target_start_seconds: targetStart };
  }
  return {
    safe: true,
    reason: Math.abs(bounded) < 0.1 ? "NO_MOVE" : "SAFE_LOCAL_TIMING_POCKET",
    shift_ms: bounded,
    target_start_seconds: targetStart,
    target_end_seconds: targetEnd,
    pocket,
  };
}

function renderReadiness(phrases = []) {
  const ready = phrases.every((phrase) => phrase.approved === true);
  return {
    ready,
    blocker: ready ? null : "MUSICIAN_TIMING_PLAN_REVIEW_INCOMPLETE",
  };
}

export function buildMusicVocalTimingPlan({ analysis } = {}) {
  assertAnalysis(analysis);
  const phrases = (analysis.phrases || []).map((source) => ({
    id: source.id,
    phrase_index: source.phrase_index,
    source_start_seconds: finite(source.source_start_seconds, 0),
    source_end_seconds: finite(source.source_end_seconds, 0),
    duration_seconds: finite(source.duration_seconds, 0),
    nearest_grid_seconds: finite(source.nearest_grid_seconds, 0),
    raw_shift_ms: finite(source.raw_shift_ms, 0),
    proposed_shift_ms: finite(source.proposed_shift_ms, 0),
    target_start_seconds: finite(source.target_start_seconds, source.source_start_seconds),
    eligible: source.eligible === true,
    safety_reason: source.safety_reason || null,
    outside_conservative_max_shift: source.outside_conservative_max_shift === true,
    approved: source.eligible !== true,
    musician_shift_override: false,
  }));
  const reviewed = phrases.filter((phrase) => phrase.approved).length;
  const render = renderReadiness(phrases);
  return {
    contract: CONTRACT,
    source_analysis_contract: ANALYSIS_CONTRACT,
    source_checksum: analysis.source_checksum || null,
    source_asset_id: analysis.source_asset_id || null,
    source_offset_seconds: finite(analysis.source_offset_seconds, 0),
    source_duration_seconds: finite(analysis.source_duration_seconds, analysis.duration_seconds),
    bpm: finite(analysis.bpm, 0),
    grid_division: analysis.grid_division || "EIGHTH_NOTE",
    beat_offset_seconds: finite(analysis.beat_offset_seconds, 0),
    settings: {
      correction_strength: finite(analysis.settings?.correction_strength, 0.45),
      max_shift_ms: finite(analysis.settings?.max_shift_ms, 80),
      guard_seconds: finite(analysis.settings?.guard_seconds, 0.018),
    },
    phrases,
    suggested_move_count: phrases.filter((phrase) => phrase.eligible).length,
    reviewed_phrase_count: reviewed,
    all_phrases_reviewed: render.ready,
    musician_approval_required: true,
    auto_apply_forbidden: true,
    whole_phrase_translation_only: true,
    time_stretch_used: false,
    syllable_warp_forbidden: true,
    internal_phrase_timing_preserved: true,
    render_ready: render.ready,
    render_blocker: render.blocker,
    render_orchestration_contract: "AVANTIQO_MUSIC_VOCAL_TUNING_RENDER_REQUEST_V1",
    timing_applied: false,
    provider_job_submitted: false,
  };
}

export function reviewMusicVocalTimingPhrase(plan = {}, phraseId, input = {}) {
  if (plan.contract !== CONTRACT || plan.auto_apply_forbidden !== true) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_INVALID");
  const next = structuredClone(plan);
  const index = next.phrases.findIndex((phrase) => phrase.id === phraseId);
  if (index < 0) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_PLAN_PHRASE_NOT_FOUND");
  const phrase = next.phrases[index];
  const requestedShift = input.shift_ms !== undefined && input.shift_ms !== null
    ? finite(input.shift_ms, phrase.proposed_shift_ms)
    : phrase.proposed_shift_ms;
  const validation = validateMove(
    next.phrases,
    index,
    requestedShift,
    finite(next.source_duration_seconds, 0),
    finite(next.settings?.max_shift_ms, 80),
    finite(next.settings?.guard_seconds, 0.018),
  );
  if (!validation.safe) throw new Error(`CREATIVE_MUSIC_VOCAL_TIMING_PLAN_UNSAFE_MOVE:${validation.reason}`);

  phrase.proposed_shift_ms = Math.round(validation.shift_ms * 10) / 10;
  phrase.target_start_seconds = Math.round(validation.target_start_seconds * 1e6) / 1e6;
  phrase.target_end_seconds = Math.round(validation.target_end_seconds * 1e6) / 1e6;
  phrase.safety_reason = validation.reason;
  phrase.approved = input.approved !== false;
  phrase.musician_shift_override = input.shift_ms !== undefined && input.shift_ms !== null;
  next.reviewed_phrase_count = next.phrases.filter((entry) => entry.approved).length;
  const render = renderReadiness(next.phrases);
  next.all_phrases_reviewed = render.ready;
  next.render_ready = render.ready;
  next.render_blocker = render.blocker;
  next.render_orchestration_contract = "AVANTIQO_MUSIC_VOCAL_TUNING_RENDER_REQUEST_V1";
  next.timing_applied = false;
  return next;
}

export const CreativeMusicVocalTimingPlanRuntime = {
  contract: CONTRACT,
  build: buildMusicVocalTimingPlan,
  reviewPhrase: reviewMusicVocalTimingPhrase,
};
