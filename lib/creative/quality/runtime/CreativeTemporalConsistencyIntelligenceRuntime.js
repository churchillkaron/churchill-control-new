export const CREATIVE_TEMPORAL_CONSISTENCY_INTELLIGENCE_CONTRACT = "CREATIVE_TEMPORAL_CONSISTENCY_INTELLIGENCE_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value, max = 240) {
  const out = String(value ?? "").trim();
  return out ? out.slice(0, max) : null;
}
function lower(value) {
  return String(value ?? "").toLowerCase();
}

const DIMENSIONS = Object.freeze([
  "TEXTURE_STABILITY",
  "SKIN_DETAIL_STABILITY",
  "MATERIAL_DETAIL_STABILITY",
  "RAIN_CONTINUITY",
  "FOG_VOLUMETRIC_CONTINUITY",
  "REFLECTION_STABILITY",
  "EDGE_STABILITY",
  "GRAIN_STABILITY",
  "MOTION_BLUR_CONTINUITY",
  "DEPTH_OF_FIELD_CONTINUITY",
  "LENS_RESPONSE_CONTINUITY",
  "LIGHTING_CONTINUITY",
  "IDENTITY_GEOMETRY_STABILITY",
]);

function classify(reason = "") {
  const value = lower(reason);
  const tags = [];
  const add = (tag, pattern) => { if (pattern.test(value)) tags.push(tag); };
  add("TEXTURE_STABILITY", /texture boil|texture crawl|boil|shimmer|surface crawl/);
  add("SKIN_DETAIL_STABILITY", /skin.*flicker|skin.*crawl|skin.*shimmer|face detail/);
  add("MATERIAL_DETAIL_STABILITY", /material.*crawl|bark.*crawl|cloth.*crawl|metal.*crawl|surface.*unstable/);
  add("RAIN_CONTINUITY", /rain.*continu|rain.*flicker|rain.*reset|droplet.*boil/);
  add("FOG_VOLUMETRIC_CONTINUITY", /fog.*continu|mist.*continu|volumetric.*continu|beam.*flicker|haze.*reset/);
  add("REFLECTION_STABILITY", /reflection.*flicker|reflection.*drift|reflection.*unstable/);
  add("EDGE_STABILITY", /edge.*crawl|edge.*ring|edge.*boil|halo.*flicker/);
  add("GRAIN_STABILITY", /grain.*crawl|grain.*flicker|noise.*boil/);
  add("MOTION_BLUR_CONTINUITY", /motion blur.*incons|shutter.*incons|blur.*puls/);
  add("DEPTH_OF_FIELD_CONTINUITY", /depth of field.*drift|focus.*pump|bokeh.*flicker/);
  add("LENS_RESPONSE_CONTINUITY", /lens.*flicker|chromatic.*flicker|halation.*pump|bloom.*pump/);
  add("LIGHTING_CONTINUITY", /light.*flicker|lighting.*drift|exposure.*pump|beam.*jump/);
  add("IDENTITY_GEOMETRY_STABILITY", /identity drift|face.*drift|body.*drift|geometry.*drift/);
  return [...new Set(tags)];
}

export function buildTemporalConsistencyIntelligence({ taste_memory = {} } = {}) {
  const recurring = list(taste_memory.recurring_rejection_patterns);
  const learned = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, []]));

  for (const entry of recurring) {
    const reason = text(entry.reason);
    if (!reason) continue;
    for (const dimension of classify(reason)) {
      learned[dimension].push({
        reason,
        count: Number(entry.count) || 0,
        must_avoid: Number(entry.count) >= 2,
      });
    }
  }

  return Object.freeze({
    contract: CREATIVE_TEMPORAL_CONSISTENCY_INTELLIGENCE_CONTRACT,
    dimensions: DIMENSIONS,
    learned_failure_patterns: learned,
    temporal_gate: {
      texture_boiling_forbidden: true,
      detail_crawl_forbidden: true,
      skin_detail_pulsing_forbidden: true,
      material_detail_pulsing_forbidden: true,
      rain_state_reset_forbidden: true,
      fog_and_volumetric_state_reset_forbidden: true,
      reflection_flicker_forbidden: true,
      edge_crawl_and_ringing_forbidden: true,
      grain_must_be_temporally_coherent: true,
      motion_blur_must_follow_authored_shutter: true,
      depth_of_field_may_not_pump_without_authored_focus_transition: true,
      lens_artifacts_may_not_pulse_frame_to_frame: true,
      exposure_pumping_forbidden: true,
      identity_geometry_may_not_drift: true,
    },
    upscale_gate: {
      temporal_model_required: true,
      per_frame_independent_super_resolution_forbidden: true,
      source_detail_may_not_be_reinvented_frame_to_frame: true,
      grain_restoration_must_occur_after_temporal_sr: true,
      sharpen_after_sr_must_be_bounded: true,
      temporal_consistency_review_required_after_upscale: true,
    },
    governance: {
      evidence_is_advisory: true,
      final_perceptual_review_required: true,
      quality_floor_immutable: true,
    },
  });
}

export const CreativeTemporalConsistencyIntelligenceRuntime = Object.freeze({
  contract: CREATIVE_TEMPORAL_CONSISTENCY_INTELLIGENCE_CONTRACT,
  build: buildTemporalConsistencyIntelligence,
});
