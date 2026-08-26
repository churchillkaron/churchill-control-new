import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT =
  "AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_V1";

const ACTIVE_SELECTION_CONTRACT = "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1";
const EXECUTION_RECEIPT_CONTRACT = "AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1";
const SCIENTIFIC_RESULT_CONTRACT = "AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_V1";
const TRANSFER_RESULT_CONTRACT = "AVANTIQO_LEARNING_TRANSFER_VALIDATION_V1";
const MEMORY_TABLE = "intelligence_memories";
const ESTIMATE_SCOPE = "platform_learning_experiment_information_estimates";
const RECEIPT_SCOPE = "platform_learning_experiment_execution_receipts";
const SCIENTIFIC_RESULT_SCOPE = "platform_learning_experiment_results";
const TRANSFER_RESULT_SCOPE = "platform_learning_transfer_experiment_results";
const OUTCOME_ASSESSMENT_SCOPE =
  "platform_learning_experiment_information_outcome_assessments";
const CALIBRATION_EVENT_SCOPE =
  "platform_learning_experiment_estimator_calibration_events";
export const AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_SCOPE =
  "platform_learning_experiment_estimator_calibrations";

const MAX_ROWS = 5000;
const CALIBRATION_LOOKBACK_DAYS = 180;
const CALIBRATION_RETENTION_DAYS = 730;
const PROFILE_VALIDITY_DAYS = 30;
const MIN_CALIBRATION_EVENTS = 3;
const MIN_DISTINCT_EXPERIMENTS = 2;
const MIN_INFORMATION_GAIN_EVENTS = 3;
const MIN_INDEPENDENT_OUTCOME_ASSESSORS = 2;
const MIN_OUTCOME_ASSESSMENT_METHODS = 2;
const COST_UNDERESTIMATE_TOLERANCE = 0.15;
const COST_UNSAFE_RATE = 0.67;
const COST_UNSAFE_MEAN_RATIO = 0.25;
const LOW_RISK_FAILURE_THRESHOLD = 0.35;
const RISK_UNSAFE_FAILURE_COUNT = 2;
const RISK_UNSAFE_LOW_RISK_FAILURE_RATE = 0.67;
const INFORMATION_GAIN_OVERESTIMATE_TOLERANCE_BITS = 0.25;
const INFORMATION_GAIN_UNSAFE_RATE = 0.67;
const INFORMATION_GAIN_UNSAFE_MEAN_FRACTION = 0.35;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return text(value, 4000).toLowerCase();
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function fingerprint(value, code) {
  const candidate = normalized(value);
  if (!/^[a-f0-9]{16,128}$/.test(candidate)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_${code}_INVALID`,
    );
  }
  return candidate;
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function boundedNumber(value, code, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_${code}_INVALID`,
    );
  }
  return number;
}

function validIso(value, code) {
  const candidate = text(value, 120);
  const parsed = Date.parse(candidate);
  if (!candidate || !Number.isFinite(parsed)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_${code}_INVALID`,
    );
  }
  if (parsed > Date.now() + 5 * 60 * 1000) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_${code}_FUTURE`,
    );
  }
  return new Date(parsed).toISOString();
}

function plusDays(value, days) {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 2000)).filter(Boolean))];
}

function mean(values) {
  const finite = list(values).map(Number).filter(Number.isFinite);
  if (!finite.length) return 0;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

async function loadEstimate(organizationId, estimateFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", ESTIMATE_SCOPE)
    .eq("metadata->>estimate_fingerprint", estimateFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadReceipt(organizationId, receiptFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", RECEIPT_SCOPE)
    .eq("metadata->>execution_receipt_fingerprint", receiptFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadExistingOutcomeAssessment(
  organizationId,
  assessmentFingerprint,
) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", OUTCOME_ASSESSMENT_SCOPE)
    .eq("metadata->>assessment_fingerprint", assessmentFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function resultEvidenceExists({
  organizationId,
  experimentFingerprint,
  evidenceFingerprint,
}) {
  const [scientific, transfer] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,metadata")
      .eq("organization_id", organizationId)
      .eq("memory_scope", SCIENTIFIC_RESULT_SCOPE)
      .eq("metadata->>experiment_fingerprint", experimentFingerprint)
      .eq("metadata->>evidence_fingerprint", evidenceFingerprint)
      .eq("active", true)
      .limit(1),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,metadata")
      .eq("organization_id", organizationId)
      .eq("memory_scope", TRANSFER_RESULT_SCOPE)
      .eq("metadata->>experiment_fingerprint", experimentFingerprint)
      .eq("metadata->>evidence_fingerprint", evidenceFingerprint)
      .eq("active", true)
      .limit(1),
  ]);
  if (scientific.error) throw scientific.error;
  if (transfer.error) throw transfer.error;

  const scientificMatch = list(scientific.data).some((row) => {
    const metadata = object(row.metadata);
    return text(metadata.contract, 180) === SCIENTIFIC_RESULT_CONTRACT &&
      metadata.verified_result === true;
  });
  const transferMatch = list(transfer.data).some((row) => {
    const metadata = object(row.metadata);
    return text(metadata.contract, 180) === TRANSFER_RESULT_CONTRACT &&
      metadata.governed_experiment_result === true;
  });
  return scientificMatch || transferMatch;
}

export async function recordAvantiqoExperimentInformationOutcomeAssessment({
  assessment_fingerprint,
  execution_receipt_fingerprint,
  estimate_fingerprint,
  assessor_fingerprint,
  assessment_method,
  observed_current_uncertainty_bits,
  observed_posterior_uncertainty_bits,
  assessed_at,
  independent_assessor = false,
  customer_private_content_used = false,
  customer_identifiers_used = false,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }

  const assessmentFingerprint = fingerprint(
    assessment_fingerprint,
    "ASSESSMENT_FINGERPRINT",
  );
  const receiptFingerprint = fingerprint(
    execution_receipt_fingerprint,
    "EXECUTION_RECEIPT_FINGERPRINT",
  );
  const estimateFingerprint = fingerprint(
    estimate_fingerprint,
    "ESTIMATE_FINGERPRINT",
  );
  const assessorFingerprint = fingerprint(
    assessor_fingerprint,
    "ASSESSOR_FINGERPRINT",
  );
  const assessmentMethod = text(assessment_method, 240);
  if (!assessmentMethod) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_ASSESSMENT_METHOD_REQUIRED`,
    );
  }
  if (independent_assessor !== true) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_INDEPENDENT_ASSESSOR_REQUIRED`,
    );
  }
  if (customer_private_content_used === true || customer_identifiers_used === true) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_CUSTOMER_PRIVATE_ASSESSMENT_FORBIDDEN`,
    );
  }

  const currentUncertainty = boundedNumber(
    observed_current_uncertainty_bits,
    "OBSERVED_CURRENT_UNCERTAINTY_BITS",
    0,
    64,
  );
  const posteriorUncertainty = boundedNumber(
    observed_posterior_uncertainty_bits,
    "OBSERVED_POSTERIOR_UNCERTAINTY_BITS",
    0,
    64,
  );
  if (posteriorUncertainty > currentUncertainty) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_NEGATIVE_OBSERVED_INFORMATION_GAIN`,
    );
  }
  const assessedAt = validIso(assessed_at, "ASSESSED_AT");

  const [estimate, receipt] = await Promise.all([
    loadEstimate(organizationId, estimateFingerprint),
    loadReceipt(organizationId, receiptFingerprint),
  ]);
  if (!estimate) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_ESTIMATE_NOT_FOUND`,
    );
  }
  if (!receipt || receipt.active !== true) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_EXECUTION_RECEIPT_NOT_FOUND`,
    );
  }

  const estimateMetadata = object(estimate.metadata);
  const receiptMetadata = object(receipt.metadata);
  if (
    text(estimateMetadata.contract, 180) !== ACTIVE_SELECTION_CONTRACT ||
    text(estimateMetadata.status, 180) !==
      "GOVERNED_INFORMATION_GAIN_ESTIMATE_RECORDED" ||
    estimateMetadata.independent_estimator_attested !== true
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_ESTIMATE_NOT_GOVERNED`,
    );
  }
  if (
    text(receiptMetadata.contract, 180) !== EXECUTION_RECEIPT_CONTRACT ||
    text(receiptMetadata.status, 180) !== "IMMUTABLE_EXECUTION_RECEIPT_RECORDED" ||
    receiptMetadata.immutable_provenance_record !== true ||
    text(receiptMetadata.execution_status, 80) !== "COMPLETED"
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_COMPLETED_IMMUTABLE_RECEIPT_REQUIRED`,
    );
  }
  if (
    text(estimateMetadata.experiment_fingerprint, 128) !==
      text(receiptMetadata.experiment_fingerprint, 128) ||
    text(estimateMetadata.experiment_version_fingerprint, 128) !==
      text(receiptMetadata.experiment_version_fingerprint, 128)
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_ESTIMATE_RECEIPT_VERSION_MISMATCH`,
    );
  }

  const hasResultEvidence = await resultEvidenceExists({
    organizationId,
    experimentFingerprint: text(receiptMetadata.experiment_fingerprint, 128),
    evidenceFingerprint: text(receiptMetadata.evidence_fingerprint, 128),
  });
  if (!hasResultEvidence) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_GOVERNED_RESULT_EVIDENCE_REQUIRED`,
    );
  }

  const observedInformationGainBits = currentUncertainty - posteriorUncertainty;
  const assessmentMethodFingerprint = digest(
    "experiment-information-outcome-assessment-method",
    assessmentMethod,
  );
  const existing = await loadExistingOutcomeAssessment(
    organizationId,
    assessmentFingerprint,
  );
  if (existing) {
    const metadata = object(existing.metadata);
    const immutableMatch = Boolean(
      text(metadata.execution_receipt_fingerprint, 128) === receiptFingerprint &&
        text(metadata.estimate_fingerprint, 128) === estimateFingerprint &&
        text(metadata.assessor_fingerprint, 128) === assessorFingerprint &&
        Number(metadata.observed_current_uncertainty_bits) === currentUncertainty &&
        Number(metadata.observed_posterior_uncertainty_bits) === posteriorUncertainty
    );
    if (!immutableMatch) {
      throw new Error(
        `${AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT}_ASSESSMENT_FINGERPRINT_COLLISION`,
      );
    }
    return {
      success: true,
      contract: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT,
      status: "INFORMATION_OUTCOME_ASSESSMENT_ALREADY_RECORDED",
      assessment: existing,
      idempotent: true,
    };
  }

  const nowIso = new Date().toISOString();
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: OUTCOME_ASSESSMENT_SCOPE,
    memory_key: `experiment-information-outcome-assessment:${assessmentFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Information outcome assessment ${estimateFingerprint.slice(0, 16)}`,
    content:
      "Independent structural post-result uncertainty assessment for estimator calibration. It is not an experiment result, execution authorization, reusable knowledge item, or training signal.",
    importance: 0.9,
    confidence: 1,
    source: "governed_experiment_information_outcome_assessment",
    active: true,
    valid_until: plusDays(assessedAt, CALIBRATION_RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT,
      status: "INDEPENDENT_INFORMATION_OUTCOME_ASSESSMENT_RECORDED",
      assessment_fingerprint: assessmentFingerprint,
      execution_receipt_fingerprint: receiptFingerprint,
      estimate_fingerprint: estimateFingerprint,
      estimator_fingerprint: text(estimateMetadata.estimator_fingerprint, 128),
      assessor_fingerprint: assessorFingerprint,
      assessment_method: assessmentMethod,
      assessment_method_fingerprint: assessmentMethodFingerprint,
      experiment_fingerprint: text(estimateMetadata.experiment_fingerprint, 128),
      experiment_version_fingerprint: text(
        estimateMetadata.experiment_version_fingerprint,
        128,
      ),
      observed_current_uncertainty_bits: currentUncertainty,
      observed_posterior_uncertainty_bits: posteriorUncertainty,
      observed_information_gain_bits: observedInformationGainBits,
      independent_assessor_attested: true,
      governed_result_evidence_verified: true,
      two_assessments_required_for_information_gain_calibration: true,
      minimum_independent_assessors: MIN_INDEPENDENT_OUTCOME_ASSESSORS,
      minimum_assessment_methods: MIN_OUTCOME_ASSESSMENT_METHODS,
      assessment_is_not_ground_truth_by_itself: true,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      runpod_job_submitted: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_used: false,
      customer_identifiers_used: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      assessed_at: assessedAt,
      recorded_at: nowIso,
    },
    updated_at: nowIso,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,metadata")
    .single();
  if (written.error) throw written.error;
  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT,
    status: "INDEPENDENT_INFORMATION_OUTCOME_ASSESSMENT_RECORDED",
    assessment: written.data,
    governance: {
      assessment_is_ground_truth_by_itself: false,
      execution_authorized: false,
      spend_authorized: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
}

async function loadCalibrationState(organizationId) {
  const [estimates, receipts, assessments] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", ESTIMATE_SCOPE)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", RECEIPT_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", OUTCOME_ASSESSMENT_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
  ]);
  if (estimates.error) throw estimates.error;
  if (receipts.error) throw receipts.error;
  if (assessments.error) throw assessments.error;
  return {
    estimates: list(estimates.data),
    receipts: list(receipts.data),
    assessments: list(assessments.data),
  };
}

function qualifiedInformationOutcome(assessmentRows) {
  const deduped = [];
  const fingerprints = new Set();
  for (const row of list(assessmentRows)) {
    const metadata = object(row.metadata);
    const assessmentFingerprint = text(metadata.assessment_fingerprint, 128);
    if (
      !activeAndUnexpired(row) ||
      text(metadata.contract, 180) !==
        AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT ||
      text(metadata.status, 180) !==
        "INDEPENDENT_INFORMATION_OUTCOME_ASSESSMENT_RECORDED" ||
      metadata.independent_assessor_attested !== true ||
      metadata.governed_result_evidence_verified !== true ||
      !assessmentFingerprint ||
      fingerprints.has(assessmentFingerprint)
    ) {
      continue;
    }
    fingerprints.add(assessmentFingerprint);
    deduped.push(row);
  }

  const assessorFingerprints = unique(
    deduped.map((row) => object(row.metadata).assessor_fingerprint),
  );
  const methodFingerprints = unique(
    deduped.map((row) => object(row.metadata).assessment_method_fingerprint),
  );
  const qualified = Boolean(
    assessorFingerprints.length >= MIN_INDEPENDENT_OUTCOME_ASSESSORS &&
      methodFingerprints.length >= MIN_OUTCOME_ASSESSMENT_METHODS
  );
  const observedValues = deduped
    .map((row) => Number(object(row.metadata).observed_information_gain_bits))
    .filter(Number.isFinite);

  return {
    qualified,
    assessment_count: deduped.length,
    independent_assessor_count: assessorFingerprints.length,
    assessment_method_count: methodFingerprints.length,
    conservative_observed_information_gain_bits:
      qualified && observedValues.length ? Math.min(...observedValues) : null,
    assessment_fingerprints: deduped
      .map((row) => text(object(row.metadata).assessment_fingerprint, 128))
      .filter(Boolean),
  };
}

function calibrationEventRow({
  organizationId,
  estimate,
  receipt,
  assessments,
  nowIso,
}) {
  const estimateMetadata = object(estimate.metadata);
  const receiptMetadata = object(receipt.metadata);
  if (
    text(estimateMetadata.contract, 180) !== ACTIVE_SELECTION_CONTRACT ||
    text(estimateMetadata.status, 180) !==
      "GOVERNED_INFORMATION_GAIN_ESTIMATE_RECORDED" ||
    estimateMetadata.independent_estimator_attested !== true ||
    text(receiptMetadata.contract, 180) !== EXECUTION_RECEIPT_CONTRACT ||
    text(receiptMetadata.status, 180) !== "IMMUTABLE_EXECUTION_RECEIPT_RECORDED" ||
    receiptMetadata.immutable_provenance_record !== true ||
    text(estimateMetadata.experiment_fingerprint, 128) !==
      text(receiptMetadata.experiment_fingerprint, 128) ||
    text(estimateMetadata.experiment_version_fingerprint, 128) !==
      text(receiptMetadata.experiment_version_fingerprint, 128)
  ) {
    return null;
  }

  const executedAtMs = Date.parse(text(receiptMetadata.executed_at, 120));
  if (
    !Number.isFinite(executedAtMs) ||
    executedAtMs < Date.now() - CALIBRATION_LOOKBACK_DAYS * DAY_MS
  ) {
    return null;
  }

  const estimateFingerprint = text(estimateMetadata.estimate_fingerprint, 128);
  const receiptFingerprint = text(
    receiptMetadata.execution_receipt_fingerprint,
    128,
  );
  const estimatorFingerprint = text(estimateMetadata.estimator_fingerprint, 128);
  if (!estimateFingerprint || !receiptFingerprint || !estimatorFingerprint) return null;

  const estimatedCost = Number(estimateMetadata.estimated_cost_units);
  const actualCost = Number(receiptMetadata.actual_cost_units);
  const estimatedRisk = Number(estimateMetadata.estimated_execution_risk);
  const estimatedInformationGain = Number(
    estimateMetadata.estimated_information_gain_bits,
  );
  if (
    !Number.isFinite(estimatedCost) ||
    estimatedCost <= 0 ||
    !Number.isFinite(actualCost) ||
    actualCost < 0 ||
    !Number.isFinite(estimatedRisk) ||
    estimatedRisk < 0 ||
    estimatedRisk > 1 ||
    !Number.isFinite(estimatedInformationGain) ||
    estimatedInformationGain < 0
  ) {
    return null;
  }

  const executionFailed =
    text(receiptMetadata.execution_status, 80) !== "COMPLETED";
  const failureValue = executionFailed ? 1 : 0;
  const costUnderestimateRatio = Math.max(
    0,
    (actualCost - estimatedCost) / Math.max(estimatedCost, 0.000001),
  );
  const costUnderestimatedBeyondTolerance =
    actualCost > estimatedCost * (1 + COST_UNDERESTIMATE_TOLERANCE);
  const riskBrierScore = (estimatedRisk - failureValue) ** 2;
  const riskUnderestimateError = Math.max(0, failureValue - estimatedRisk);
  const lowRiskFailure = Boolean(
    executionFailed && estimatedRisk < LOW_RISK_FAILURE_THRESHOLD,
  );

  const relevantAssessments = list(assessments).filter((assessment) => {
    const metadata = object(assessment.metadata);
    return Boolean(
      text(metadata.estimate_fingerprint, 128) === estimateFingerprint &&
        text(metadata.execution_receipt_fingerprint, 128) === receiptFingerprint
    );
  });
  const informationOutcome = qualifiedInformationOutcome(relevantAssessments);
  const observedInformationGain =
    informationOutcome.conservative_observed_information_gain_bits;
  const informationGainOverestimateBits =
    informationOutcome.qualified && Number.isFinite(observedInformationGain)
      ? Math.max(0, estimatedInformationGain - observedInformationGain)
      : null;
  const informationGainOverestimatedBeyondTolerance = Boolean(
    informationOutcome.qualified &&
      Number.isFinite(observedInformationGain) &&
      estimatedInformationGain >
        observedInformationGain + INFORMATION_GAIN_OVERESTIMATE_TOLERANCE_BITS,
  );
  const informationGainOverestimateFraction =
    informationOutcome.qualified && Number.isFinite(informationGainOverestimateBits)
      ? Math.min(
          1,
          informationGainOverestimateBits /
            Math.max(estimatedInformationGain, 0.25),
        )
      : null;

  const eventFingerprint = digest(
    "estimator-calibration-event",
    estimateFingerprint,
    receiptFingerprint,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: CALIBRATION_EVENT_SCOPE,
    memory_key: `estimator-calibration-event:${eventFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Estimator calibration event ${estimatorFingerprint.slice(0, 16)}`,
    content:
      "Observed estimator calibration event tied to an immutable execution receipt. Objective cost and execution status are scored directly; information-gain accuracy is scored only when independent method-diverse outcome assessments qualify.",
    importance: 0.92,
    confidence: 1,
    source: "experiment_estimator_calibration_event",
    active: true,
    valid_until: plusDays(nowIso, CALIBRATION_RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT,
      status: "ESTIMATOR_CALIBRATION_EVENT_RECORDED",
      calibration_event_fingerprint: eventFingerprint,
      estimate_fingerprint: estimateFingerprint,
      estimator_fingerprint: estimatorFingerprint,
      estimation_method_fingerprint: text(
        estimateMetadata.estimation_method_fingerprint,
        128,
      ),
      execution_receipt_fingerprint: receiptFingerprint,
      experiment_fingerprint: text(estimateMetadata.experiment_fingerprint, 128),
      experiment_version_fingerprint: text(
        estimateMetadata.experiment_version_fingerprint,
        128,
      ),
      estimated_cost_units: estimatedCost,
      actual_cost_units: actualCost,
      cost_underestimate_ratio: costUnderestimateRatio,
      cost_underestimated_beyond_tolerance: costUnderestimatedBeyondTolerance,
      estimated_execution_risk: estimatedRisk,
      execution_failed: executionFailed,
      risk_brier_score: riskBrierScore,
      risk_underestimate_error: riskUnderestimateError,
      low_risk_failure: lowRiskFailure,
      estimated_information_gain_bits: estimatedInformationGain,
      information_gain_calibrated: informationOutcome.qualified,
      observed_information_gain_bits: informationOutcome.qualified
        ? observedInformationGain
        : null,
      information_gain_overestimate_bits: informationGainOverestimateBits,
      information_gain_overestimate_fraction:
        informationGainOverestimateFraction,
      information_gain_overestimated_beyond_tolerance:
        informationGainOverestimatedBeyondTolerance,
      information_outcome_assessment_count:
        informationOutcome.assessment_count,
      information_outcome_independent_assessor_count:
        informationOutcome.independent_assessor_count,
      information_outcome_assessment_method_count:
        informationOutcome.assessment_method_count,
      information_outcome_assessment_fingerprints:
        informationOutcome.assessment_fingerprints,
      information_gain_not_inferred_from_receipt_or_result_text: true,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      runpod_job_submitted: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      raw_reasoning_persisted: false,
      authorization_value: "none",
      calibrated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function calibrationProfileRow({ organizationId, estimatorFingerprint, events, nowIso }) {
  const metadataRows = list(events).map((row) => object(row.metadata));
  const eventCount = metadataRows.length;
  const distinctExperimentCount = unique(
    metadataRows.map((metadata) => metadata.experiment_fingerprint),
  ).length;
  const costUnderestimateEvents = metadataRows.filter(
    (metadata) => metadata.cost_underestimated_beyond_tolerance === true,
  );
  const costUnderestimateRate = ratio(costUnderestimateEvents.length, eventCount);
  const meanCostUnderestimateRatio = mean(
    metadataRows.map((metadata) => metadata.cost_underestimate_ratio),
  );
  const failureRows = metadataRows.filter(
    (metadata) => metadata.execution_failed === true,
  );
  const lowRiskFailureRows = failureRows.filter(
    (metadata) => metadata.low_risk_failure === true,
  );
  const lowRiskFailureRate = ratio(lowRiskFailureRows.length, failureRows.length);
  const meanRiskBrierScore = mean(
    metadataRows.map((metadata) => metadata.risk_brier_score),
  );
  const meanRiskUnderestimateError = mean(
    metadataRows.map((metadata) => metadata.risk_underestimate_error),
  );
  const informationRows = metadataRows.filter(
    (metadata) => metadata.information_gain_calibrated === true,
  );
  const informationOverestimateRows = informationRows.filter(
    (metadata) =>
      metadata.information_gain_overestimated_beyond_tolerance === true,
  );
  const informationOverestimateRate = ratio(
    informationOverestimateRows.length,
    informationRows.length,
  );
  const meanInformationOverestimateFraction = mean(
    informationRows.map(
      (metadata) => metadata.information_gain_overestimate_fraction,
    ),
  );

  const mature = Boolean(
    eventCount >= MIN_CALIBRATION_EVENTS &&
      distinctExperimentCount >= MIN_DISTINCT_EXPERIMENTS
  );
  const unsafeCostOptimism = Boolean(
    mature &&
      costUnderestimateRate >= COST_UNSAFE_RATE &&
      meanCostUnderestimateRatio >= COST_UNSAFE_MEAN_RATIO
  );
  const unsafeRiskOptimism = Boolean(
    mature &&
      failureRows.length >= RISK_UNSAFE_FAILURE_COUNT &&
      lowRiskFailureRate >= RISK_UNSAFE_LOW_RISK_FAILURE_RATE
  );
  const unsafeInformationGainOptimism = Boolean(
    mature &&
      informationRows.length >= MIN_INFORMATION_GAIN_EVENTS &&
      informationOverestimateRate >= INFORMATION_GAIN_UNSAFE_RATE &&
      meanInformationOverestimateFraction >=
        INFORMATION_GAIN_UNSAFE_MEAN_FRACTION
  );
  const quarantined = Boolean(
    unsafeCostOptimism || unsafeRiskOptimism || unsafeInformationGainOptimism
  );
  const status = quarantined
    ? "QUARANTINED_UNSAFE_OPTIMISM"
    : mature
      ? "CALIBRATED_ACCEPTABLE"
      : "CALIBRATION_EVIDENCE_INSUFFICIENT";
  const profileFingerprint = digest(
    "estimator-calibration-profile",
    estimatorFingerprint,
  );

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_SCOPE,
    memory_key: `experiment-estimator-calibration:${profileFingerprint.slice(0, 40)}`,
    memory_type: quarantined ? "lesson" : "evidence",
    subject: `Experiment estimator calibration ${estimatorFingerprint.slice(0, 16)}`,
    content:
      "Trailing-window calibration profile for an experiment estimator. Unsafe optimistic calibration can reduce selection qualification influence, but calibration can never improve an experiment score or authorize execution.",
    importance: quarantined ? 0.99 : 0.88,
    confidence: mature ? 0.95 : 0.7,
    source: "experiment_estimator_calibration_profile",
    active: true,
    valid_until: plusDays(nowIso, PROFILE_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT,
      status,
      calibration_profile_fingerprint: profileFingerprint,
      estimator_fingerprint: estimatorFingerprint,
      calibration_event_count: eventCount,
      distinct_experiment_count: distinctExperimentCount,
      cost_underestimate_event_count: costUnderestimateEvents.length,
      cost_underestimate_rate: Number(costUnderestimateRate.toFixed(6)),
      mean_cost_underestimate_ratio: Number(
        meanCostUnderestimateRatio.toFixed(6),
      ),
      execution_failure_count: failureRows.length,
      low_risk_failure_count: lowRiskFailureRows.length,
      low_risk_failure_rate: Number(lowRiskFailureRate.toFixed(6)),
      mean_risk_brier_score: Number(meanRiskBrierScore.toFixed(6)),
      mean_risk_underestimate_error: Number(
        meanRiskUnderestimateError.toFixed(6),
      ),
      information_gain_calibrated_event_count: informationRows.length,
      information_gain_overestimate_event_count:
        informationOverestimateRows.length,
      information_gain_overestimate_rate: Number(
        informationOverestimateRate.toFixed(6),
      ),
      mean_information_gain_overestimate_fraction: Number(
        meanInformationOverestimateFraction.toFixed(6),
      ),
      unsafe_cost_optimism: unsafeCostOptimism,
      unsafe_risk_optimism: unsafeRiskOptimism,
      unsafe_information_gain_optimism: unsafeInformationGainOptimism,
      unsafe_optimism_quarantine_active: quarantined,
      minimum_calibration_events: MIN_CALIBRATION_EVENTS,
      minimum_distinct_experiments: MIN_DISTINCT_EXPERIMENTS,
      minimum_information_gain_events: MIN_INFORMATION_GAIN_EVENTS,
      calibration_lookback_days: CALIBRATION_LOOKBACK_DAYS,
      calibration_can_only_reduce_selection_qualification_influence: true,
      calibration_never_improves_estimate_score: true,
      quarantined_estimates_must_remain_in_conservative_numeric_aggregation:
        true,
      self_reported_confidence_cannot_override_calibration: true,
      information_gain_not_inferred_without_independent_outcome_assessments:
        true,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      runpod_job_submitted: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      raw_reasoning_persisted: false,
      authorization_value: "none",
      calibrated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  let count = 0;
  for (let index = 0; index < rows.length; index += 100) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(rows.slice(index, index + 100), {
        onConflict: "organization_id,memory_scope,memory_key",
      })
      .select("id");
    if (result.error) throw result.error;
    count += list(result.data).length;
  }
  return count;
}

export async function reconcileAvantiqoExperimentEstimatorCalibration({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      calibration_event_count: 0,
      calibration_profile_count: 0,
    };
  }

  const state = await loadCalibrationState(organizationId);
  const nowIso = new Date().toISOString();
  const events = [];
  for (const receipt of state.receipts) {
    const receiptMetadata = object(receipt.metadata);
    const experimentFingerprint = text(
      receiptMetadata.experiment_fingerprint,
      128,
    );
    const versionFingerprint = text(
      receiptMetadata.experiment_version_fingerprint,
      128,
    );
    if (!experimentFingerprint || !versionFingerprint) continue;

    const matchingEstimates = state.estimates.filter((estimate) => {
      const metadata = object(estimate.metadata);
      return Boolean(
        text(metadata.experiment_fingerprint, 128) === experimentFingerprint &&
          text(metadata.experiment_version_fingerprint, 128) === versionFingerprint
      );
    });
    for (const estimate of matchingEstimates) {
      const event = calibrationEventRow({
        organizationId,
        estimate,
        receipt,
        assessments: state.assessments,
        nowIso,
      });
      if (event) events.push(event);
    }
  }

  const eventsByEstimator = new Map();
  for (const event of events) {
    const estimatorFingerprint = text(
      object(event.metadata).estimator_fingerprint,
      128,
    );
    if (!estimatorFingerprint) continue;
    if (!eventsByEstimator.has(estimatorFingerprint)) {
      eventsByEstimator.set(estimatorFingerprint, []);
    }
    eventsByEstimator.get(estimatorFingerprint).push(event);
  }
  const profiles = [...eventsByEstimator.entries()].map(
    ([estimatorFingerprint, estimatorEvents]) =>
      calibrationProfileRow({
        organizationId,
        estimatorFingerprint,
        events: estimatorEvents,
        nowIso,
      }),
  );

  let eventWriteCount = 0;
  let profileWriteCount = 0;
  if (persist) {
    eventWriteCount = await upsertRows(events);
    profileWriteCount = await upsertRows(profiles);
  }

  const quarantinedProfiles = profiles.filter(
    (row) => object(row.metadata).status === "QUARANTINED_UNSAFE_OPTIMISM",
  );
  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT,
    status: profiles.length
      ? "ESTIMATOR_CALIBRATION_RECONCILED"
      : "NO_EXECUTED_ESTIMATES_AVAILABLE_FOR_CALIBRATION",
    estimate_count: state.estimates.length,
    execution_receipt_count: state.receipts.length,
    outcome_assessment_count: state.assessments.length,
    calibration_event_count: events.length,
    calibration_event_write_count: eventWriteCount,
    calibration_profile_count: profiles.length,
    calibration_profile_write_count: profileWriteCount,
    quarantined_estimator_count: quarantinedProfiles.length,
    thresholds: {
      minimum_calibration_events: MIN_CALIBRATION_EVENTS,
      minimum_distinct_experiments: MIN_DISTINCT_EXPERIMENTS,
      minimum_information_gain_events: MIN_INFORMATION_GAIN_EVENTS,
      minimum_independent_outcome_assessors:
        MIN_INDEPENDENT_OUTCOME_ASSESSORS,
      minimum_outcome_assessment_methods: MIN_OUTCOME_ASSESSMENT_METHODS,
      cost_underestimate_tolerance: COST_UNDERESTIMATE_TOLERANCE,
      cost_unsafe_rate: COST_UNSAFE_RATE,
      cost_unsafe_mean_ratio: COST_UNSAFE_MEAN_RATIO,
      low_risk_failure_threshold: LOW_RISK_FAILURE_THRESHOLD,
      risk_unsafe_failure_count: RISK_UNSAFE_FAILURE_COUNT,
      risk_unsafe_low_risk_failure_rate:
        RISK_UNSAFE_LOW_RISK_FAILURE_RATE,
      information_gain_overestimate_tolerance_bits:
        INFORMATION_GAIN_OVERESTIMATE_TOLERANCE_BITS,
      information_gain_unsafe_rate: INFORMATION_GAIN_UNSAFE_RATE,
      information_gain_unsafe_mean_fraction:
        INFORMATION_GAIN_UNSAFE_MEAN_FRACTION,
    },
    governance: {
      information_gain_inferred_from_receipt_or_result_text: false,
      self_reported_confidence_overrides_calibration: false,
      calibration_can_improve_estimate_score: false,
      calibration_can_reduce_selection_qualification_influence: true,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      experiment_execution_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoExperimentEstimatorCalibrationRuntime = Object.freeze({
  contract: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT,
  calibrationScope: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_SCOPE,
  recordInformationOutcomeAssessment:
    recordAvantiqoExperimentInformationOutcomeAssessment,
  reconcile: reconcileAvantiqoExperimentEstimatorCalibration,
  thresholds: Object.freeze({
    minimumCalibrationEvents: MIN_CALIBRATION_EVENTS,
    minimumDistinctExperiments: MIN_DISTINCT_EXPERIMENTS,
    minimumInformationGainEvents: MIN_INFORMATION_GAIN_EVENTS,
    minimumIndependentOutcomeAssessors:
      MIN_INDEPENDENT_OUTCOME_ASSESSORS,
    minimumOutcomeAssessmentMethods: MIN_OUTCOME_ASSESSMENT_METHODS,
  }),
});
