import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_TRAINING_CANDIDATE_CONTRACT =
  "AVANTIQO_TRAINING_CANDIDATE_V1";

const MEMORY_TABLE = "intelligence_memories";
const TRAINING_SCOPE = "platform_training_candidates";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MIN_BENCHMARK_CASES = 20;
const MIN_PASS_RATE = 0.95;

function text(value, limit = 1600) {
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

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function boundedScore(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function normalizeCandidate(row = {}) {
  const metadata = object(row.metadata);
  return {
    id: row.id,
    memory_key: row.memory_key,
    capability_key: text(metadata.capability_key || row.subject, 300) || null,
    candidate_kind: text(metadata.candidate_kind, 120) || null,
    candidate_contract: text(metadata.contract, 160) || null,
    source_fingerprint: text(metadata.source_fingerprint, 128) || null,
    source_reference_count: Math.max(0, Number(metadata.source_reference_count || 0)),
    failure_family: list(metadata.failure_family).map((item) => text(item, 120)).filter(Boolean),
    prior_failure_occurrence_count: Math.max(
      0,
      Number(metadata.prior_failure_occurrence_count || 0),
    ),
    outcome: text(metadata.outcome, 80) || null,
    verification_mode: text(metadata.verification_mode, 120) || null,
    training_ready: metadata.training_ready === true,
    benchmark_status: text(metadata.benchmark_status, 80) || "UNREVIEWED",
    benchmark: object(metadata.benchmark),
    privacy: {
      customer_private_content_included:
        metadata.customer_private_content_included === true,
      raw_payload_persisted: metadata.raw_payload_persisted === true,
      raw_output_persisted: metadata.raw_output_persisted === true,
      raw_reasoning_persisted: metadata.raw_reasoning_persisted === true,
      identifiers_persisted: metadata.identifiers_persisted === true,
    },
    updated_at: row.updated_at || null,
  };
}

function candidatePrivacySafe(candidate = {}) {
  return (
    candidate.privacy.customer_private_content_included === false &&
    candidate.privacy.raw_payload_persisted === false &&
    candidate.privacy.raw_output_persisted === false &&
    candidate.privacy.raw_reasoning_persisted === false &&
    candidate.privacy.identifiers_persisted === false
  );
}

function normalizeBenchmarkEvidence(value = {}) {
  const evidence = object(value);
  const caseCount = boundedInteger(evidence.case_count, 0, 0, 1000000);
  const passedCaseCount = boundedInteger(
    evidence.passed_case_count,
    0,
    0,
    Math.max(0, caseCount),
  );
  const explicitPassRate = Number(evidence.pass_rate);
  const passRate = Number.isFinite(explicitPassRate)
    ? boundedScore(explicitPassRate)
    : caseCount > 0
      ? passedCaseCount / caseCount
      : 0;
  return {
    benchmark_id: text(evidence.benchmark_id, 240) || null,
    benchmark_suite: text(evidence.benchmark_suite, 240) || null,
    case_count: caseCount,
    passed_case_count: passedCaseCount,
    pass_rate: Number(passRate.toFixed(4)),
    regression_count: boundedInteger(
      evidence.regression_count,
      0,
      0,
      1000000,
    ),
    privacy_passed: evidence.privacy_passed === true,
    governance_passed: evidence.governance_passed === true,
    leakage_detected: evidence.leakage_detected === true,
    evaluator: text(evidence.evaluator, 160) || null,
    evidence_reference: text(evidence.evidence_reference, 1000) || null,
    evaluated_at: text(evidence.evaluated_at, 120) || new Date().toISOString(),
  };
}

function benchmarkDecision(candidate, evidence) {
  const reasons = [];
  if (!candidatePrivacySafe(candidate)) reasons.push("CANDIDATE_PRIVACY_POLICY_FAILED");
  if (!evidence.benchmark_id) reasons.push("BENCHMARK_ID_REQUIRED");
  if (!evidence.benchmark_suite) reasons.push("BENCHMARK_SUITE_REQUIRED");
  if (evidence.case_count < MIN_BENCHMARK_CASES) reasons.push("INSUFFICIENT_BENCHMARK_CASES");
  if (evidence.pass_rate < MIN_PASS_RATE) reasons.push("BENCHMARK_PASS_RATE_TOO_LOW");
  if (evidence.regression_count > 0) reasons.push("BENCHMARK_REGRESSION_DETECTED");
  if (evidence.privacy_passed !== true) reasons.push("BENCHMARK_PRIVACY_FAILED");
  if (evidence.governance_passed !== true) reasons.push("BENCHMARK_GOVERNANCE_FAILED");
  if (evidence.leakage_detected === true) reasons.push("BENCHMARK_LEAKAGE_DETECTED");

  return {
    approved: reasons.length === 0,
    reasons,
    threshold: {
      minimum_cases: MIN_BENCHMARK_CASES,
      minimum_pass_rate: MIN_PASS_RATE,
      maximum_regressions: 0,
      privacy_required: true,
      governance_required: true,
      leakage_allowed: false,
    },
  };
}

async function loadCandidate({ organizationId, candidateId }) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,memory_type,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", TRAINING_SCOPE)
    .eq("id", candidateId)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function listAvantiqoTrainingCandidates({
  status = "all",
  limit = DEFAULT_LIMIT,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      contract: AVANTIQO_TRAINING_CANDIDATE_CONTRACT,
      available: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      candidates: [],
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,memory_type,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", TRAINING_SCOPE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(boundedInteger(limit, DEFAULT_LIMIT, 1, MAX_LIMIT));
  if (result.error) throw result.error;

  const requestedStatus = text(status, 40).toLowerCase();
  const candidates = list(result.data)
    .map(normalizeCandidate)
    .filter((candidate) => {
      if (requestedStatus === "ready") return candidate.training_ready === true;
      if (requestedStatus === "pending") return candidate.training_ready !== true;
      if (requestedStatus === "rejected") return candidate.benchmark_status === "REJECTED";
      return true;
    });

  return {
    contract: AVANTIQO_TRAINING_CANDIDATE_CONTRACT,
    available: true,
    candidates,
    governance: {
      benchmark_gate_required: true,
      source_version_exposed_for_dataset_binding: true,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
      private_customer_content_allowed: false,
    },
  };
}

export async function reviewAvantiqoTrainingCandidate({
  candidateId,
  benchmarkEvidence = {},
} = {}) {
  const organizationId = learningOrganizationId();
  const id = text(candidateId, 160);
  if (!organizationId) throw new Error("AVANTIQO_TRAINING_LEARNING_ORGANIZATION_REQUIRED");
  if (!id) throw new Error("AVANTIQO_TRAINING_CANDIDATE_ID_REQUIRED");

  const row = await loadCandidate({ organizationId, candidateId: id });
  if (!row) throw new Error("AVANTIQO_TRAINING_CANDIDATE_NOT_FOUND");

  const candidate = normalizeCandidate(row);
  const evidence = normalizeBenchmarkEvidence(benchmarkEvidence);
  const decision = benchmarkDecision(candidate, evidence);
  const reviewedAt = new Date().toISOString();
  const metadata = {
    ...object(row.metadata),
    training_ready: decision.approved,
    benchmark_status: decision.approved ? "APPROVED" : "REJECTED",
    benchmark: {
      ...evidence,
      decision_reasons: decision.reasons,
      threshold: decision.threshold,
      reviewed_at: reviewedAt,
    },
    requires_benchmark_validation: !decision.approved,
    benchmark_validated: decision.approved,
    training_eligibility_effect: decision.approved
      ? "ELIGIBLE_FOR_CONTROLLED_TRAINING_DATASET"
      : "NOT_ELIGIBLE",
    production_model_promotion_effect: "NONE",
    automatic_model_weight_mutation: false,
    reviewed_at: reviewedAt,
  };

  const updated = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata, updated_at: reviewedAt })
    .eq("organization_id", organizationId)
    .eq("memory_scope", TRAINING_SCOPE)
    .eq("id", id)
    .select("id,memory_key,subject,metadata,updated_at")
    .single();
  if (updated.error) throw updated.error;

  return {
    contract: AVANTIQO_TRAINING_CANDIDATE_CONTRACT,
    candidate: normalizeCandidate(updated.data),
    decision,
    governance: {
      training_ready_means_dataset_eligible_only: true,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoTrainingCandidateRuntime = Object.freeze({
  contract: AVANTIQO_TRAINING_CANDIDATE_CONTRACT,
  list: listAvantiqoTrainingCandidates,
  review: reviewAvantiqoTrainingCandidate,
});
