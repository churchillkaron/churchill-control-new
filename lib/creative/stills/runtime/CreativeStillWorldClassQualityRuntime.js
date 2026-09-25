import { evaluatePremiumGraphicBenchmark } from "./CreativeStillPremiumGraphicBenchmarkRuntime.js";
import { evaluatePremiumAdvertisingBenchmark } from "./CreativeStillPremiumAdvertisingBenchmarkRuntime.js";
const CONTRACT = "CREATIVE_STILL_WORLD_CLASS_QUALITY_V1";

const SCORE_FIELDS = Object.freeze([
  ["overall", "overall_score", 95],
  ["composition", "composition_score", 94],
  ["depth", "depth_score", 94],
  ["lighting", "lighting_quality_score", 94],
  ["material_realism", "material_realism_score", 94],
  ["production_design", "production_design_score", 94],
  ["visual_hierarchy", "visual_hierarchy_score", 94],
  ["place_specificity", "place_specificity_score", 94],
  ["scale_readability", "scale_readability_score", 94],
  ["artifact", "artifact_score", 96],
]);

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return String(value ?? "").trim(); }

function unwrap(value = {}) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next = current.perceptual_validation?.evidence || current.perceptual_validation || current.result || current.review || current.validation || current.output;
    if (!next || next === current) break;
    current = next;
  }
  return object(current);
}

function score(evidence, field) {
  const nested = object(evidence.scores);
  return finite(nested[field] ?? evidence[field]);
}

export function evaluateCreativeStillWorldClassQuality({ evidence: rawEvidence = {}, requirements = {} } = {}) {
  const evidence = unwrap(rawEvidence);
  const req = object(requirements);
  const failures = [];
  const scores = {};

  for (const [name, field, floor] of SCORE_FIELDS) {
    const value = score(evidence, field);
    scores[name] = value;
    if (value === null) failures.push(`STILL_WORLD_CLASS_SCORE_REQUIRED:${field}`);
    else if (value < floor) failures.push(`STILL_WORLD_CLASS_BELOW_FLOOR:${name}:${value}:${floor}`);
  }

  if (req.identity_required === true) {
    const value = score(evidence, "identity_score");
    scores.identity = value;
    if (value === null || value < 96 || evidence.identity_preserved === false) failures.push("STILL_IDENTITY_FIDELITY_FAILED");
  }
  if (req.product_required === true) {
    const value = score(evidence, "product_fidelity_score");
    scores.product_fidelity = value;
    if (value === null || value < 96 || evidence.product_preserved === false) failures.push("STILL_PRODUCT_FIDELITY_FAILED");
  }
  if (evidence.synthetic_artifacts_absent === false) failures.push("STILL_SYNTHETIC_ARTIFACTS_PRESENT");
  if (evidence.unexpected_text_or_watermark_absent === false) failures.push("STILL_UNEXPECTED_GENERATED_TEXT_OR_WATERMARK");

  let premium_graphic_benchmark = null;
  let premium_advertising_benchmark = null;
  if (req.premium_graphic_benchmark_required === true) {
    premium_graphic_benchmark = evaluatePremiumGraphicBenchmark(evidence);
    for (const failure of premium_graphic_benchmark.failures) failures.push(failure);
  }

  if (req.premium_advertising_benchmark_required === true) {
    premium_advertising_benchmark = evaluatePremiumAdvertisingBenchmark(evidence);
    for (const failure of premium_advertising_benchmark.failures) failures.push(failure);
  }

  for (const failure of list(evidence.failures)) failures.push(`SEMANTIC:${text(failure)}`);

  return Object.freeze({
    contract: CONTRACT,
    passed: failures.length === 0,
    world_class_floor: 95,
    critical_visual_floor: 94,
    scores,
    weakest_score: Object.values(scores).filter((value) => value !== null).length ? Math.min(...Object.values(scores).filter((value) => value !== null)) : null,
    failures: [...new Set(failures)],
    repair_instructions: list(evidence.repair_instructions),
    average_score_cannot_override_critical_failure: true,
    exact_design_quality_is_independently_validated: true,
    premium_graphic_benchmark,
    premium_advertising_benchmark,
  });
}

export const CreativeStillWorldClassQualityRuntime = Object.freeze({ contract: CONTRACT, evaluate: evaluateCreativeStillWorldClassQuality });
export default CreativeStillWorldClassQualityRuntime;
