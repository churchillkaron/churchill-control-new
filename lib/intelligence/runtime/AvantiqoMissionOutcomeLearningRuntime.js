import { createHash } from "node:crypto";

export const AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT =
  "AVANTIQO_MISSION_OUTCOME_LEARNING_V1";

export const AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS = Object.freeze({
  min_observations: 3,
  min_distinct_observation_days: 2,
  min_dominant_outcome_ratio: 0.8,
  max_pattern_observations: 200,
  history_page_size: 250,
  max_history_pages: 64,
  max_raw_history_scan: 5000,
  max_codes_per_field: 24,
});

const OUTCOME_ASSESSMENT_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_V1";
const OUTCOME_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT_V1";
const CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_CONTRACT =
  "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1";
const LEARNING_EVIDENCE_BRIDGE_CONTRACT =
  "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1";
const MEMORY_TABLE = "intelligence_memories";
const OUTCOME_SCOPE = "platform_learning_outcomes";
const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates";
const SOURCE = "verified_mission_outcome_learning";
const OUTCOMES = new Set(["success", "failure"]);
const STABILITIES = new Set(["stable", "mutable"]);
const PATTERN_FIELDS = new Set([
  "mission_family",
  "intervention_code",
  "intervention_class",
  "knowledge_domain",
  "condition_codes",
  "boundary_condition_codes",
  "failure_mode_codes",
  "stability",
]);
const CODE_RE = /^[A-Za-z][A-Za-z0-9._:-]{1,159}$/;
const TOKEN_RE = /^[A-Fa-f0-9]{32,128}$/;
const SHA256_RE = /^[A-Fa-f0-9]{64}$/;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, fallback = 0, minimum = 0, maximum = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 12000)).join("|"))
    .digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function code(value, field, required = false) {
  const normalized = text(value, 160);
  if (!normalized) {
    if (required) throw new Error(`AVANTIQO_MISSION_OUTCOME_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  if (!CODE_RE.test(normalized)) {
    throw new Error(`AVANTIQO_MISSION_OUTCOME_${field.toUpperCase()}_MUST_BE_DEIDENTIFIED_CODE`);
  }
  return normalized;
}

function codes(values, field) {
  const maximum = AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.max_codes_per_field;
  return [...new Set(list(values)
    .map((value) => code(value, field, false))
    .filter(Boolean))]
    .sort()
    .slice(0, maximum);
}

function normalizePattern(value = {}) {
  const source = object(value);
  const unknown = Object.keys(source).filter((key) => !PATTERN_FIELDS.has(key));
  if (unknown.length) {
    throw new Error(
      `AVANTIQO_MISSION_OUTCOME_PATTERN_FIELD_FORBIDDEN:${unknown.sort().join(",")}`,
    );
  }
  const stability = text(source.stability, 40).toLowerCase() || "mutable";
  if (!STABILITIES.has(stability)) {
    throw new Error("AVANTIQO_MISSION_OUTCOME_STABILITY_INVALID");
  }
  return {
    mission_family: code(source.mission_family, "mission_family", true),
    intervention_code: code(source.intervention_code, "intervention_code", true),
    intervention_class: code(source.intervention_class, "intervention_class", false),
    knowledge_domain: code(source.knowledge_domain, "knowledge_domain", true),
    condition_codes: codes(source.condition_codes, "condition_code"),
    boundary_condition_codes: codes(source.boundary_condition_codes, "boundary_condition_code"),
    failure_mode_codes: codes(source.failure_mode_codes, "failure_mode_code"),
    stability,
  };
}

function structuralOutcomeContract(value = {}) {
  const contract = object(value);
  return {
    contract: text(contract.contract, 180),
    status: text(contract.status, 120),
    outcome_contract_ready: contract.outcome_contract_ready === true,
    decision_critical: contract.decision_critical !== false,
    decision: {
      candidate_present: Boolean(text(object(contract.decision).candidate_id, 160)),
      mutates: object(contract.decision).mutates === true,
      irreversible: object(contract.decision).irreversible === true,
      requires_human: object(contract.decision).requires_human === true,
    },
    criteria: list(contract.criteria).slice(0, 24).map((criterion) => {
      const source = object(criterion);
      return {
        id: code(source.id, "criterion_id", true),
        kind: code(source.kind, "criterion_kind", true),
        comparator: code(source.comparator, "criterion_comparator", true),
        required: source.required !== false,
        failure_mode_count: list(source.failure_mode_ids).length,
        verification_rule_count: list(source.verification_criteria).length,
      };
    }),
  };
}

function structuralAssessment(value = {}) {
  const assessment = object(value);
  const decisive = list(assessment.criterion_results)
    .slice(0, 64)
    .filter((criterion) => {
      const source = object(criterion);
      return ["SATISFIED", "NOT_SATISFIED"].includes(text(source.status, 60).toUpperCase()) &&
        Number(source.exact_source_observation_count || 0) > 0 &&
        list(source.evidence_ids).length > 0;
    });
  return {
    contract: text(assessment.contract, 180),
    status: text(assessment.status, 120),
    outcome: text(assessment.outcome, 40).toLowerCase(),
    decision_success_proven: assessment.decision_success_proven === true,
    review_required: assessment.review_required === true,
    criterion_count: list(assessment.criterion_results).length,
    decisive_verified_criterion_count: decisive.length,
    evidence_reference_count: decisive.reduce(
      (sum, criterion) => sum + list(object(criterion).evidence_ids).length,
      0,
    ),
    criterion_results: list(assessment.criterion_results).slice(0, 64).map((criterion) => {
      const source = object(criterion);
      return {
        id: code(source.id, "criterion_result_id", true),
        kind: code(source.kind, "criterion_result_kind", true),
        status: code(source.status, "criterion_result_status", true),
        required: source.required !== false,
        exact_source_observation_count: Math.max(
          0,
          Number(source.exact_source_observation_count || 0),
        ),
        evidence_reference_count: list(source.evidence_ids).length,
      };
    }),
  };
}

function validateVerifiedOutcome(outcomeContract, assessment) {
  const blockers = [];
  if (
    outcomeContract.contract !== OUTCOME_CONTRACT ||
    outcomeContract.status !== "OUTCOME_CONTRACT_READY" ||
    outcomeContract.outcome_contract_ready !== true ||
    outcomeContract.decision.candidate_present !== true
  ) {
    blockers.push("READY_FALSIFIABLE_OUTCOME_CONTRACT_REQUIRED");
  }
  if (assessment.contract !== OUTCOME_ASSESSMENT_CONTRACT) {
    blockers.push("VERIFIED_OUTCOME_ASSESSMENT_CONTRACT_REQUIRED");
  }
  if (!OUTCOMES.has(assessment.outcome)) {
    blockers.push("CONCLUSIVE_SUCCESS_OR_FAILURE_OUTCOME_REQUIRED");
  }
  if (
    assessment.outcome === "success" &&
    (
      assessment.status !== "OUTCOME_SUCCEEDED" ||
      assessment.decision_success_proven !== true
    )
  ) {
    blockers.push("VERIFIED_SUCCESS_PROOF_REQUIRED");
  }
  if (assessment.outcome === "failure" && assessment.status !== "OUTCOME_FAILED") {
    blockers.push("VERIFIED_FAILURE_PROOF_REQUIRED");
  }
  if (assessment.decisive_verified_criterion_count < 1) {
    blockers.push("DECISIVE_VERIFIED_OUTCOME_EVIDENCE_REQUIRED");
  }
  return blockers;
}

function observedDay(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("AVANTIQO_MISSION_OUTCOME_OBSERVED_AT_INVALID");
  }
  return date.toISOString().slice(0, 10);
}

function learningOrganizationId(explicit = null) {
  return text(
    explicit || process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID,
    160,
  );
}

export function buildAvantiqoMissionOutcomeLearningObservation({
  pattern,
  outcome_contract,
  outcome_assessment,
  observation_token,
  organization_id,
  now = new Date(),
} = {}) {
  const organizationId = learningOrganizationId(organization_id);
  if (!organizationId) {
    throw new Error("AVANTIQO_MISSION_OUTCOME_LEARNING_ORGANIZATION_REQUIRED");
  }
  const token = text(observation_token, 160);
  if (!TOKEN_RE.test(token)) {
    throw new Error("AVANTIQO_MISSION_OUTCOME_DEIDENTIFIED_OBSERVATION_TOKEN_REQUIRED");
  }
  const normalizedPattern = normalizePattern(pattern);
  const contract = structuralOutcomeContract(outcome_contract);
  const assessment = structuralAssessment(outcome_assessment);
  const blockers = validateVerifiedOutcome(contract, assessment);
  if (blockers.length) {
    return {
      success: true,
      contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
      eligible: false,
      status: "NOT_ELIGIBLE_UNVERIFIED_MISSION_OUTCOME",
      blockers,
      row: null,
    };
  }

  const patternFingerprint = digest("mission-outcome-pattern-v1", stableJson(normalizedPattern));
  const observationFingerprint = digest(
    "mission-outcome-observation-v1",
    patternFingerprint,
    token.toLowerCase(),
  );
  const contractFingerprint = digest(
    "mission-outcome-contract-structure-v1",
    stableJson(contract),
  );
  const assessmentFingerprint = digest(
    "mission-outcome-assessment-structure-v1",
    stableJson(assessment),
  );
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const day = observedDay(now);
  const outcome = assessment.outcome.toUpperCase();

  return {
    success: true,
    contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
    eligible: true,
    status: "VERIFIED_DEIDENTIFIED_MISSION_OUTCOME_READY",
    blockers: [],
    pattern_fingerprint: patternFingerprint,
    observation_fingerprint: observationFingerprint,
    row: {
      organization_id: organizationId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: OUTCOME_SCOPE,
      memory_key: `mission-outcome-observation:${observationFingerprint.slice(0, 40)}`,
      memory_type: outcome === "SUCCESS" ? "completed_step" : "blocker",
      subject: `mission-outcome:${normalizedPattern.mission_family}:${normalizedPattern.intervention_code}`,
      content: [
        `A verified de-identified mission outcome (${outcome}) was observed for mission family ${normalizedPattern.mission_family} after intervention ${normalizedPattern.intervention_code}.`,
        "This is an observational structural signal only. It does not establish causality, current business truth, action authority, or reusable platform knowledge.",
      ].join(" "),
      importance: outcome === "SUCCESS" ? 0.72 : 0.82,
      confidence: 1,
      source: SOURCE,
      active: true,
      valid_until: null,
      superseded_by: null,
      superseded_at: null,
      forgotten_at: null,
      metadata: {
        contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
        epistemic_state: "STRUCTURAL_OUTCOME_OBSERVATION_ONLY",
        mission_outcome_pattern: true,
        pattern_fingerprint: patternFingerprint,
        observation_fingerprint: observationFingerprint,
        outcome_contract_structural_fingerprint: contractFingerprint,
        outcome_assessment_structural_fingerprint: assessmentFingerprint,
        mission_family: normalizedPattern.mission_family,
        intervention_code: normalizedPattern.intervention_code,
        intervention_class: normalizedPattern.intervention_class,
        knowledge_domain: normalizedPattern.knowledge_domain,
        condition_codes: normalizedPattern.condition_codes,
        boundary_condition_codes: normalizedPattern.boundary_condition_codes,
        failure_mode_codes: normalizedPattern.failure_mode_codes,
        stability: normalizedPattern.stability,
        verified_outcome: outcome,
        observed_day: day,
        observed_at: nowIso,
        criterion_count: assessment.criterion_count,
        decisive_verified_criterion_count: assessment.decisive_verified_criterion_count,
        evidence_reference_count: assessment.evidence_reference_count,
        source_outcome_contract: OUTCOME_CONTRACT,
        source_outcome_assessment_contract: OUTCOME_ASSESSMENT_CONTRACT,
        source_observation_token_persisted: false,
        source_evidence_ids_persisted: false,
        source_organization_id_persisted: false,
        source_party_id_persisted: false,
        source_entity_id_persisted: false,
        source_conversation_id_persisted: false,
        customer_private_content_included: false,
        customer_identifiers_included: false,
        raw_mission_text_included: false,
        raw_payload_included: false,
        raw_output_included: false,
        raw_reasoning_persisted: false,
        causal_attribution_status: "NOT_ESTABLISHED",
        causal_attribution_allowed: false,
        reusable_platform_knowledge: false,
        knowledge_router_reuse_allowed: false,
        automatic_knowledge_promotion: false,
        direct_platform_knowledge_write_allowed: false,
        automatic_training_effect: "NONE",
        automatic_model_weight_mutation: false,
        production_model_promotion_effect: "NONE",
        automatic_gpu_execution: false,
        automatic_modal_submission: false,
        authorization_value: "none",
        updated_at: nowIso,
      },
      updated_at: nowIso,
    },
  };
}

function validSha256(value) {
  return SHA256_RE.test(text(value, 128));
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function validObservationTime(observedAt, observedDayValue) {
  const timestamp = text(observedAt, 80);
  const day = text(observedDayValue, 20);
  if (!ISO_DAY_RE.test(day) || !timestamp) return false;
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) return false;
  return parsed.toISOString() === timestamp && timestamp.slice(0, 10) === day;
}

function eligibleObservationRow(row, patternFingerprint) {
  const metadata = object(row?.metadata);
  const pattern = text(metadata.pattern_fingerprint, 128);
  const observationFingerprint = text(metadata.observation_fingerprint, 128);
  const criterionCount = positiveInteger(metadata.criterion_count);
  const decisiveCount = positiveInteger(metadata.decisive_verified_criterion_count);
  const evidenceReferenceCount = positiveInteger(metadata.evidence_reference_count);
  const observedDayValue = text(metadata.observed_day, 20);
  const observedAt = text(metadata.observed_at, 80);
  return Boolean(
    row?.active === true &&
    text(row?.memory_scope, 160) === OUTCOME_SCOPE &&
    text(row?.source, 180) === SOURCE &&
    text(metadata.contract, 180) === AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT &&
    metadata.mission_outcome_pattern === true &&
    validSha256(patternFingerprint) &&
    validSha256(pattern) &&
    pattern === patternFingerprint &&
    validSha256(observationFingerprint) &&
    text(row?.memory_key, 160) === `mission-outcome-observation:${observationFingerprint.slice(0, 40)}` &&
    validSha256(metadata.outcome_contract_structural_fingerprint) &&
    validSha256(metadata.outcome_assessment_structural_fingerprint) &&
    text(metadata.source_outcome_contract, 180) === OUTCOME_CONTRACT &&
    text(metadata.source_outcome_assessment_contract, 180) === OUTCOME_ASSESSMENT_CONTRACT &&
    criterionCount !== null &&
    decisiveCount !== null &&
    decisiveCount <= criterionCount &&
    evidenceReferenceCount !== null &&
    evidenceReferenceCount >= decisiveCount &&
    validObservationTime(observedAt, observedDayValue) &&
    ["SUCCESS", "FAILURE"].includes(text(metadata.verified_outcome, 40)) &&
    metadata.customer_private_content_included !== true &&
    metadata.customer_identifiers_included !== true &&
    metadata.raw_mission_text_included !== true &&
    metadata.raw_payload_included !== true &&
    metadata.raw_output_included !== true &&
    metadata.raw_reasoning_persisted !== true &&
    metadata.reusable_platform_knowledge !== true &&
    metadata.knowledge_router_reuse_allowed !== true &&
    metadata.automatic_knowledge_promotion !== true &&
    metadata.causal_attribution_allowed !== true
  );
}

function observationStructuralSignature(row) {
  const metadata = object(row?.metadata);
  return stableJson({
    verified_outcome: text(metadata.verified_outcome, 40),
    outcome_contract_structural_fingerprint: text(
      metadata.outcome_contract_structural_fingerprint,
      128,
    ).toLowerCase(),
    outcome_assessment_structural_fingerprint: text(
      metadata.outcome_assessment_structural_fingerprint,
      128,
    ).toLowerCase(),
    criterion_count: positiveInteger(metadata.criterion_count),
    decisive_verified_criterion_count: positiveInteger(
      metadata.decisive_verified_criterion_count,
    ),
    evidence_reference_count: positiveInteger(metadata.evidence_reference_count),
    observed_day: text(metadata.observed_day, 20),
    observed_at: text(metadata.observed_at, 80),
  });
}

function uniqueEligibleObservationRows(rows, patternFingerprint) {
  const groups = new Map();
  let duplicateObservationCount = 0;

  for (const row of list(rows)) {
    if (!eligibleObservationRow(row, patternFingerprint)) continue;
    const observationFingerprint = text(
      object(row?.metadata).observation_fingerprint,
      128,
    ).toLowerCase();
    const signature = observationStructuralSignature(row);
    const existing = groups.get(observationFingerprint);
    if (!existing) {
      groups.set(observationFingerprint, {
        row,
        signature,
        row_count: 1,
        conflicted: false,
      });
      continue;
    }
    duplicateObservationCount += 1;
    existing.row_count += 1;
    if (existing.signature !== signature) existing.conflicted = true;
  }

  const uniqueRows = [];
  let conflictingObservationFingerprintCount = 0;
  let quarantinedConflictingObservationCount = 0;
  for (const group of groups.values()) {
    if (group.conflicted) {
      conflictingObservationFingerprintCount += 1;
      quarantinedConflictingObservationCount += group.row_count;
      continue;
    }
    uniqueRows.push(group.row);
  }

  return {
    rows: uniqueRows,
    duplicate_observation_count: duplicateObservationCount,
    conflicting_observation_fingerprint_count: conflictingObservationFingerprintCount,
    quarantined_conflicting_observation_count: quarantinedConflictingObservationCount,
  };
}

export function evaluateAvantiqoMissionOutcomePattern({
  observations = [],
  pattern_fingerprint,
  limits = AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
} = {}) {
  const fingerprint = text(pattern_fingerprint, 128);
  const maximum = boundedInteger(
    limits.max_pattern_observations,
    AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.max_pattern_observations,
    1,
    2000,
  );
  const suppliedRows = list(observations);
  const uniqueEligible = uniqueEligibleObservationRows(suppliedRows, fingerprint);
  const rows = uniqueEligible.rows.slice(0, maximum);
  const successCount = rows.filter(
    (row) => text(object(row.metadata).verified_outcome, 40) === "SUCCESS",
  ).length;
  const failureCount = rows.filter(
    (row) => text(object(row.metadata).verified_outcome, 40) === "FAILURE",
  ).length;
  const total = successCount + failureCount;
  const distinctDays = new Set(
    rows.map((row) => text(object(row.metadata).observed_day, 20)).filter(Boolean),
  ).size;
  const dominantOutcome = successCount === failureCount
    ? null
    : successCount > failureCount ? "SUCCESS" : "FAILURE";
  const dominantCount = Math.max(successCount, failureCount);
  const dominantRatio = total ? dominantCount / total : 0;
  const minObservations = boundedInteger(limits.min_observations, 3, 2, 50);
  const minDistinctDays = boundedInteger(limits.min_distinct_observation_days, 2, 1, 30);
  const minDominantRatio = bounded(limits.min_dominant_outcome_ratio, 0.8, 0.5, 1);
  const eligible = Boolean(
    total >= minObservations &&
    distinctDays >= minDistinctDays &&
    dominantOutcome &&
    dominantRatio >= minDominantRatio
  );

  return {
    success: true,
    contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
    status: eligible
      ? "REPEATED_OUTCOME_PATTERN_READY_FOR_EPISTEMIC_REVIEW"
      : "INSUFFICIENT_REPEATED_OUTCOME_EVIDENCE",
    eligible_for_evidence_candidate: eligible,
    pattern_fingerprint: fingerprint || null,
    observation_count: total,
    duplicate_observation_count: uniqueEligible.duplicate_observation_count,
    conflicting_observation_fingerprint_count:
      uniqueEligible.conflicting_observation_fingerprint_count,
    quarantined_conflicting_observation_count:
      uniqueEligible.quarantined_conflicting_observation_count,
    excluded_observation_count: Math.max(0, suppliedRows.length - rows.length),
    verified_success_count: successCount,
    verified_failure_count: failureCount,
    distinct_observation_days: distinctDays,
    dominant_outcome: dominantOutcome,
    dominant_outcome_ratio: Number(dominantRatio.toFixed(4)),
    history_scan_complete: true,
    history_scan_mode: "SUPPLIED_OBSERVATION_SET",
    raw_rows_scanned: suppliedRows.length,
    total_matching_rows: suppliedRows.length,
    history_pages_scanned: 0,
    history_count_stable: true,
    limits: {
      min_observations: minObservations,
      min_distinct_observation_days: minDistinctDays,
      min_dominant_outcome_ratio: minDominantRatio,
    },
    anti_overfitting: {
      single_observation_can_create_evidence_candidate: false,
      repeated_verified_outcomes_required: true,
      distinct_observation_days_required: true,
      mixed_outcomes_block_candidate_when_dominance_gate_not_met: true,
      stored_observation_integrity_revalidated: true,
      malformed_or_poisoned_observations_excluded: true,
      unique_observation_fingerprints_required: true,
      duplicate_observations_excluded: true,
      conflicting_observation_fingerprints_quarantined: true,
      row_order_cannot_resolve_observation_conflict: true,
      complete_history_scan_required: true,
      incomplete_history_blocks_evidence_candidate: true,
      raw_rows_cannot_crowd_out_unique_observation_limit: true,
      causal_attribution_established: false,
    },
  };
}

function validEvidenceCandidateEvaluation(evaluation) {
  const source = object(evaluation);
  const antiOverfitting = object(source.anti_overfitting);
  const limits = object(source.limits);
  const total = nonNegativeInteger(source.observation_count);
  const successes = nonNegativeInteger(source.verified_success_count);
  const failures = nonNegativeInteger(source.verified_failure_count);
  const distinctDays = nonNegativeInteger(source.distinct_observation_days);
  const minObservations = positiveInteger(limits.min_observations);
  const minDistinctDays = positiveInteger(limits.min_distinct_observation_days);
  const minDominantRatio = Number(limits.min_dominant_outcome_ratio);
  const reportedRatio = Number(source.dominant_outcome_ratio);

  if (
    source.contract !== AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT ||
    source.status !== "REPEATED_OUTCOME_PATTERN_READY_FOR_EPISTEMIC_REVIEW" ||
    source.eligible_for_evidence_candidate !== true ||
    source.history_scan_complete !== true ||
    source.history_count_stable !== true ||
    total === null ||
    successes === null ||
    failures === null ||
    distinctDays === null ||
    minObservations === null ||
    minDistinctDays === null ||
    !Number.isFinite(minDominantRatio) ||
    minDominantRatio < 0.5 ||
    minDominantRatio > 1 ||
    !Number.isFinite(reportedRatio) ||
    total !== successes + failures ||
    distinctDays > total ||
    total < minObservations ||
    distinctDays < minDistinctDays
  ) {
    return false;
  }

  const expectedDominantOutcome = successes === failures
    ? null
    : successes > failures ? "SUCCESS" : "FAILURE";
  const dominantCount = Math.max(successes, failures);
  const expectedRatio = total ? Number((dominantCount / total).toFixed(4)) : 0;
  if (
    !expectedDominantOutcome ||
    text(source.dominant_outcome, 40) !== expectedDominantOutcome ||
    reportedRatio !== expectedRatio ||
    expectedRatio < minDominantRatio
  ) {
    return false;
  }

  return Boolean(
    antiOverfitting.repeated_verified_outcomes_required === true &&
    antiOverfitting.distinct_observation_days_required === true &&
    antiOverfitting.stored_observation_integrity_revalidated === true &&
    antiOverfitting.malformed_or_poisoned_observations_excluded === true &&
    antiOverfitting.unique_observation_fingerprints_required === true &&
    antiOverfitting.duplicate_observations_excluded === true &&
    antiOverfitting.conflicting_observation_fingerprints_quarantined === true &&
    antiOverfitting.row_order_cannot_resolve_observation_conflict === true &&
    antiOverfitting.complete_history_scan_required === true &&
    antiOverfitting.incomplete_history_blocks_evidence_candidate === true &&
    antiOverfitting.raw_rows_cannot_crowd_out_unique_observation_limit === true &&
    antiOverfitting.causal_attribution_established === false
  );
}

export function buildAvantiqoMissionOutcomeEvidenceCandidateRow({
  pattern,
  pattern_evaluation,
  organization_id,
  now = new Date(),
} = {}) {
  const organizationId = learningOrganizationId(organization_id);
  if (!organizationId) {
    throw new Error("AVANTIQO_MISSION_OUTCOME_LEARNING_ORGANIZATION_REQUIRED");
  }
  const normalizedPattern = normalizePattern(pattern);
  const evaluation = object(pattern_evaluation);
  if (!validEvidenceCandidateEvaluation(evaluation)) {
    return null;
  }
  const expectedFingerprint = digest(
    "mission-outcome-pattern-v1",
    stableJson(normalizedPattern),
  );
  if (text(evaluation.pattern_fingerprint, 128) !== expectedFingerprint) {
    throw new Error("AVANTIQO_MISSION_OUTCOME_PATTERN_FINGERPRINT_MISMATCH");
  }
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const candidateFingerprint = digest(
    "mission-outcome-evidence-candidate-v1",
    expectedFingerprint,
    evaluation.dominant_outcome,
  );
  const topicKey = `mission-outcome-${candidateFingerprint.slice(0, 20)}`;
  const outcome = evaluation.dominant_outcome;
  const conditionText = normalizedPattern.condition_codes.length
    ? ` under de-identified condition classes ${normalizedPattern.condition_codes.join(", ")}`
    : "";
  const claim = [
    `Repeated verified de-identified mission outcomes support investigating whether intervention ${normalizedPattern.intervention_code} is associated with ${outcome} outcomes for mission family ${normalizedPattern.mission_family}${conditionText}.`,
    "This candidate is not a causal conclusion and is not reusable knowledge. Mechanism mapping, contradiction search, boundary-condition analysis, falsifiable competing hypotheses, discriminating counterfactual tests, and the existing explicit final-release pipeline are required before any reuse.",
  ].join(" ");

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: EVIDENCE_CANDIDATE_SCOPE,
    memory_key: `mission-outcome-evidence-candidate:${candidateFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Verified mission outcome pattern: ${normalizedPattern.mission_family}`,
    content: claim,
    importance: outcome === "FAILURE" ? 0.92 : 0.86,
    confidence: Math.min(0.9, 0.6 + Number(evaluation.dominant_outcome_ratio || 0) * 0.25),
    source: SOURCE,
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_CONTRACT,
      ingress_contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
      epistemic_state: "EVIDENCE_CANDIDATE_NOT_RELEASED",
      mission_outcome_evidence_candidate: true,
      candidate_fingerprint: candidateFingerprint,
      pattern_fingerprint: expectedFingerprint,
      topic_key: topicKey,
      knowledge_domain: normalizedPattern.knowledge_domain,
      jurisdiction: null,
      stability: normalizedPattern.stability,
      mission_family: normalizedPattern.mission_family,
      intervention_code: normalizedPattern.intervention_code,
      intervention_class: normalizedPattern.intervention_class,
      condition_codes: normalizedPattern.condition_codes,
      boundary_condition_codes: normalizedPattern.boundary_condition_codes,
      failure_mode_codes: normalizedPattern.failure_mode_codes,
      observed_dominant_outcome: outcome,
      observation_count: Number(evaluation.observation_count || 0),
      duplicate_observation_count: Number(evaluation.duplicate_observation_count || 0),
      conflicting_observation_fingerprint_count: Number(
        evaluation.conflicting_observation_fingerprint_count || 0,
      ),
      quarantined_conflicting_observation_count: Number(
        evaluation.quarantined_conflicting_observation_count || 0,
      ),
      verified_success_count: Number(evaluation.verified_success_count || 0),
      verified_failure_count: Number(evaluation.verified_failure_count || 0),
      distinct_observation_days: Number(evaluation.distinct_observation_days || 0),
      dominant_outcome_ratio: Number(evaluation.dominant_outcome_ratio || 0),
      history_scan_complete: true,
      history_scan_mode: text(evaluation.history_scan_mode, 80) || "SUPPLIED_OBSERVATION_SET",
      raw_rows_scanned: Number(evaluation.raw_rows_scanned || 0),
      total_matching_rows: Number(evaluation.total_matching_rows || 0),
      history_pages_scanned: Number(evaluation.history_pages_scanned || 0),
      history_count_stable: true,
      source_count: Number(evaluation.observation_count || 0),
      repeated_verified_outcome_gate_passed: true,
      anti_overfitting_gate_passed: true,
      evaluation_summary_revalidated: true,
      caller_supplied_eligibility_not_trusted: true,
      observation_count_arithmetic_revalidated: true,
      dominant_outcome_and_ratio_revalidated: true,
      evidence_thresholds_revalidated: true,
      stored_observation_integrity_revalidated: true,
      malformed_or_poisoned_observations_excluded: true,
      unique_observation_fingerprints_required: true,
      duplicate_observations_excluded: true,
      conflicting_observation_fingerprints_quarantined: true,
      row_order_cannot_resolve_observation_conflict: true,
      complete_history_scan_required: true,
      incomplete_history_blocks_evidence_candidate: true,
      raw_rows_cannot_crowd_out_unique_observation_limit: true,
      causal_attribution_status: "NOT_ESTABLISHED",
      causal_attribution_allowed: false,
      mechanism_review_required: true,
      contradiction_search_required: true,
      boundary_condition_search_required: true,
      falsifiable_competing_hypotheses_required: true,
      discriminating_counterfactual_evaluation_required: true,
      public_or_platform_safe_evidence_required_for_promotion: true,
      requires_epistemic_promotion_pipeline: true,
      next_stage_contract: LEARNING_EVIDENCE_BRIDGE_CONTRACT,
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      explicit_final_promotion_required: true,
      direct_platform_knowledge_write_allowed: false,
      prior_released_knowledge_retired: false,
      customer_private_memory: false,
      customer_private_content_included: false,
      customer_identifiers_included: false,
      source_observation_tokens_persisted: false,
      source_evidence_ids_persisted: false,
      raw_mission_text_included: false,
      raw_payload_included: false,
      raw_output_included: false,
      raw_reasoning_persisted: false,
      automatic_training_effect: "NONE",
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
      automatic_gpu_execution: false,
      automatic_modal_submission: false,
      authorization_value: "none",
      created_by: SOURCE,
      observed_at: nowIso,
      updated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function resolveDatabase(database) {
  if (database) return database;
  const module = await import("../../shared/supabase/admin.js");
  return module.supabaseAdmin;
}

function historyScanConfiguration(limits = AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS) {
  const uniqueLimit = boundedInteger(
    limits.max_pattern_observations,
    AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.max_pattern_observations,
    1,
    2000,
  );
  const pageSize = boundedInteger(
    limits.history_page_size,
    AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.history_page_size,
    1,
    1000,
  );
  const maxPages = boundedInteger(
    limits.max_history_pages,
    AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.max_history_pages,
    1,
    256,
  );
  const rawScanLimit = boundedInteger(
    limits.max_raw_history_scan,
    AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.max_raw_history_scan,
    uniqueLimit,
    50000,
  );
  return {
    unique_limit: uniqueLimit,
    page_size: pageSize,
    max_pages: maxPages,
    raw_scan_limit: rawScanLimit,
  };
}

function patternObservationQuery(client, organizationId, patternFingerprint, exactCount = false) {
  const selection = exactCount
    ? client
      .from(MEMORY_TABLE)
      .select(
        "id,memory_scope,memory_key,source,active,metadata,created_at,updated_at",
        { count: "exact" },
      )
    : client
      .from(MEMORY_TABLE)
      .select("id,memory_scope,memory_key,source,active,metadata,created_at,updated_at");
  return selection
    .eq("organization_id", organizationId)
    .eq("memory_scope", OUTCOME_SCOPE)
    .eq("active", true)
    .eq("metadata->>pattern_fingerprint", patternFingerprint)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
}

function incompleteHistoryScan(configuration, reason, extra = {}) {
  return {
    rows: list(extra.rows),
    history_scan_complete: false,
    history_scan_mode: text(extra.history_scan_mode, 80) || "SUPABASE_RANGE_EXACT_COUNT_V1",
    history_scan_reason: reason,
    raw_rows_scanned: Number(extra.raw_rows_scanned || 0),
    total_matching_rows: Number.isInteger(extra.total_matching_rows)
      ? extra.total_matching_rows
      : null,
    history_pages_scanned: Number(extra.history_pages_scanned || 0),
    history_count_stable: extra.history_count_stable === true,
    stable_row_identity: extra.stable_row_identity !== false,
    scan_limit_exceeded: extra.scan_limit_exceeded === true,
    page_limit_exceeded: extra.page_limit_exceeded === true,
    ...configuration,
  };
}

async function loadPatternObservations(
  client,
  organizationId,
  patternFingerprint,
  limits,
  { allow_legacy_injected_adapter = false } = {},
) {
  const configuration = historyScanConfiguration(limits);
  const firstQuery = patternObservationQuery(
    client,
    organizationId,
    patternFingerprint,
    true,
  );

  if (typeof firstQuery.range !== "function") {
    if (!allow_legacy_injected_adapter || typeof firstQuery.limit !== "function") {
      return incompleteHistoryScan(
        configuration,
        "ORDERED_RANGE_PAGINATION_REQUIRED",
        { history_scan_mode: "UNSUPPORTED_DATABASE_ADAPTER" },
      );
    }
    const fallback = await firstQuery.limit(configuration.raw_scan_limit);
    if (fallback.error) throw fallback.error;
    const fallbackRows = list(fallback.data);
    const complete = fallbackRows.length < configuration.raw_scan_limit;
    return {
      rows: fallbackRows,
      history_scan_complete: complete,
      history_scan_mode: "LEGACY_INJECTED_ADAPTER_LIMIT",
      history_scan_reason: complete ? null : "RAW_HISTORY_SCAN_LIMIT_EXCEEDED",
      raw_rows_scanned: fallbackRows.length,
      total_matching_rows: complete ? fallbackRows.length : null,
      history_pages_scanned: fallbackRows.length ? 1 : 0,
      history_count_stable: complete,
      stable_row_identity: true,
      scan_limit_exceeded: !complete,
      page_limit_exceeded: false,
      ...configuration,
    };
  }

  const firstTo = Math.min(
    configuration.page_size,
    configuration.raw_scan_limit,
  ) - 1;
  const firstResult = await firstQuery.range(0, firstTo);
  if (firstResult.error) throw firstResult.error;
  const initialCount = Number(firstResult.count);
  const firstRows = list(firstResult.data);
  if (!Number.isInteger(initialCount) || initialCount < 0) {
    return incompleteHistoryScan(
      configuration,
      "EXACT_HISTORY_COUNT_REQUIRED",
      {
        rows: firstRows,
        raw_rows_scanned: firstRows.length,
        history_pages_scanned: 1,
        stable_row_identity: true,
      },
    );
  }

  if (initialCount > configuration.raw_scan_limit) {
    return incompleteHistoryScan(
      configuration,
      "RAW_HISTORY_SCAN_LIMIT_EXCEEDED",
      {
        rows: firstRows,
        raw_rows_scanned: firstRows.length,
        total_matching_rows: initialCount,
        history_pages_scanned: 1,
        history_count_stable: true,
        stable_row_identity: true,
        scan_limit_exceeded: true,
      },
    );
  }

  const rows = [];
  const seenRowIds = new Set();
  let stableRowIdentity = true;
  let historyCountStable = true;
  let pagesScanned = 0;

  function appendPage(page) {
    for (const row of page) {
      const rowId = text(row?.id, 180);
      if (!rowId || seenRowIds.has(rowId)) {
        stableRowIdentity = false;
      }
      if (rowId) seenRowIds.add(rowId);
      rows.push(row);
    }
  }

  appendPage(firstRows);
  pagesScanned = 1;

  while (
    rows.length < initialCount &&
    pagesScanned < configuration.max_pages
  ) {
    const from = rows.length;
    const to = Math.min(
      from + configuration.page_size - 1,
      initialCount - 1,
      configuration.raw_scan_limit - 1,
    );
    const pageQuery = patternObservationQuery(
      client,
      organizationId,
      patternFingerprint,
      true,
    );
    if (typeof pageQuery.range !== "function") {
      return incompleteHistoryScan(
        configuration,
        "ORDERED_RANGE_PAGINATION_REQUIRED",
        {
          rows,
          raw_rows_scanned: rows.length,
          total_matching_rows: initialCount,
          history_pages_scanned: pagesScanned,
          history_count_stable: historyCountStable,
          stable_row_identity: stableRowIdentity,
        },
      );
    }
    const pageResult = await pageQuery.range(from, to);
    if (pageResult.error) throw pageResult.error;
    const pageCount = Number(pageResult.count);
    if (!Number.isInteger(pageCount) || pageCount !== initialCount) {
      historyCountStable = false;
      break;
    }
    const page = list(pageResult.data);
    pagesScanned += 1;
    if (!page.length) break;
    appendPage(page);
  }

  if (rows.length < initialCount && pagesScanned >= configuration.max_pages) {
    return incompleteHistoryScan(
      configuration,
      "HISTORY_PAGE_LIMIT_EXCEEDED",
      {
        rows,
        raw_rows_scanned: rows.length,
        total_matching_rows: initialCount,
        history_pages_scanned: pagesScanned,
        history_count_stable: historyCountStable,
        stable_row_identity: stableRowIdentity,
        page_limit_exceeded: true,
      },
    );
  }

  const verificationQuery = patternObservationQuery(
    client,
    organizationId,
    patternFingerprint,
    true,
  );
  const verificationResult = typeof verificationQuery.range === "function"
    ? await verificationQuery.range(0, 0)
    : { count: null, error: null };
  if (verificationResult.error) throw verificationResult.error;
  const finalCount = Number(verificationResult.count);
  if (!Number.isInteger(finalCount) || finalCount !== initialCount) {
    historyCountStable = false;
  }

  const complete = Boolean(
    historyCountStable &&
    stableRowIdentity &&
    rows.length === initialCount
  );
  if (!complete) {
    return incompleteHistoryScan(
      configuration,
      historyCountStable
        ? "HISTORY_ROWS_INCOMPLETE_OR_UNSTABLE"
        : "HISTORY_COUNT_CHANGED_DURING_SCAN",
      {
        rows,
        raw_rows_scanned: rows.length,
        total_matching_rows: initialCount,
        history_pages_scanned: pagesScanned,
        history_count_stable: historyCountStable,
        stable_row_identity: stableRowIdentity,
      },
    );
  }

  return {
    rows,
    history_scan_complete: true,
    history_scan_mode: "SUPABASE_RANGE_EXACT_COUNT_V1",
    history_scan_reason: null,
    raw_rows_scanned: rows.length,
    total_matching_rows: initialCount,
    history_pages_scanned: pagesScanned,
    history_count_stable: true,
    stable_row_identity: true,
    scan_limit_exceeded: false,
    page_limit_exceeded: false,
    ...configuration,
  };
}

function applyHistoryScanGate(evaluation, historyScan) {
  const scan = object(historyScan);
  const complete = scan.history_scan_complete === true;
  return {
    ...evaluation,
    status: complete
      ? evaluation.status
      : "INCOMPLETE_HISTORY_SCAN_BLOCKS_EVIDENCE_CANDIDATE",
    eligible_for_evidence_candidate:
      complete && evaluation.eligible_for_evidence_candidate === true,
    history_scan_complete: complete,
    history_scan_mode: text(scan.history_scan_mode, 80) || null,
    history_scan_reason: text(scan.history_scan_reason, 160) || null,
    raw_rows_scanned: Number(scan.raw_rows_scanned || 0),
    total_matching_rows: Number.isInteger(scan.total_matching_rows)
      ? scan.total_matching_rows
      : null,
    history_pages_scanned: Number(scan.history_pages_scanned || 0),
    history_count_stable: scan.history_count_stable === true,
    stable_row_identity: scan.stable_row_identity === true,
    raw_history_scan_limit: Number(scan.raw_scan_limit || 0),
    history_page_size: Number(scan.page_size || 0),
    max_history_pages: Number(scan.max_pages || 0),
    scan_limit_exceeded: scan.scan_limit_exceeded === true,
    page_limit_exceeded: scan.page_limit_exceeded === true,
    anti_overfitting: {
      ...object(evaluation.anti_overfitting),
      complete_history_scan_required: true,
      incomplete_history_blocks_evidence_candidate: true,
      raw_rows_cannot_crowd_out_unique_observation_limit: true,
      history_count_must_remain_stable_during_scan: true,
      stable_row_identity_required_across_pages: true,
    },
  };
}

export async function ingestAvantiqoMissionOutcomeLearning({
  pattern,
  outcome_contract,
  outcome_assessment,
  observation_token,
  organization_id = null,
  database = null,
  now = new Date(),
  limits = AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
} = {}) {
  const organizationId = learningOrganizationId(organization_id);
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      observation_written: false,
      evidence_candidate_written: false,
    };
  }
  const prepared = buildAvantiqoMissionOutcomeLearningObservation({
    pattern,
    outcome_contract,
    outcome_assessment,
    observation_token,
    organization_id: organizationId,
    now,
  });
  if (!prepared.eligible) {
    return {
      ...prepared,
      observation_written: false,
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
    };
  }

  const client = await resolveDatabase(database);
  const observationWrite = await client
    .from(MEMORY_TABLE)
    .upsert(prepared.row, {
      onConflict: "organization_id,memory_scope,memory_key",
      ignoreDuplicates: true,
    })
    .select("id,memory_key")
    .maybeSingle();
  if (observationWrite.error) throw observationWrite.error;

  const historyScan = await loadPatternObservations(
    client,
    organizationId,
    prepared.pattern_fingerprint,
    limits,
    { allow_legacy_injected_adapter: Boolean(database) },
  );
  const evaluation = applyHistoryScanGate(
    evaluateAvantiqoMissionOutcomePattern({
      observations: historyScan.rows,
      pattern_fingerprint: prepared.pattern_fingerprint,
      limits,
    }),
    historyScan,
  );

  if (!evaluation.eligible_for_evidence_candidate) {
    return {
      success: true,
      contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
      status: evaluation.history_scan_complete
        ? "VERIFIED_OUTCOME_OBSERVATION_ACCUMULATED"
        : "VERIFIED_OUTCOME_HISTORY_SCAN_INCOMPLETE",
      observation_written: Boolean(observationWrite.data?.id),
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      pattern_evaluation: evaluation,
      next_stage_contract: null,
      governance: {
        repeated_outcome_gate_passed: false,
        stored_observation_integrity_revalidated: true,
        malformed_or_poisoned_observations_excluded: true,
        unique_observation_fingerprints_required: true,
        duplicate_observations_excluded: true,
        conflicting_observation_fingerprints_quarantined: true,
        row_order_cannot_resolve_observation_conflict: true,
        complete_history_scan_required: true,
        history_scan_complete: evaluation.history_scan_complete,
        incomplete_history_blocks_evidence_candidate: true,
        raw_rows_cannot_crowd_out_unique_observation_limit: true,
        causal_attribution_allowed: false,
        automatic_knowledge_promotion: false,
        authorization_effect: "NONE",
      },
    };
  }

  const candidate = buildAvantiqoMissionOutcomeEvidenceCandidateRow({
    pattern,
    pattern_evaluation: evaluation,
    organization_id: organizationId,
    now,
  });
  if (!candidate) {
    return {
      success: true,
      contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
      status: "FAILED_CLOSED_INVALID_EVIDENCE_CANDIDATE_EVALUATION",
      observation_written: Boolean(observationWrite.data?.id),
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      pattern_evaluation: evaluation,
      next_stage_contract: null,
      governance: {
        repeated_outcome_gate_passed: false,
        evaluation_summary_revalidated: true,
        caller_supplied_eligibility_not_trusted: true,
        automatic_knowledge_promotion: false,
        causal_attribution_allowed: false,
        authorization_effect: "NONE",
      },
    };
  }
  const candidateWrite = await client
    .from(MEMORY_TABLE)
    .upsert(candidate, {
      onConflict: "organization_id,memory_scope,memory_key",
      ignoreDuplicates: true,
    })
    .select("id,memory_key")
    .maybeSingle();
  if (candidateWrite.error) throw candidateWrite.error;

  return {
    success: true,
    contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
    status: "MISSION_OUTCOME_EVIDENCE_CANDIDATE_INGESTED",
    observation_written: Boolean(observationWrite.data?.id),
    evidence_candidate_written: Boolean(candidateWrite.data?.id),
    reusable_platform_knowledge_written: false,
    memory_scope: EVIDENCE_CANDIDATE_SCOPE,
    memory_key: candidate.memory_key,
    pattern_evaluation: evaluation,
    next_stage_contract: LEARNING_EVIDENCE_BRIDGE_CONTRACT,
    governance: {
      provider_free: true,
      model_call_performed: false,
      research_performed: false,
      gpu_execution_performed: false,
      modal_job_submitted: false,
      evaluation_summary_revalidated: true,
      caller_supplied_eligibility_not_trusted: true,
      observation_count_arithmetic_revalidated: true,
      dominant_outcome_and_ratio_revalidated: true,
      evidence_thresholds_revalidated: true,
      stored_observation_integrity_revalidated: true,
      malformed_or_poisoned_observations_excluded: true,
      unique_observation_fingerprints_required: true,
      duplicate_observations_excluded: true,
      conflicting_observation_fingerprints_quarantined: true,
      row_order_cannot_resolve_observation_conflict: true,
      complete_history_scan_required: true,
      history_scan_complete: true,
      incomplete_history_blocks_evidence_candidate: true,
      raw_rows_cannot_crowd_out_unique_observation_limit: true,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      automatic_knowledge_promotion: false,
      direct_platform_knowledge_write_allowed: false,
      causal_attribution_allowed: false,
      customer_private_content_promoted: false,
      customer_identifiers_persisted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoMissionOutcomeLearningRuntime = Object.freeze({
  contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
  limits: AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
  buildObservation: buildAvantiqoMissionOutcomeLearningObservation,
  evaluatePattern: evaluateAvantiqoMissionOutcomePattern,
  buildEvidenceCandidate: buildAvantiqoMissionOutcomeEvidenceCandidateRow,
  ingest: ingestAvantiqoMissionOutcomeLearning,
});

export default AvantiqoMissionOutcomeLearningRuntime;
