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
  for (const row of exactRows) {
    const metadata = object(row?.metadata);
    const outcome = text(metadata.outcome, 80).toUpperCase();
    if (!["VERIFIED_SUCCESS", "VERIFIED_FAILURE"].includes(outcome)) continue;
    if (outcome === "VERIFIED_FAILURE" && text(metadata.failure_class, 80) !== "BUSINESS_OUTCOME_FAILURE") continue;
    const historicalBackfill = metadata.backfilled_from_historical_verified_execution === true;
    weightedEvidenceUnits += historicalBackfill ? 0.6 : 1;
    if (historicalBackfill) historicalBackfillCount += 1;
    else liveVerifiedCount += 1;
    if (outcome === "VERIFIED_FAILURE") verifiedFailureCount += 1;
  }
  return {
    contract: AVANTIQO_CAPABILITY_OUTCOME_EVIDENCE_CONTRACT,
    score: Number(Math.min(1, weightedEvidenceUnits / 5).toFixed(4)),
    weighted_evidence_units: Number(weightedEvidenceUnits.toFixed(4)),
    live_verified_count: liveVerifiedCount,
    historical_backfill_count: historicalBackfillCount,
    verified_failure_count: verifiedFailureCount,
    counted_outcome_count: liveVerifiedCount + historicalBackfillCount,
    live_outcome_weight: 1,
    historical_backfill_weight: 0.6,
    non_business_failures_excluded: true,
    prerequisite_failures_excluded: true,
    runtime_model_failures_excluded: true,
    authority_effect: "NONE",
  };
}

export const AvantiqoCapabilityOutcomeEvidenceRuntime = Object.freeze({
  contract: AVANTIQO_CAPABILITY_OUTCOME_EVIDENCE_CONTRACT,
  assess: weightedCapabilityOutcomeEvidence,
});
