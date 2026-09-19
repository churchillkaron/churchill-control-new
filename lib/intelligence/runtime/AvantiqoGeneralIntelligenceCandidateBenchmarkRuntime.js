import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { reviewAvantiqoTrainingCandidate } from "./AvantiqoTrainingCandidateRuntime";

export const AVANTIQO_GENERAL_INTELLIGENCE_CANDIDATE_BENCHMARK_CONTRACT =
  "AVANTIQO_GENERAL_INTELLIGENCE_CANDIDATE_BENCHMARK_V1";

const MEMORY_TABLE = "intelligence_memories";
const TRAINING_SCOPE = "platform_training_candidates";
const SHADOW_SCOPE = "platform_general_intelligence_shadow_benchmarks";
const CANDIDATE_SOURCE = "general_intelligence_training_candidate";
const CANDIDATE_KIND = "GENERAL_INTELLIGENCE_TRANSFER_DISCIPLINE";
const CANDIDATE_CONTRACT = "AVANTIQO_GENERAL_INTELLIGENCE_TRAINING_CANDIDATE_V1";
const CASE_COUNT = 20;
const DEFAULT_LIMIT = 20;

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function hash(value) { return createHash("sha256").update(text(value, 30000)).digest("hex"); }
function learningOrganizationId() { return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160); }
function boolCase(id, category, passed, detail) { return { id, category, passed: passed === true, detail: text(detail, 500) }; }

async function loadShadowRows(organizationId) {
  const result = await supabaseAdmin.from(MEMORY_TABLE)
    .select("id,subject,metadata,active,updated_at")
    .eq("organization_id", organizationId).eq("memory_scope", SHADOW_SCOPE)
    .eq("active", true).order("updated_at", { ascending: false }).limit(500);
  if (result.error) throw result.error;
  return list(result.data);
}

function evaluateCandidate(row, shadowRows) {
  const m = object(row.metadata);
  const sourceFingerprint = text(m.source_fingerprint, 128);
  const shadow = shadowRows.find((item) => {
    const sm = object(item.metadata);
    return text(sm.candidate_id, 160) === text(row.id, 160) &&
      text(sm.source_fingerprint, 128) === sourceFingerprint;
  });
  const sm = object(shadow?.metadata);
  const cases = [
    boolCase("contract", "provenance", text(m.contract, 180) === CANDIDATE_CONTRACT, "General-intelligence training candidate contract matches."),
    boolCase("source", "provenance", text(row.source, 180) === CANDIDATE_SOURCE, "Candidate originates from the general-intelligence training bridge."),
    boolCase("kind", "curriculum", text(m.candidate_kind, 160) === CANDIDATE_KIND, "Candidate kind is transfer-discipline reasoning."),
    boolCase("verification_mode", "curriculum", text(m.verification_mode, 180) === "RETENTION_AND_CROSS_DOMAIN_TRANSFER", "Verification requires retention and cross-domain transfer evidence."),
    boolCase("outcome", "curriculum", text(m.outcome, 160) === "EVIDENCE_BOUND_TRANSFER_REASONING", "Desired outcome is evidence-bound transfer reasoning."),
    boolCase("source_fingerprint", "provenance", /^[a-f0-9]{64}$/.test(sourceFingerprint), "Candidate is bound to a stable source fingerprint."),
    boolCase("retention_gate", "evidence", m.retention_gate_passed === true, "Repeated retention gate passed."),
    boolCase("transfer_gate", "evidence", m.transfer_gate_passed === true, "Cross-domain transfer gate passed."),
    boolCase("reasoning_not_facts", "curriculum", m.trains_reasoning_pattern_not_world_facts === true, "Candidate trains a reasoning pattern rather than mutable facts."),
    boolCase("mutable_facts", "curriculum", m.mutable_world_facts_included === false, "Mutable world facts are excluded from the candidate."),
    boolCase("private_content", "privacy", m.customer_private_content_included === false, "Customer-private content is excluded."),
    boolCase("raw_payload", "privacy", m.raw_payload_persisted === false, "Raw payload is excluded."),
    boolCase("raw_output", "privacy", m.raw_output_persisted === false, "Raw model output is excluded."),
    boolCase("raw_reasoning", "privacy", m.raw_reasoning_persisted === false, "Raw reasoning is excluded."),
    boolCase("identifiers", "privacy", m.identifiers_persisted === false, "Identifiers are excluded."),
    boolCase("authorization", "governance", text(m.authorization_value, 80).toLowerCase() === "none", "Candidate grants no authorization."),
    boolCase("auto_training", "governance", m.automatic_training_started === false, "Candidate cannot automatically start training."),
    boolCase("weight_mutation", "governance", m.automatic_model_weight_mutation === false, "Candidate cannot automatically mutate weights."),
    boolCase("shadow_binding", "necessity", Boolean(shadow) && text(m.shadow_benchmark_source_fingerprint, 128) === sourceFingerprint && text(sm.source_fingerprint, 128) === sourceFingerprint, "A current shadow benchmark is bound to the exact candidate source version."),
    boolCase("training_needed", "necessity", Boolean(shadow) && sm.training_needed === true && sm.no_training_needed === false && text(m.shadow_benchmark_status, 80) === "TRAINING_NEEDED", "Current local 4B has a measured gap, so controlled training is justified."),
  ];
  if (cases.length !== CASE_COUNT) throw new Error(`AVANTIQO_GENERAL_INTELLIGENCE_CANDIDATE_BENCHMARK_CASE_COUNT_INVALID:${cases.length}`);
  const failed = cases.filter((item) => !item.passed);
  const passed = CASE_COUNT - failed.length;
  const privacyPassed = cases.filter((item) => item.category === "privacy").every((item) => item.passed);
  const governancePassed = cases.filter((item) => item.category === "governance").every((item) => item.passed);
  const fingerprint = hash([row.id, sourceFingerprint, text(shadow?.id, 160), ...cases.map((item) => `${item.id}:${item.passed ? 1 : 0}`)].join("|"));
  return {
    cases, failed,
    evidence: {
      benchmark_id: `general-intelligence-candidate-${fingerprint.slice(0, 20)}`,
      benchmark_suite: AVANTIQO_GENERAL_INTELLIGENCE_CANDIDATE_BENCHMARK_CONTRACT,
      case_count: CASE_COUNT,
      passed_case_count: passed,
      pass_rate: Number((passed / CASE_COUNT).toFixed(4)),
      regression_count: failed.length,
      privacy_passed: privacyPassed,
      governance_passed: governancePassed,
      leakage_detected: !privacyPassed,
      evaluator: "avantiqo-deterministic-general-intelligence-candidate-evaluator",
      evidence_reference: `candidate-source-fingerprint:${sourceFingerprint};shadow:${text(shadow?.id, 160) || "missing"}`,
      evaluated_at: new Date().toISOString(),
    },
  };
}

export async function benchmarkPendingAvantiqoGeneralIntelligenceCandidates({ organizationId = learningOrganizationId(), limit = DEFAULT_LIMIT } = {}) {
  if (!organizationId) return { contract: AVANTIQO_GENERAL_INTELLIGENCE_CANDIDATE_BENCHMARK_CONTRACT, status: "DISABLED", reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED", processed_count: 0 };
  const candidateResult = await supabaseAdmin.from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,source,active,metadata,updated_at")
    .eq("organization_id", organizationId).eq("memory_scope", TRAINING_SCOPE)
    .eq("source", CANDIDATE_SOURCE).eq("active", true).order("updated_at", { ascending: true }).limit(Math.max(1, Math.min(100, Number(limit) || DEFAULT_LIMIT)));
  if (candidateResult.error) throw candidateResult.error;
  const shadowRows = await loadShadowRows(organizationId);
  const rows = list(candidateResult.data);
  const pending = rows.filter((row) => {
    const m = object(row.metadata);
    return text(m.candidate_kind, 160) === CANDIDATE_KIND &&
      text(m.shadow_benchmark_source_fingerprint, 128) === text(m.source_fingerprint, 128) &&
      (m.training_ready !== true || text(m.benchmark_status, 80) !== "APPROVED");
  });
  const results = [];
  for (const row of pending) {
    const evaluation = evaluateCandidate(row, shadowRows);
    const review = await reviewAvantiqoTrainingCandidate({ candidateId: row.id, benchmarkEvidence: evaluation.evidence });
    results.push({ candidate_id: row.id, status: review.decision.approved ? "APPROVED" : "REJECTED", failed_cases: evaluation.failed, benchmark: evaluation.evidence, review });
  }
  return {
    contract: AVANTIQO_GENERAL_INTELLIGENCE_CANDIDATE_BENCHMARK_CONTRACT,
    status: results.some((item) => item.status === "REJECTED") ? "PARTIAL" : "COMPLETED",
    candidate_count: rows.length,
    processed_count: results.length,
    approved_count: results.filter((item) => item.status === "APPROVED").length,
    rejected_count: results.filter((item) => item.status === "REJECTED").length,
    results,
    governance: {
      current_shadow_training_need_required: true,
      no_training_needed_keeps_candidate_ineligible: true,
      deterministic_current_source_version_only: true,
      provider_execution_used: false,
      automatic_dataset_assembly: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
    },
  };
}
