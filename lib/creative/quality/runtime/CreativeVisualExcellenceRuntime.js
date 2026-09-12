const CONTRACT = "CREATIVE_VISUAL_EXCELLENCE_V1";
const DEFAULT_FLOOR = 94;
const HERO_FLOOR = 96;

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? "").trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

const DIMENSIONS = Object.freeze([
  ["composition", "composition_score"],
  ["depth", "depth_score"],
  ["lighting", "lighting_quality_score"],
  ["material_realism", "material_realism_score"],
  ["production_design", "production_design_score"],
  ["visual_hierarchy", "visual_hierarchy_score"],
  ["place_specificity", "place_specificity_score"],
  ["scale_readability", "scale_readability_score"],
]);

export function evaluateVisualExcellence({ cinematic_dna = {}, evidence = {}, media_kind = null } = {}) {
  const dna = object(cinematic_dna);
  if (dna.contract !== "CREATIVE_SHOT_CINEMATIC_DNA_V1") {
    return Object.freeze({ contract: CONTRACT, applicable: false, passed: true, failures: [], scores: {}, weakest_score: null });
  }
  const floor = Math.max(DEFAULT_FLOOR, finite(dna.visual_quality_floor) || 0);
  const hero = dna.iconic_frame?.required === true;
  const scores = {};
  const failures = [];
  for (const [dimension, field] of DIMENSIONS) {
    const score = finite(evidence[field]);
    scores[dimension] = score;
    if (score === null) failures.push(`VISUAL_EXCELLENCE_SCORE_REQUIRED:${field}`);
    else if (score < floor) failures.push(`VISUAL_EXCELLENCE_BELOW_FLOOR:${dimension}:${score}:${floor}`);
  }
  const iconic = finite(evidence.iconic_frame_score);
  scores.iconic_frame = iconic;
  if (hero) {
    if (iconic === null) failures.push("VISUAL_EXCELLENCE_SCORE_REQUIRED:iconic_frame_score");
    else if (iconic < Math.max(HERO_FLOOR, floor)) failures.push(`VISUAL_EXCELLENCE_ICONIC_FRAME_BELOW_FLOOR:${iconic}:${Math.max(HERO_FLOOR, floor)}`);
  }
  const values = Object.values(scores).filter((value) => value !== null);
  return Object.freeze({
    contract: CONTRACT,
    applicable: true,
    passed: failures.length === 0,
    media_kind: text(media_kind).toUpperCase() || null,
    floor,
    hero_floor: hero ? Math.max(HERO_FLOOR, floor) : null,
    hero_frame_required: hero,
    weakest_score: values.length ? Math.min(...values) : null,
    scores,
    failures,
    aggregate_beauty_cannot_override_weak_critical_dimension: true,
  });
}

export const CreativeVisualExcellenceRuntime = Object.freeze({ contract: CONTRACT, floor: DEFAULT_FLOOR, hero_floor: HERO_FLOOR, evaluate: evaluateVisualExcellence });
