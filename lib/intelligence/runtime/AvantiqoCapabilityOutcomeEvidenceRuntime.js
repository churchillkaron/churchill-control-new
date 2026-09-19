export const AVANTIQO_CAPABILITY_OUTCOME_EVIDENCE_CONTRACT =
  "AVANTIQO_CAPABILITY_OUTCOME_EVIDENCE_V1";

const text = (value, limit = 6000) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];

function exactCapability(row) {
  const metadata = object(row?.metadata);
  return text(metadata.capability_key || metadata.binding_key || row?.subject, 300);
}

export function weightedCapabilityOutcomeEvidence(rows = [], capabilityKey = null) {
  const exactRows = list(rows).filter((row) => !capabilityKey || exactCapability(row) === capabilityKey);
  let liveVerifiedCount = 0;
  let historicalBackfillCount = 0;
  let verifiedFailureCount = 0;
  let weightedEvidenceUnits = 0;
  let weightedSuccessUnits = 0;
  let weightedFailureUnits = 0;
  for (const row of exactRows) {
    const metadata = object(row?.metadata);
    const outcome = text(metadata.outcome, 80).toUpperCase();
    if (!["VERIFIED_SUCCESS", "VERIFIED_FAILURE"].includes(outcome)) continue;
    if (outcome === "VERIFIED_FAILURE" && text(metadata.failure_class, 80) !== "BUSINESS_OUTCOME_FAILURE") continue;
    const historicalBackfill = metadata.backfilled_from_historical_verified_execution === true;
    const weight = historicalBackfill ? 0.6 : 1;
    weightedEvidenceUnits += weight;
    if (outcome === "VERIFIED_SUCCESS") weightedSuccessUnits += weight;
    if (outcome === "VERIFIED_FAILURE") weightedFailureUnits += weight;
    if (historicalBackfill) historicalBackfillCount += 1;
    else liveVerifiedCount += 1;
    if (outcome === "VERIFIED_FAILURE") verifiedFailureCount += 1;
  }
  const effectiveN = weightedSuccessUnits + weightedFailureUnits;
  const reliabilityEstimate = effectiveN > 0 ? (weightedSuccessUnits + 2) / (effectiveN + 4) : null;
  const reliabilityConfidence = effectiveN > 0 ? Math.min(1, effectiveN / 8) : 0;
  const experienceStrength = Math.min(1, effectiveN / 8);
  const maturity = effectiveN === 0 ? "UNPROVEN" : effectiveN < 2 ? "EARLY" : effectiveN < 5 ? "DEVELOPING" : "ESTABLISHED";
  const calibratedScore = reliabilityEstimate === null ? 0 : experienceStrength * reliabilityEstimate;
  return {
    contract: AVANTIQO_CAPABILITY_OUTCOME_EVIDENCE_CONTRACT,
    score: Number(calibratedScore.toFixed(4)),
    weighted_evidence_units: Number(weightedEvidenceUnits.toFixed(4)),
    weighted_success_units: Number(weightedSuccessUnits.toFixed(4)),
    weighted_failure_units: Number(weightedFailureUnits.toFixed(4)),
    reliability_estimate: reliabilityEstimate === null ? null : Number(reliabilityEstimate.toFixed(4)),
    reliability_confidence: Number(reliabilityConfidence.toFixed(4)),
    experience_strength: Number(experienceStrength.toFixed(4)),
    reliability_maturity: maturity,
    live_verified_count: liveVerifiedCount,
    historical_backfill_count: historicalBackfillCount,
    verified_failure_count: verifiedFailureCount,
    counted_outcome_count: liveVerifiedCount + historicalBackfillCount,
    live_outcome_weight: 1,
    historical_backfill_weight: 0.6,
    non_business_failures_excluded: true,
    prerequisite_failures_excluded: true,
    runtime_model_failures_excluded: true,
    no_evidence_means_unproven_not_unreliable: true,
    bayesian_prior_alpha: 2,
    bayesian_prior_beta: 2,
    authority_effect: "NONE",
  };
}

export const AvantiqoCapabilityOutcomeEvidenceRuntime = Object.freeze({
  contract: AVANTIQO_CAPABILITY_OUTCOME_EVIDENCE_CONTRACT,
  assess: weightedCapabilityOutcomeEvidence,
});
