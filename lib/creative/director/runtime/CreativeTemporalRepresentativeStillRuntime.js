function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase();
}

const NEGATIVE_VISIBILITY = [
  /\bsmall dot\b/,
  /\bbarely visible\b/,
  /\bdistant\b/,
  /\btiny\b/,
  /\bindistinct\b/,
  /\bminor in (?:the )?frame\b/,
  /\bbackground only\b/,
];

const POSITIVE_VISIBILITY = [
  /\bfully visible\b/,
  /\bclearly visible\b/,
  /\bclearly readable\b/,
  /\breadable\b/,
  /\bdominant\b/,
  /\bhero\b/,
  /\bdetail(?:ed)?\b/,
  /\bclose(?:r| up)?\b/,
];

function scoreFrame(value, base = 0) {
  const source = normalized(value);
  let score = base;
  for (const pattern of NEGATIVE_VISIBILITY) if (pattern.test(source)) score -= 30;
  for (const pattern of POSITIVE_VISIBILITY) if (pattern.test(source)) score += 18;
  if (/\b(platform|building|vehicle|person|product|subject)\b/.test(source)) score += 5;
  return score;
}
function candidates(shot = {}) {
  const framePlan = shot.frame_plan || shot.framePlan || {};
  return [
    { source: "OPENING_FRAME", value: framePlan.opening_frame || shot.opening_frame, base: 0 },
    { source: "PROGRESSION", value: framePlan.progression || framePlan.progression_frames, base: 4 },
    { source: "CLOSING_FRAME", value: framePlan.closing_frame || shot.closing_frame, base: 8 },
  ].filter((candidate) => text(candidate.value));
}

export const CreativeTemporalRepresentativeStillRuntime = Object.freeze({
  contract: "CREATIVE_TEMPORAL_REPRESENTATIVE_STILL_V1",

  select({ shot = {} } = {}) {
    const ranked = candidates(shot)
      .map((candidate) => ({
        ...candidate,
        score: scoreFrame(candidate.value, candidate.base),
      }))
      .sort((left, right) => right.score - left.score);

    const selected = ranked[0] || null;
    if (!selected) throw new Error("CREATIVE_REPRESENTATIVE_STILL_FRAME_REQUIRED");

    return {
      contract: "CREATIVE_TEMPORAL_REPRESENTATIVE_STILL_V1",
      frame_source: selected.source,
      frame: text(selected.value),
      visibility_score: selected.score,
      rejected_low_visibility_frames: ranked
        .filter((candidate) => candidate.score < 0)
        .map((candidate) => candidate.source),
      subject_visibility_required: "PRIMARY_SUBJECT_CLEAR_AND_IMMEDIATELY_READABLE",
      composition_policy: "REPRESENTATIVE_HERO_MOMENT_NOT_EDITORIAL_ENTRY_STATE",
    };
  },
});
