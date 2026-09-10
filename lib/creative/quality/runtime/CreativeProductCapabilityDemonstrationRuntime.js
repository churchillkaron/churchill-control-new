function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function meaningful(value, minimum = 16) {
  const source = text(value);
  if (source.length < minimum) return false;
  return !/^(?:premium|cinematic|beautiful|powerful|innovative|advanced|best|fast|luxury|performance|technology|feature)$/i.test(source);
}
function add(failures, condition, code) { if (!condition) failures.push(code); }

export function creativeProductCapabilityDemonstrationFailures(shot = {}) {
  const demo = object(shot.product_capability_demonstration);
  const mode = text(demo.mode).toUpperCase();
  if (!mode || mode === "NOT_APPLICABLE") return [];
  const failures = [];
  add(failures, ["EMBODIED_USE", "ENGINEERING_PROOF", "CONSEQUENCE_PROOF"].includes(mode), "SHOT_PRODUCT_CAPABILITY_MODE_INVALID");
  add(failures, meaningful(demo.capability, 12), "SHOT_PRODUCT_CAPABILITY_REQUIRED");
  add(failures, meaningful(demo.human_intent, 20), "SHOT_PRODUCT_HUMAN_INTENT_REQUIRED");
  add(failures, meaningful(demo.physical_action, 20), "SHOT_PRODUCT_PHYSICAL_ACTION_REQUIRED");
  add(failures, meaningful(demo.visible_response, 20), "SHOT_PRODUCT_VISIBLE_RESPONSE_REQUIRED");
  add(failures, meaningful(demo.felt_advantage, 20), "SHOT_PRODUCT_FELT_ADVANTAGE_REQUIRED");
  add(failures, meaningful(demo.proof_frame, 20), "SHOT_PRODUCT_PROOF_FRAME_REQUIRED");
  add(failures, list(demo.failure_substitutes).length >= 2, "SHOT_PRODUCT_DEMO_FAILURE_SUBSTITUTES_REQUIRED");
  if (mode === "ENGINEERING_PROOF") add(failures, list(demo.evidence_refs).length >= 1, "SHOT_PRODUCT_ENGINEERING_EVIDENCE_REQUIRED");
  return [...new Set(failures)];
}

export const CreativeProductCapabilityDemonstrationRuntime = Object.freeze({
  contract: "CREATIVE_PRODUCT_CAPABILITY_DEMONSTRATION_V1",
  evaluate(shot = {}) {
    const failures = creativeProductCapabilityDemonstrationFailures(shot);
    return Object.freeze({ passed: failures.length === 0, score: failures.length ? 0 : 100, failures });
  },
});
