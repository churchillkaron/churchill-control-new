const CONTRACT = "CREATIVE_STILL_DAILIES_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function text(value) {
  return String(value ?? "").trim();
}
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
function score(evidence = {}, field) {
  const scores = object(evidence.scores);
  return finite(scores[field] ?? evidence[field]);
}

function requiredChecks(intent = {}) {
  const expected = object(intent.expected_contract || intent);
  return {
    identity: expected.identity_expected === true,
    product: expected.product_expected === true,
    place: expected.location_expected === true || expected.place_specificity_required === true,
    composition: expected.composition_required !== false,
    hierarchy: expected.visual_hierarchy_required !== false,
    style: expected.style_memory_required === true,
  };
}

export function evaluateCreativeStillDailies({ intent = {}, evidence: rawEvidence = {}, style_drift = null } = {}) {
  const evidence = unwrap(rawEvidence);
  const required = requiredChecks(intent);
  const failures = [];
  const checks = {};

  const add = (name, value, floor, code) => {
    checks[name] = { score: value, floor, passed: value !== null && value >= floor };
    if (!checks[name].passed) failures.push(code);
  };
  if (required.identity) add("identity", score(evidence, "identity_score"), 96, "DAILIES_IDENTITY_MISMATCH");
  if (required.product) add("product_fidelity", score(evidence, "product_fidelity_score"), 96, "DAILIES_PRODUCT_FIDELITY_MISMATCH");
  if (required.place) add("place_specificity", score(evidence, "place_specificity_score"), 94, "DAILIES_PLACE_SPECIFICITY_MISMATCH");
  if (required.composition) add("composition", score(evidence, "composition_score"), 94, "DAILIES_COMPOSITION_MISMATCH");
  if (required.hierarchy) add("visual_hierarchy", score(evidence, "visual_hierarchy_score"), 94, "DAILIES_VISUAL_HIERARCHY_MISMATCH");

  if (required.style) {
    const drift = object(style_drift);
    const passed = drift.passed === true;
    checks.style_memory = {
      passed,
      drift_dimensions: list(drift.drift_dimensions).map(text),
      score: finite(drift.score),
    };
    if (!passed) failures.push("DAILIES_STYLE_DRIFT");
  }

  if (evidence.identity_preserved === false) failures.push("DAILIES_IDENTITY_NOT_PRESERVED");
  if (evidence.product_preserved === false) failures.push("DAILIES_PRODUCT_NOT_PRESERVED");
  if (evidence.synthetic_artifacts_absent === false) failures.push("DAILIES_SYNTHETIC_ARTIFACTS");

  const uniqueFailures = [...new Set(failures)];
  return Object.freeze({
    contract: CONTRACT,
    passed: uniqueFailures.length === 0,
    verdict: uniqueFailures.length === 0 ? "APPROVE_TAKE" : "REPAIR_TAKE",
    intended_vs_rendered: true,
    checks,
    failures: uniqueFailures,
    average_score_cannot_override_mismatch: true,
  });
}

export const CreativeStillDailiesRuntime = Object.freeze({
  contract: CONTRACT,
  evaluate: evaluateCreativeStillDailies,
});

export default CreativeStillDailiesRuntime;
