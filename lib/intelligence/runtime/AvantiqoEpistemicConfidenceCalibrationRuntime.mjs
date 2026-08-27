export const AVANTIQO_EPISTEMIC_CONFIDENCE_CALIBRATION_CONTRACT =
  "AVANTIQO_EPISTEMIC_CONFIDENCE_CALIBRATION_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizedStrings(value, maximum = 16) {
  return list(value)
    .map((item) => text(typeof item === "string" ? item : item?.text || item?.statement || item?.question, 1000))
    .filter(Boolean)
    .slice(0, maximum);
}

function addCeiling(rows, code, ceiling, active = true) {
  if (!active) return;
  rows.push({ code, ceiling: bounded(ceiling, 1) });
}

function confidenceBand(value) {
  if (value >= 0.9) return "high";
  if (value >= 0.75) return "moderate";
  if (value >= 0.55) return "guarded";
  return "low";
}

export function calibrateAvantiqoEpistemicConfidence({ result = {}, route = {} } = {}) {
  const source = object(result);
  const epistemic = object(source.epistemic_state);
  const requirements = object(object(route).requirements);
  const rawConfidence = bounded(source.confidence, 0.5);
  const ceilings = [];

  const contradictions = normalizedStrings(epistemic.unresolved_contradictions);
  const assumptions = normalizedStrings(epistemic.critical_assumptions);
  const questions = normalizedStrings(epistemic.unresolved_questions);
  const gateViolations = normalizedStrings(epistemic.gate_violations);
  const informationSufficient = epistemic.information_sufficient;
  const conflictStatus = text(epistemic.conflict_status, 40).toLowerCase();
  const stopReason = text(epistemic.stop_reason, 60).toLowerCase();

  addCeiling(ceilings, "UNRESOLVED_CONTRADICTIONS", 0.45, contradictions.length > 0);
  addCeiling(
    ceilings,
    "CONFLICT_RECONCILIATION_UNPROVEN",
    0.5,
    conflictStatus === "unresolved" ||
      (epistemic.conflict_resolution_required === true && epistemic.conflict_resolution_proven !== true),
  );
  addCeiling(ceilings, "INFORMATION_EXPLICITLY_INSUFFICIENT", 0.5, informationSufficient === false);
  addCeiling(ceilings, "STOP_REASON_BLOCKED", 0.5, stopReason === "blocked");
  addCeiling(ceilings, "MORE_RESEARCH_NEEDED", 0.55, stopReason === "more_research_needed");

  addCeiling(
    ceilings,
    "REQUIRED_RESEARCH_NOT_PROVEN",
    0.58,
    requirements.research_required === true &&
      !(
        text(epistemic.research_status, 40).toLowerCase() === "satisfied" &&
        epistemic.research_tool_observed === true &&
        epistemic.research_stop_proven === true
      ),
  );
  addCeiling(
    ceilings,
    "REQUIRED_LIVE_READ_NOT_PROVEN",
    0.58,
    requirements.live_read_required === true &&
      !(
        text(epistemic.live_read_status, 40).toLowerCase() === "satisfied" &&
        epistemic.live_read_tool_observed === true
      ),
  );
  addCeiling(
    ceilings,
    "REQUIRED_VERIFICATION_NOT_PROVEN",
    0.6,
    requirements.verification_required === true &&
      !(
        text(epistemic.verification_status, 40).toLowerCase() === "verified" &&
        epistemic.verification_tool_observed === true
      ),
  );

  addCeiling(ceilings, "COMPLETION_GATE_VIOLATIONS_PRESENT", 0.62, gateViolations.length > 0);
  addCeiling(ceilings, "MULTIPLE_CRITICAL_ASSUMPTIONS", 0.72, assumptions.length >= 2);
  addCeiling(ceilings, "CRITICAL_ASSUMPTION_REMAINS", 0.78, assumptions.length === 1);
  addCeiling(ceilings, "MULTIPLE_UNRESOLVED_QUESTIONS", 0.76, questions.length >= 2);
  addCeiling(ceilings, "UNRESOLVED_QUESTION_REMAINS", 0.82, questions.length === 1);

  const deterministicCeiling = ceilings.length
    ? Math.min(...ceilings.map((row) => row.ceiling))
    : 1;
  const calibrated = Math.min(rawConfidence, deterministicCeiling);

  return {
    ...source,
    confidence: Number(calibrated.toFixed(4)),
    confidence_calibration: {
      contract: AVANTIQO_EPISTEMIC_CONFIDENCE_CALIBRATION_CONTRACT,
      raw_model_confidence: Number(rawConfidence.toFixed(4)),
      deterministic_ceiling: Number(deterministicCeiling.toFixed(4)),
      calibrated_confidence: Number(calibrated.toFixed(4)),
      confidence_band: confidenceBand(calibrated),
      lowered: calibrated < rawConfidence,
      reasons: ceilings
        .sort((left, right) => left.ceiling - right.ceiling || left.code.localeCompare(right.code))
        .slice(0, 16),
      calibration_only: true,
      completion_authority: false,
      execution_authority: false,
      model_numeric_confidence_never_overrides_epistemic_ceiling: true,
      confidence_never_increased: calibrated <= rawConfidence,
      raw_reasoning_persisted: false,
    },
  };
}

export const AvantiqoEpistemicConfidenceCalibrationRuntime = Object.freeze({
  contract: AVANTIQO_EPISTEMIC_CONFIDENCE_CALIBRATION_CONTRACT,
  calibrate: calibrateAvantiqoEpistemicConfidence,
});
