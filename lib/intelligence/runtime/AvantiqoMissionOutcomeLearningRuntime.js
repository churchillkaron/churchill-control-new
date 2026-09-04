import { createHash } from "node:crypto";

export const AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT =
  "AVANTIQO_MISSION_OUTCOME_LEARNING_V1";

export const AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS = Object.freeze({
  min_observations: 3,
  min_distinct_observation_days: 2,
  min_dominant_outcome_ratio: 0.8,
  max_pattern_observations: 200,
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

function eligibleObservationRow(row, patternFingerprint) {
  const metadata = object(row?.metadata);
  return Boolean(
    row?.active === true &&
    text(row?.memory_scope, 160) === OUTCOME_SCOPE &&
    text(row?.source, 180) === SOURCE &&
    text(metadata.contract, 180) === AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT &&
    metadata.mission_outcome_pattern === true &&
    text(metadata.pattern_fingerprint, 128) === patternFingerprint &&
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
  const rows = list(observations)
    .filter((row) => eligibleObservationRow(row, fingerprint))
    .slice(0, maximum);
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
    verified_success_count: successCount,
    verified_failure_count: failureCount,
    distinct_observation_days: distinctDays,
    dominant_outcome: dominantOutcome,
    dominant_outcome_ratio: Number(dominantRatio.toFixed(4)),
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
      causal_attribution_established: false,
    },
  };
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
  if (
    evaluation.contract !== AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT ||
    evaluation.eligible_for_evidence_candidate !== true ||
    !["SUCCESS", "FAILURE"].includes(text(evaluation.dominant_outcome, 40))
  ) {
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
      verified_success_count: Number(evaluation.verified_success_count || 0),
      verified_failure_count: Number(evaluation.verified_failure_count || 0),
      distinct_observation_days: Number(evaluation.distinct_observation_days || 0),
      dominant_outcome_ratio: Number(evaluation.dominant_outcome_ratio || 0),
      source_count: Number(evaluation.observation_count || 0),
      repeated_verified_outcome_gate_passed: true,
      anti_overfitting_gate_passed: true,
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

async function loadPatternObservations(client, organizationId, patternFingerprint, limit) {
  const result = await client
    .from(MEMORY_TABLE)
    .select("id,memory_scope,memory_key,source,active,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", OUTCOME_SCOPE)
    .eq("active", true)
    .eq("metadata->>pattern_fingerprint", patternFingerprint)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (result.error) throw result.error;
  return list(result.data);
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

  const maximum = boundedInteger(
    limits.max_pattern_observations,
    AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS.max_pattern_observations,
    1,
    2000,
  );
  const observations = await loadPatternObservations(
    client,
    organizationId,
    prepared.pattern_fingerprint,
    maximum,
  );
  const evaluation = evaluateAvantiqoMissionOutcomePattern({
    observations,
    pattern_fingerprint: prepared.pattern_fingerprint,
    limits,
  });

  if (!evaluation.eligible_for_evidence_candidate) {
    return {
      success: true,
      contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
      status: "VERIFIED_OUTCOME_OBSERVATION_ACCUMULATED",
      observation_written: Boolean(observationWrite.data?.id),
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      pattern_evaluation: evaluation,
      next_stage_contract: null,
      governance: {
        repeated_outcome_gate_passed: false,
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