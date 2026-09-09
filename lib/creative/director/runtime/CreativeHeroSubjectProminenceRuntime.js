function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const CreativeHeroSubjectProminenceRuntime = Object.freeze({
  contract: "CREATIVE_HERO_SUBJECT_PROMINENCE_V1",

  create({ shot = {}, representative = {} } = {}) {
    const camera = shot.camera || {};
    const explicit = finite(shot.hero_subject_frame_occupancy_percent || shot.metadata?.hero_subject_frame_occupancy_percent);
    const minimum = explicit == null ? 22 : clamp(explicit, 15, 60);
    const platformMinimum = Math.max(18, Math.round(minimum * 0.9));

    return {
      contract: "CREATIVE_HERO_SUBJECT_PROMINENCE_V1",
      primary_subject_min_frame_occupancy_percent: minimum,
      secondary_subject_min_frame_occupancy_percent: platformMinimum,
      primary_subject_must_be_immediately_identifiable: true,
      secondary_subject_must_be_immediately_identifiable: true,
      empty_negative_space_max_percent: 58,
      horizon_must_not_dominate_composition: true,
      subject_separation_required: true,
      subject_overlap_must_preserve_readability: true,
      camera_distance_must_yield_subject_prominence: true,
      representative_frame_source: representative.frame_source || null,
      lens_intent: camera.lens_intent || null,
    };
  },
});
