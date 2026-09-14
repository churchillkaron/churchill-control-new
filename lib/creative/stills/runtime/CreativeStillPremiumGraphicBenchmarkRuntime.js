const CONTRACT = "CREATIVE_STILL_PREMIUM_GRAPHIC_BENCHMARK_V1";

const DIMENSIONS = Object.freeze([
  ["typography", "typography_score", 97],
  ["hierarchy", "editorial_hierarchy_score", 96],
  ["spacing", "spacing_rhythm_score", 96],
  ["negative_space", "negative_space_score", 95],
  ["hero_dominance", "hero_dominance_score", 95],
  ["alignment", "alignment_precision_score", 97],
  ["crop_discipline", "crop_discipline_score", 95],
  ["palette_restraint", "palette_restraint_score", 95],
  ["clutter_control", "clutter_control_score", 96],
]);

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

export function evaluatePremiumGraphicBenchmark(evidence = {}) {
  const root = object(evidence.result || evidence.review || evidence.validation || evidence);
  const scores = object(root.scores);
  const failures = [];
  const resolved = {};
  for (const [name, field, floor] of DIMENSIONS) {
    const value = finite(scores[field] ?? root[field]);
    resolved[name] = value;
    if (value === null) failures.push(`PREMIUM_GRAPHIC_SCORE_REQUIRED:${field}`);
    else if (value < floor) failures.push(`PREMIUM_GRAPHIC_BELOW_FLOOR:${name}:${value}:${floor}`);
  }
  if (root.typography_legible === false) failures.push("PREMIUM_GRAPHIC_TYPOGRAPHY_LEGIBILITY_FAILED");
  if (root.decorative_clutter_absent === false) failures.push("PREMIUM_GRAPHIC_DECORATIVE_CLUTTER_PRESENT");
  if (root.primary_subject_clear === false) failures.push("PREMIUM_GRAPHIC_HERO_HIERARCHY_FAILED");
  if (root.detail_crops_intentional === false) failures.push("PREMIUM_GRAPHIC_DETAIL_CROP_DISCIPLINE_FAILED");
  return Object.freeze({
    contract: CONTRACT,
    benchmark_id: "PREMIUM_EDITORIAL_AUTOMOTIVE_MINIMUM_V1",
    passed: failures.length === 0,
    scores: resolved,
    failures,
    principles: Object.freeze([
      "CINEMATIC_HERO_DOMINANCE",
      "CONTROLLED_NEGATIVE_SPACE",
      "DISCIPLINED_TRACKING_AND_TYPE_SCALE",
      "EXACT_ALIGNMENT",
      "RESTRAINED_PALETTE",
      "MODULAR_DETAIL_CROPS",
      "ZERO_DECORATIVE_CLUTTER",
    ]),
  });
}

export const CreativeStillPremiumGraphicBenchmarkRuntime = Object.freeze({
  contract: CONTRACT,
  dimensions: DIMENSIONS,
  evaluate: evaluatePremiumGraphicBenchmark,
});

export default CreativeStillPremiumGraphicBenchmarkRuntime;
