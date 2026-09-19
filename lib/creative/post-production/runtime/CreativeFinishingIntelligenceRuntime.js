export const CREATIVE_FINISHING_INTELLIGENCE_CONTRACT = "CREATIVE_FINISHING_INTELLIGENCE_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value, max = 320) {
  const out = String(value ?? "").trim();
  return out ? out.slice(0, max) : null;
}
function lower(value) {
  return String(value ?? "").toLowerCase();
}

const DOMAINS = Object.freeze([
  "COMPOSITING",
  "OPTICAL",
  "COLOR",
  "MATERIAL_LIGHT",
  "ATMOSPHERE",
  "EDGE_DETAIL",
  "GRAIN_TEXTURE",
  "MOTION_BLUR",
  "HIGHLIGHT_ROLLOFF",
  "BLACK_LEVEL",
  "SKIN_MATERIAL_HUE",
]);

function classifyReason(reason = "") {
  const value = lower(reason);
  const tags = [];
  const add = (tag, pattern) => { if (pattern.test(value)) tags.push(tag); };
  add("COMPOSITING", /composit|matte|alpha|spill|edge|occlusion|reflection|cutout|halo/);
  add("OPTICAL", /optical|grain|halation|bloom|chromatic|vignette|lens|oversharp|microcontrast/);
  add("COLOR", /color|colour|grade|saturation|black|highlight|skin hue|teal|orange|exposure/);
  add("MATERIAL_LIGHT", /material|plastic|bark|skin|cloth|metal|reflection|light interaction/);
  add("ATMOSPHERE", /fog|mist|rain|volumetric|haze|atmospher/);
  add("EDGE_DETAIL", /edge|halo|sharpen|ringing|detail/);
  add("GRAIN_TEXTURE", /grain|texture|noise/);
  add("MOTION_BLUR", /motion blur|shutter|smear/);
  add("HIGHLIGHT_ROLLOFF", /highlight|clipp|rolloff|bloom/);
  add("BLACK_LEVEL", /black|shadow|crush|milky|lifted/);
  add("SKIN_MATERIAL_HUE", /skin|material hue|forest green|hue/);
  return [...new Set(tags)];
}

export function buildFinishingIntelligence({ taste_memory = {} } = {}) {
  const recurring = list(taste_memory.recurring_rejection_patterns);
  const lessons = list(taste_memory.craft_lessons);
  const domainPatterns = Object.fromEntries(DOMAINS.map((domain) => [domain, []]));

  for (const entry of recurring) {
    const reason = text(entry.reason, 220);
    if (!reason) continue;
    for (const domain of classifyReason(reason)) {
      domainPatterns[domain].push({
        reason,
        count: Number(entry.count) || 0,
        must_avoid: Number(entry.count) >= 2,
      });
    }
  }

  const finishingLessons = lessons
    .filter((lesson) => ["environment", "artifacts", "physics", "camera"].includes(String(lesson.domain || "").toLowerCase()))
    .slice(0, 20)
    .map((lesson) => ({
      domain: text(lesson.domain, 80),
      score_delta: Number(lesson.score_delta) || 0,
      reasons: list(lesson.reasons).map((reason) => text(reason, 180)).filter(Boolean),
      evidence_only: true,
      copy_forbidden: true,
    }));

  return Object.freeze({
    contract: CREATIVE_FINISHING_INTELLIGENCE_CONTRACT,
    domain_patterns: domainPatterns,
    lessons: finishingLessons,
    composite_gate: {
      edge_integration_required: true,
      depth_motion_blur_grain_match_required: true,
      atmospheric_integration_required: true,
      material_light_continuity_required: true,
      synthetic_layer_visibility_forbidden: true,
    },
    optical_gate: {
      coherent_capture_system_required: true,
      stacked_effect_signature_forbidden: true,
      motion_blur_and_dof_physics_required: true,
      grain_may_not_mask_artifacts: true,
      weak_frame_rescue_forbidden: true,
    },
    color_gate: {
      black_separation_required: true,
      highlight_rolloff_required: true,
      hue_integrity_required: true,
      shot_match_required: true,
      texture_preservation_required: true,
      generic_teal_orange_default_forbidden: true,
      artifact_hiding_grade_forbidden: true,
    },
    governance: {
      evidence_is_advisory: true,
      quality_floor_immutable: true,
      finishing_may_not_override_directorial_intent: true,
      prior_work_copying_forbidden: true,
    },
  });
}

export const CreativeFinishingIntelligenceRuntime = Object.freeze({
  contract: CREATIVE_FINISHING_INTELLIGENCE_CONTRACT,
  build: buildFinishingIntelligence,
});
