import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  buildAvantiqoCanonicalCurriculumCandidates,
} from "./AvantiqoCanonicalCurriculumCandidateRuntime";
import {
  reviewAvantiqoTrainingCandidate,
} from "./AvantiqoTrainingCandidateRuntime";

export const AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_CONTRACT =
  "AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_V1";

const MEMORY_TABLE = "intelligence_memories";
const TRAINING_SCOPE = "platform_training_candidates";
const CANONICAL_SOURCE = "canonical_product_curriculum_candidate";
const CANONICAL_KIND = "CANONICAL_PRODUCT_GROUNDING";
const CASE_COUNT = 20;
const DEFAULT_LIMIT = 32;
const MAX_LIMIT = 64;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stableHash(value) {
  return createHash("sha256").update(text(value, 30000)).digest("hex");
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function boundedLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

async function loadCanonicalCandidate(organizationId, candidateId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,source,active,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", TRAINING_SCOPE)
    .eq("id", candidateId)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function listCanonicalCandidateRows(organizationId, limit) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,source,active,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", TRAINING_SCOPE)
    .eq("source", CANONICAL_SOURCE)
    .eq("active", true)
    .order("updated_at", { ascending: true })
    .limit(boundedLimit(limit));
  if (result.error) throw result.error;
  return list(result.data);
}

function currentCanonicalByCapability() {
  return new Map(
    buildAvantiqoCanonicalCurriculumCandidates().map((candidate) => [
      text(candidate.capability_key, 300),
      candidate,
    ]),
  );
}

function booleanCase(id, passed, category, detail) {
  return {
    id,
    category,
    passed: passed === true,
    detail: text(detail, 600) || null,
  };
}

function evaluateCandidate(row, current) {
  const metadata = object(row?.metadata);
  const references = list(metadata.source_references).map((item) => text(item, 1000)).filter(Boolean);
  const versions = list(metadata.source_content_versions).map((item) => text(item, 1200)).filter(Boolean);
  const capabilityKey = text(metadata.capability_key || row?.subject, 300);
  const currentFingerprint = text(current?.source_fingerprint, 128);
  const storedFingerprint = text(metadata.source_fingerprint, 128);

  const cases = [
    booleanCase("contract", text(metadata.contract, 160) === "AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_V1", "provenance", "Canonical curriculum contract matches."),
    booleanCase("source", text(row?.source, 160) === CANONICAL_SOURCE, "provenance", "Candidate originates from canonical product curriculum seeding."),
    booleanCase("kind", text(metadata.candidate_kind, 120) === CANONICAL_KIND, "curriculum", "Candidate kind is canonical product grounding."),
    booleanCase("verification_mode", text(metadata.verification_mode, 160) === "CANONICAL_REGISTRY_CONSTITUTION", "curriculum", "Verification mode requires canonical registry/constitution evidence."),
    booleanCase("outcome", text(metadata.outcome, 120) === "CORRECT_PRODUCT_CONTRACT_GROUNDED", "curriculum", "Desired outcome is canonical product grounding."),
    booleanCase("capability", Boolean(capabilityKey), "curriculum", "Capability key is present."),
    booleanCase("current_match", Boolean(current), "freshness", "A matching candidate still exists in the current canonical product curriculum."),
    booleanCase("fingerprint", Boolean(currentFingerprint) && storedFingerprint === currentFingerprint, "freshness", "Stored candidate source fingerprint matches current canonical product content."),
    booleanCase("reference_count", references.length > 0 && references.length === Number(metadata.source_reference_count || 0), "provenance", "Canonical source references are present and counted consistently."),
    booleanCase("version_count", versions.length === references.length && versions.length > 0, "provenance", "Every canonical source reference carries a content-version fingerprint."),
    booleanCase("failure_family", list(metadata.failure_family).length === 0, "curriculum", "Canonical grounding is not mislabeled as failure-recovery curriculum."),
    booleanCase("private_content", metadata.customer_private_content_included === false, "privacy", "Customer-private content is excluded."),
    booleanCase("raw_payload", metadata.raw_payload_persisted === false, "privacy", "Raw customer payload is excluded."),
    booleanCase("raw_output", metadata.raw_output_persisted === false, "privacy", "Raw model output is excluded."),
    booleanCase("raw_reasoning", metadata.raw_reasoning_persisted === false, "privacy", "Raw reasoning is excluded."),
    booleanCase("identifiers", metadata.identifiers_persisted === false, "privacy", "Customer/person identifiers are excluded."),
    booleanCase("authorization", text(metadata.authorization_value, 80).toLowerCase() === "none", "governance", "Candidate cannot grant authorization."),
    booleanCase("auto_training", metadata.automatic_training_started === false, "governance", "Candidate seeding cannot automatically start training."),
    booleanCase("weight_mutation", metadata.automatic_model_weight_mutation === false, "governance", "Candidate seeding cannot mutate model weights."),
    booleanCase("production_promotion", text(metadata.production_model_promotion_effect, 120) === "NONE", "governance", "Candidate has no automatic production-promotion effect."),
  ];

  if (cases.length !== CASE_COUNT) {
    throw new Error(`AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_CASE_COUNT_INVALID:${cases.length}`);
  }

  const passed = cases.filter((item) => item.passed).length;
  const failed = cases.filter((item) => !item.passed);
  const privacyPassed = cases
    .filter((item) => item.category === "privacy")
    .every((item) => item.passed);
  const governancePassed = cases
    .filter((item) => item.category === "governance")
    .every((item) => item.passed);
  const leakageDetected = !privacyPassed;
  const benchmarkFingerprint = stableHash([
    row.id,
    capabilityKey,
    storedFingerprint,
    ...cases.map((item) => `${item.id}:${item.passed ? "1" : "0"}`),
  ].join("|"));

  return {
    cases,
    failed,
    evidence: {
      benchmark_id: `canonical-curriculum-${benchmarkFingerprint.slice(0, 20)}`,
      benchmark_suite: AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_CONTRACT,
      case_count: CASE_COUNT,
      passed_case_count: passed,
      pass_rate: Number((passed / CASE_COUNT).toFixed(4)),
      regression_count: failed.length,
      privacy_passed: privacyPassed,
      governance_passed: governancePassed,
      leakage_detected: leakageDetected,
      evaluator: "avantiqo-deterministic-canonical-curriculum-evaluator",
      evidence_reference: `canonical-source-fingerprint:${storedFingerprint || "missing"}`,
      evaluated_at: new Date().toISOString(),
    },
  };
}

export async function benchmarkAvantiqoCanonicalCurriculumCandidate({ candidateId } = {}) {
  const organizationId = learningOrganizationId();
  const id = text(candidateId, 160);
  if (!organizationId) {
    throw new Error("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_LEARNING_ORGANIZATION_REQUIRED");
  }
  if (!id) throw new Error("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_CANDIDATE_REQUIRED");

  const row = await loadCanonicalCandidate(organizationId, id);
  if (!row) throw new Error("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_CANDIDATE_NOT_FOUND");
  const metadata = object(row.metadata);
  if (text(row.source, 160) !== CANONICAL_SOURCE || text(metadata.candidate_kind, 120) !== CANONICAL_KIND) {
    throw new Error("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_CANDIDATE_KIND_INVALID");
  }

  const current = currentCanonicalByCapability().get(
    text(metadata.capability_key || row.subject, 300),
  );
  const evaluation = evaluateCandidate(row, current);
  const review = await reviewAvantiqoTrainingCandidate({
    candidateId: row.id,
    benchmarkEvidence: evaluation.evidence,
  });

  return {
    contract: AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_CONTRACT,
    status: review.decision.approved ? "APPROVED" : "REJECTED",
    candidate_id: row.id,
    capability_key: text(metadata.capability_key || row.subject, 300),
    cases: evaluation.cases,
    failed_cases: evaluation.failed,
    benchmark: evaluation.evidence,
    review,
    governance: {
      deterministic_current_canonical_evidence_only: true,
      provider_execution_used: false,
      runpod_used: false,
      shared_trainer_mutated: false,
      customer_private_content_used: false,
      raw_reasoning_used: false,
      training_started: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export async function benchmarkPendingAvantiqoCanonicalCurriculumCandidates({
  limit = DEFAULT_LIMIT,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      contract: AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      processed_count: 0,
      approved_count: 0,
      rejected_count: 0,
      results: [],
    };
  }

  const rows = await listCanonicalCandidateRows(organizationId, limit);
  const pending = rows.filter((row) => {
    const metadata = object(row.metadata);
    return metadata.training_ready !== true || text(metadata.benchmark_status, 80) !== "APPROVED";
  });
  const results = [];
  for (const row of pending) {
    results.push(await benchmarkAvantiqoCanonicalCurriculumCandidate({ candidateId: row.id }));
  }
  const approvedCount = results.filter((result) => result.status === "APPROVED").length;
  const rejectedCount = results.filter((result) => result.status === "REJECTED").length;

  return {
    contract: AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_CONTRACT,
    status: rejectedCount ? "PARTIAL" : "COMPLETED",
    processed_count: results.length,
    approved_count: approvedCount,
    rejected_count: rejectedCount,
    results,
    governance: {
      provider_execution_used: false,
      runpod_used: false,
      shared_trainer_mutated: false,
      candidate_review_gate_reused: true,
      automatic_training_started: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoCanonicalCurriculumBenchmarkRuntime = Object.freeze({
  contract: AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_CONTRACT,
  benchmark: benchmarkAvantiqoCanonicalCurriculumCandidate,
  benchmarkPending: benchmarkPendingAvantiqoCanonicalCurriculumCandidates,
});
