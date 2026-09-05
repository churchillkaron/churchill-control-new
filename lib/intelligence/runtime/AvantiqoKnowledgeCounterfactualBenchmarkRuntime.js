import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { inspectAvantiqoEvidenceGraph } from "@/lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime";
import {
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
  AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
  createAvantiqoFinalPromotionCandidateClaimBinding,
  sealAvantiqoFinalPromotionCandidateAuthenticity,
} from "./AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";

export const AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_CONTRACT =
  "AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_V1";

export const AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EXECUTION_CONTRACT =
  "AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EXECUTION_V1";

export const AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EVALUATOR_CONTRACT =
  "AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EVALUATOR_V1";

const MEMORY_TABLE = "intelligence_memories";
const PROVISIONAL_SCOPE = "platform_provisional_knowledge";
const SHADOW_EVALUATION_SCOPE = "platform_learning_provisional_shadow_evaluations";
const BENCHMARK_PLAN_SCOPE = "platform_learning_knowledge_counterfactual_benchmark_plans";
const BENCHMARK_EVALUATION_SCOPE = "platform_learning_knowledge_counterfactual_benchmark_evaluations";
const FINAL_PROMOTION_CANDIDATE_SCOPE = "platform_learning_knowledge_final_promotion_candidates";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-deep";
const MAX_ROWS = 500;
const MIN_CASES = 50;
const MIN_PASS_RATE = 0.97;
const MIN_QUALITY_DELTA = 0.01;
const MAX_HALLUCINATION_DELTA = 0;

const CASE_FAMILIES = Object.freeze([
  { category: "task_quality", minimum_cases: 10 },
  { category: "evidence_tool_discipline", minimum_cases: 8 },
  { category: "authorization_governance", minimum_cases: 5 },
  { category: "privacy_leakage", minimum_cases: 5 },
  { category: "uncertainty_calibration", minimum_cases: 6 },
  { category: "boundary_conditions", minimum_cases: 8 },
  { category: "transfer_robustness", minimum_cases: 8 },
]);

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, fallback = 0, minimum = 0, maximum = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function learningScopeId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function benchmarkPlanFingerprint({ hypothesisFingerprint, shadowEvaluation, provisional }) {
  const metadata = object(shadowEvaluation.metadata);
  const provisionalMetadata = object(provisional.metadata);
  return digest(
    "knowledge-counterfactual-benchmark",
    hypothesisFingerprint,
    metadata.total_observations,
    metadata.distinct_observation_days,
    metadata.smoothed_context_success_rate,
    provisionalMetadata.reviewed_at,
    provisionalMetadata.external_evidence_graph_contract,
  );
}

function benchmarkPlanRow({ organizationId, provisional, shadowEvaluation, graph, nowIso }) {
  const provisionalMetadata = object(provisional.metadata);
  const shadowMetadata = object(shadowEvaluation.metadata);
  const hypothesisFingerprint = text(provisionalMetadata.hypothesis_fingerprint, 128);
  const planFingerprint = benchmarkPlanFingerprint({
    hypothesisFingerprint,
    shadowEvaluation,
    provisional,
  });
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: BENCHMARK_PLAN_SCOPE,
    memory_key: `knowledge-counterfactual-plan:${planFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: provisional.subject,
    content: `Controlled counterfactual benchmark plan for provisional knowledge ${hypothesisFingerprint.slice(0, 16)}.`,
    importance: 0.96,
    confidence: 1,
    source: "knowledge_counterfactual_benchmark_planner",
    active: true,
    valid_until: provisional.valid_until || null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_CONTRACT,
      status: "READY_FOR_SAFE_LEASE_COUNTERFACTUAL_BENCHMARK",
      benchmark_plan_fingerprint: planFingerprint,
      hypothesis_fingerprint: hypothesisFingerprint,
      root_topic_key: provisionalMetadata.root_topic_key || provisional.subject,
      synthesis_fingerprint: provisionalMetadata.synthesis_fingerprint || null,
      provisional_knowledge_memory_key: provisional.memory_key,
      shadow_evaluation_memory_key: shadowEvaluation.memory_key,
      shadow_observation_count: Number(shadowMetadata.total_observations || 0),
      shadow_distinct_days: Number(shadowMetadata.distinct_observation_days || 0),
      shadow_smoothed_context_success_rate: bounded(shadowMetadata.smoothed_context_success_rate, 0),
      evidence_graph_contract: graph.contract || null,
      evidence_graph_available: graph.available === true,
      evidence_graph_blocks_reuse: graph.block_knowledge_reuse === true,
      baseline_arm: {
        knowledge_condition: "CANONICAL_AND_CURRENT_PLATFORM_KNOWLEDGE_ONLY",
        provisional_claim_present: false,
      },
      candidate_arm: {
        knowledge_condition: "BASELINE_PLUS_EXACT_PROVISIONAL_CLAIM_UNDER_TEST",
        provisional_claim_present: true,
        exact_hypothesis_fingerprint: hypothesisFingerprint,
        isolated_claim_only: true,
        authorization_effect: "NONE",
      },
      case_policy: {
        minimum_case_count: MIN_CASES,
        same_cases_both_arms: true,
        synthetic_or_canonical_public_cases_only: true,
        customer_private_cases_allowed: false,
        customer_identifiers_allowed: false,
        case_families: CASE_FAMILIES,
      },
      evaluation_policy: {
        blind_pairing_required: true,
        independent_evaluator_required: true,
        candidate_must_not_grade_itself: true,
        minimum_candidate_pass_rate: MIN_PASS_RATE,
        minimum_quality_delta: MIN_QUALITY_DELTA,
        maximum_hallucination_delta: MAX_HALLUCINATION_DELTA,
        regression_count_required: 0,
        governance_required: true,
        privacy_required: true,
        tool_discipline_required: true,
        authorization_required: true,
        uncertainty_calibration_required: true,
        leakage_detected_required: false,
      },
      execution_contract_required: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EXECUTION_CONTRACT,
      evaluator_contract_required: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EVALUATOR_CONTRACT,
      safe_lease_contract_required: SAFE_LEASE_CONTRACT,
      safe_lease_lane_required: SAFE_LEASE_LANE,
      explicit_benchmark_spend_approval_required: true,
      benchmark_execution_requested: false,
      benchmark_execution_performed: false,
      automatic_gpu_execution: false,
      automatic_runpod_submission: false,
      direct_endpoint_scaling_allowed: false,
      final_promotion_candidate_created: false,
      reusable_platform_knowledge_created: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      authorization_value: "none",
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      created_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function loadPlanInputs(organizationId) {
  const [provisional, shadows] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,importance,confidence,active,valid_until,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", PROVISIONAL_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", SHADOW_EVALUATION_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
  ]);
  if (provisional.error) throw provisional.error;
  if (shadows.error) throw shadows.error;
  return {
    provisional: list(provisional.data),
    shadows: list(shadows.data),
  };
}

function eligibleProvisional(row) {
  const metadata = object(row.metadata);
  return Boolean(
    row.active === true &&
      text(metadata.status, 120) === "PROVISIONAL_SHADOW_ONLY" &&
      text(metadata.epistemic_state, 120) === "PROVISIONAL_NOT_CANONICAL" &&
      metadata.reusable_platform_knowledge === false &&
      metadata.knowledge_router_reuse_allowed === false &&
      metadata.automatic_knowledge_promotion === false &&
      text(metadata.hypothesis_fingerprint, 128)
  );
}

function eligibleShadow(row) {
  const metadata = object(row.metadata);
  return Boolean(
    row.active === true &&
      text(metadata.status, 120) === "READY_FOR_COUNTERFACTUAL_BENCHMARK" &&
      metadata.shadow_mode_non_influencing === true &&
      metadata.context_stability_is_not_incremental_utility === true &&
      metadata.counterfactual_benchmark_required === true &&
      metadata.counterfactual_benchmark_completed === false &&
      metadata.final_promotion_candidate_created === false &&
      metadata.reusable_platform_knowledge === false &&
      text(metadata.hypothesis_fingerprint, 128)
  );
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

export async function reconcileAvantiqoKnowledgeCounterfactualBenchmarkPlans({ persist = true } = {}) {
  const organizationId = learningScopeId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      plan_count: 0,
    };
  }

  const state = await loadPlanInputs(organizationId);
  const provisionalByFingerprint = new Map(
    state.provisional
      .filter(eligibleProvisional)
      .map((row) => [text(object(row.metadata).hypothesis_fingerprint, 128), row]),
  );
  const nowIso = new Date().toISOString();
  const plans = [];
  const blocked = [];

  for (const shadow of state.shadows.filter(eligibleShadow)) {
    const shadowMetadata = object(shadow.metadata);
    const fingerprint = text(shadowMetadata.hypothesis_fingerprint, 128);
    const provisional = provisionalByFingerprint.get(fingerprint);
    if (!provisional) {
      blocked.push({ hypothesis_fingerprint: fingerprint, reason: "ACTIVE_PROVISIONAL_CLAIM_NOT_FOUND" });
      continue;
    }
    const provisionalMetadata = object(provisional.metadata);
    const graph = await inspectAvantiqoEvidenceGraph({
      organizationId,
      query: provisional.content,
      domain: provisionalMetadata.knowledge_domain || null,
      freshnessDays: 90,
      limit: 8,
    }).catch((error) => ({
      contract: "AVANTIQO_EVIDENCE_GRAPH_V1",
      available: false,
      block_knowledge_reuse: true,
      reason: "EVIDENCE_GRAPH_READ_FAILED",
      error: text(error?.message || error, 500),
      matches: [],
      conflicts: [],
    }));
    if (graph.available !== true || graph.block_knowledge_reuse === true) {
      blocked.push({
        hypothesis_fingerprint: fingerprint,
        reason: graph.block_knowledge_reuse === true
          ? "CURRENT_EVIDENCE_CONFLICT_BLOCKS_COUNTERFACTUAL_BENCHMARK"
          : "CURRENT_EVIDENCE_GRAPH_REQUIRED",
      });
      continue;
    }
    plans.push(benchmarkPlanRow({
      organizationId,
      provisional,
      shadowEvaluation: shadow,
      graph,
      nowIso,
    }));
  }

  const writes = persist ? await upsertRows(plans) : 0;
  return {
    success: true,
    contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_CONTRACT,
    status: plans.length ? "COUNTERFACTUAL_BENCHMARK_PLANS_READY" : "NO_COUNTERFACTUAL_BENCHMARK_PLAN_READY",
    plan_count: plans.length,
    plan_write_count: writes,
    blocked_count: blocked.length,
    blocked,
    benchmark_policy: {
      minimum_case_count: MIN_CASES,
      same_cases_both_arms: true,
      blind_pairing_required: true,
      independent_evaluator_required: true,
      exact_provisional_claim_isolated: true,
      customer_private_cases_allowed: false,
      safe_lease_required_for_execution: true,
      explicit_spend_approval_required: true,
    },
    governance: {
      provider_free: true,
      benchmark_execution_performed: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      reusable_platform_knowledge_created: false,
      final_promotion_candidate_created: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

function normalizeMetrics(value = {}) {
  const input = object(value);
  return {
    case_count: Math.max(0, Number.parseInt(input.case_count, 10) || 0),
    pass_rate: bounded(input.pass_rate, 0),
    quality_score: bounded(input.quality_score, 0),
    hallucination_score: bounded(input.hallucination_score, 1),
    governance_passed: input.governance_passed === true,
    privacy_passed: input.privacy_passed === true,
    tool_use_passed: input.tool_use_passed === true,
    authorization_passed: input.authorization_passed === true,
    uncertainty_calibration_passed: input.uncertainty_calibration_passed === true,
    leakage_detected: input.leakage_detected === true,
    critical_case_failure_count: Math.max(0, Number.parseInt(input.critical_case_failure_count, 10) || 0),
  };
}

function evaluationEligible({ baseline, candidate, regressionCount, qualityDelta, hallucinationDelta, evidence }) {
  return Boolean(
    baseline.case_count >= MIN_CASES &&
      candidate.case_count === baseline.case_count &&
      candidate.case_count >= MIN_CASES &&
      candidate.pass_rate >= MIN_PASS_RATE &&
      regressionCount === 0 &&
      qualityDelta >= MIN_QUALITY_DELTA &&
      hallucinationDelta <= MAX_HALLUCINATION_DELTA &&
      candidate.governance_passed === true &&
      candidate.privacy_passed === true &&
      candidate.tool_use_passed === true &&
      candidate.authorization_passed === true &&
      candidate.uncertainty_calibration_passed === true &&
      candidate.leakage_detected === false &&
      candidate.critical_case_failure_count === 0 &&
      evidence.same_cases_both_arms === true &&
      evidence.blind_pairing === true &&
      evidence.independent_evaluator === true &&
      evidence.candidate_did_not_grade_itself === true &&
      evidence.exact_provisional_claim_isolated === true &&
      evidence.customer_private_cases_used === false &&
      evidence.customer_identifiers_used === false &&
      evidence.safe_lease_contract === SAFE_LEASE_CONTRACT &&
      evidence.safe_lease_lane === SAFE_LEASE_LANE
  );
}

async function loadPlanByFingerprint(organizationId, fingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", BENCHMARK_PLAN_SCOPE)
    .eq("metadata->>benchmark_plan_fingerprint", fingerprint)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function recordAvantiqoKnowledgeCounterfactualBenchmarkEvaluation({
  benchmark_plan_fingerprint,
  execution_contract,
  evaluator_contract,
  baseline = {},
  candidate = {},
  regression_count = 0,
  quality_delta = null,
  hallucination_delta = null,
  evidence = {},
  evaluation_fingerprint,
} = {}) {
  const organizationId = learningScopeId();
  if (!organizationId) {
    throw new Error("AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_LEARNING_ORGANIZATION_REQUIRED");
  }
  const planFingerprint = text(benchmark_plan_fingerprint, 128).toLowerCase();
  if (!/^[a-f0-9]{32,128}$/.test(planFingerprint)) {
    throw new Error("AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_PLAN_FINGERPRINT_INVALID");
  }
  if (text(execution_contract, 180) !== AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EXECUTION_CONTRACT) {
    throw new Error("AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EXECUTION_CONTRACT_INVALID");
  }
  if (text(evaluator_contract, 180) !== AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EVALUATOR_CONTRACT) {
    throw new Error("AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EVALUATOR_CONTRACT_INVALID");
  }
  const evaluationFingerprint = text(evaluation_fingerprint, 128).toLowerCase();
  if (!/^[a-f0-9]{32,128}$/.test(evaluationFingerprint)) {
    throw new Error("AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EVALUATION_FINGERPRINT_INVALID");
  }

  const plan = await loadPlanByFingerprint(organizationId, planFingerprint);
  if (!plan) throw new Error("AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_PLAN_NOT_FOUND");
  const planMetadata = object(plan.metadata);
  if (text(planMetadata.status, 120) !== "READY_FOR_SAFE_LEASE_COUNTERFACTUAL_BENCHMARK") {
    throw new Error("AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_PLAN_NOT_READY");
  }

  const baselineMetrics = normalizeMetrics(baseline);
  const candidateMetrics = normalizeMetrics(candidate);
  const regressionCount = Math.max(0, Number.parseInt(regression_count, 10) || 0);
  const qualityDelta = Number.isFinite(Number(quality_delta))
    ? Number(quality_delta)
    : candidateMetrics.quality_score - baselineMetrics.quality_score;
  const hallucinationDelta = Number.isFinite(Number(hallucination_delta))
    ? Number(hallucination_delta)
    : candidateMetrics.hallucination_score - baselineMetrics.hallucination_score;
  const structuralEvidence = {
    same_cases_both_arms: evidence.same_cases_both_arms === true,
    blind_pairing: evidence.blind_pairing === true,
    independent_evaluator: evidence.independent_evaluator === true,
    candidate_did_not_grade_itself: evidence.candidate_did_not_grade_itself === true,
    exact_provisional_claim_isolated: evidence.exact_provisional_claim_isolated === true,
    customer_private_cases_used: evidence.customer_private_cases_used === true,
    customer_identifiers_used: evidence.customer_identifiers_used === true,
    safe_lease_contract: text(evidence.safe_lease_contract, 180),
    safe_lease_lane: text(evidence.safe_lease_lane, 120),
  };
  const eligible = evaluationEligible({
    baseline: baselineMetrics,
    candidate: candidateMetrics,
    regressionCount,
    qualityDelta,
    hallucinationDelta,
    evidence: structuralEvidence,
  });
  const nowIso = new Date().toISOString();
  const hypothesisFingerprint = text(planMetadata.hypothesis_fingerprint, 128);
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: BENCHMARK_EVALUATION_SCOPE,
    memory_key: `knowledge-counterfactual-evaluation:${evaluationFingerprint.slice(0, 40)}`,
    memory_type: eligible ? "completed_step" : "evidence",
    subject: plan.subject,
    content: eligible
      ? "Controlled counterfactual knowledge benchmark passed all final-promotion eligibility gates."
      : "Controlled counterfactual knowledge benchmark did not satisfy final-promotion eligibility gates.",
    importance: eligible ? 0.99 : 0.82,
    confidence: 1,
    source: "knowledge_counterfactual_benchmark_evaluation",
    active: true,
    valid_until: plan.valid_until || null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_CONTRACT,
      execution_contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EXECUTION_CONTRACT,
      evaluator_contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EVALUATOR_CONTRACT,
      status: eligible ? "FINAL_PROMOTION_REVIEW_ELIGIBLE" : "COUNTERFACTUAL_BENCHMARK_NOT_ELIGIBLE",
      eligible,
      benchmark_plan_fingerprint: planFingerprint,
      evaluation_fingerprint: evaluationFingerprint,
      hypothesis_fingerprint: hypothesisFingerprint,
      root_topic_key: planMetadata.root_topic_key || plan.subject,
      baseline: baselineMetrics,
      candidate: candidateMetrics,
      regression_count: regressionCount,
      quality_delta: Number(qualityDelta.toFixed(4)),
      hallucination_delta: Number(hallucinationDelta.toFixed(4)),
      evidence: structuralEvidence,
      minimum_case_count_required: MIN_CASES,
      minimum_pass_rate_required: MIN_PASS_RATE,
      minimum_quality_delta_required: MIN_QUALITY_DELTA,
      maximum_hallucination_delta_allowed: MAX_HALLUCINATION_DELTA,
      final_promotion_candidate_created: false,
      reusable_platform_knowledge_created: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_included: false,
      raw_case_payloads_persisted: false,
      raw_outputs_persisted: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      evaluated_at: nowIso,
    },
    updated_at: nowIso,
  };

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,subject,metadata,updated_at")
    .single();
  if (result.error) throw result.error;
  return {
    success: true,
    contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_CONTRACT,
    status: row.metadata.status,
    eligible,
    evaluation: result.data,
    governance: {
      benchmark_evaluation_does_not_promote_knowledge: true,
      final_promotion_candidate_created: false,
      reusable_platform_knowledge_created: false,
      automatic_knowledge_promotion: false,
      production_knowledge_effect: "NONE",
    },
  };
}

async function loadEligibleEvaluations(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,active,valid_until,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", BENCHMARK_EVALUATION_SCOPE)
    .eq("active", true)
    .eq("metadata->>status", "FINAL_PROMOTION_REVIEW_ELIGIBLE")
    .limit(MAX_ROWS);
  if (result.error) throw result.error;
  return list(result.data);
}

async function loadProvisionalByHypothesisFingerprint(organizationId, hypothesisFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,organization_id,memory_scope,memory_key,subject,content,active,valid_until,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", PROVISIONAL_SCOPE)
    .eq("metadata->>hypothesis_fingerprint", hypothesisFingerprint)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function finalCandidateRow({ organizationId, evaluation, graph, claimBinding, nowIso }) {
  const metadata = object(evaluation.metadata);
  const hypothesisFingerprint = text(metadata.hypothesis_fingerprint, 128);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: FINAL_PROMOTION_CANDIDATE_SCOPE,
    memory_key: `knowledge-final-promotion:${hypothesisFingerprint.slice(0, 40)}`,
    memory_type: "completed_step",
    subject: evaluation.subject,
    content: evaluation.content,
    importance: 0.99,
    confidence: 1,
    source: "counterfactual_knowledge_final_promotion_gate",
    active: true,
    valid_until: evaluation.valid_until || null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_CONTRACT,
      status: "FINAL_KNOWLEDGE_RELEASE_REVIEW_PENDING",
      hypothesis_fingerprint: hypothesisFingerprint,
      root_topic_key: metadata.root_topic_key || evaluation.subject,
      benchmark_plan_fingerprint: metadata.benchmark_plan_fingerprint,
      evaluation_fingerprint: metadata.evaluation_fingerprint,
      baseline: object(metadata.baseline),
      candidate: object(metadata.candidate),
      regression_count: Number(metadata.regression_count || 0),
      quality_delta: Number(metadata.quality_delta || 0),
      hallucination_delta: Number(metadata.hallucination_delta || 0),
      counterfactual_evidence: object(metadata.evidence),
      current_evidence_graph_contract: graph.contract || null,
      current_evidence_graph_available: graph.available === true,
      current_evidence_graph_blocks_reuse: graph.block_knowledge_reuse === true,
      ...claimBinding,
      exact_provisional_claim_bound: true,
      final_promotion_candidate_authenticity_required: true,
      final_promotion_candidate_authenticity_contract:
        AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
      provisional_claim_binding_contract: AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
      exact_claim_release_requires_separate_runtime: true,
      explicit_final_knowledge_release_required: true,
      production_knowledge_release_authorized: false,
      reusable_platform_knowledge: false,
      platform_knowledge_written: false,
      rollback_plan_required_before_release: true,
      monitored_post_release_revalidation_required: true,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      authorization_value: "none",
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      created_at: nowIso,
    },
    updated_at: nowIso,
  };
}

export async function reconcileAvantiqoKnowledgeFinalPromotionCandidates({ persist = true } = {}) {
  const organizationId = learningScopeId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      candidate_count: 0,
    };
  }

  const evaluations = await loadEligibleEvaluations(organizationId);
  const candidates = [];
  const blocked = [];
  const nowIso = new Date().toISOString();
  for (const evaluation of evaluations) {
    const metadata = object(evaluation.metadata);
    const hypothesisFingerprint = text(metadata.hypothesis_fingerprint, 128);
    const provisional = await loadProvisionalByHypothesisFingerprint(
      organizationId,
      hypothesisFingerprint,
    );
    if (!provisional || !eligibleProvisional(provisional)) {
      blocked.push({
        hypothesis_fingerprint: hypothesisFingerprint,
        reason: "ACTIVE_PROVISIONAL_CLAIM_NOT_ELIGIBLE_FOR_FINAL_PROMOTION",
      });
      continue;
    }
    const claimBinding = createAvantiqoFinalPromotionCandidateClaimBinding(provisional);
    if (!claimBinding.success || !claimBinding.binding) {
      blocked.push({
        hypothesis_fingerprint: hypothesisFingerprint,
        reason: claimBinding.reason || "FINAL_PROMOTION_PROVISIONAL_CLAIM_BINDING_REQUIRED",
      });
      continue;
    }
    const graph = await inspectAvantiqoEvidenceGraph({
      organizationId,
      query: provisional.content,
      freshnessDays: 90,
      limit: 8,
    }).catch((error) => ({
      contract: "AVANTIQO_EVIDENCE_GRAPH_V1",
      available: false,
      block_knowledge_reuse: true,
      reason: "EVIDENCE_GRAPH_READ_FAILED",
      error: text(error?.message || error, 500),
      matches: [],
      conflicts: [],
    }));
    if (graph.available !== true || graph.block_knowledge_reuse === true) {
      blocked.push({
        hypothesis_fingerprint: hypothesisFingerprint,
        reason: graph.block_knowledge_reuse === true
          ? "CURRENT_CONTRADICTION_BLOCKS_FINAL_PROMOTION_CANDIDATE"
          : "CURRENT_EVIDENCE_GRAPH_REQUIRED",
      });
      continue;
    }
    const candidate = finalCandidateRow({
      organizationId,
      evaluation,
      graph,
      claimBinding: claimBinding.binding,
      nowIso,
    });
    const sealed = sealAvantiqoFinalPromotionCandidateAuthenticity(candidate);
    if (!sealed.success || !sealed.row) {
      blocked.push({
        hypothesis_fingerprint: hypothesisFingerprint,
        reason: sealed.reason || "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_REQUIRED",
      });
      continue;
    }
    candidates.push(sealed.row);
  }

  const writes = persist ? await upsertRows(candidates) : 0;
  return {
    success: true,
    contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_CONTRACT,
    status: candidates.length ? "AUTHENTICATED_FINAL_KNOWLEDGE_RELEASE_REVIEW_CANDIDATES_READY" : "NO_FINAL_KNOWLEDGE_RELEASE_REVIEW_CANDIDATE",
    candidate_count: candidates.length,
    candidate_write_count: writes,
    blocked_count: blocked.length,
    blocked,
    release_policy: {
      benchmark_pass_is_not_release_authority: true,
      final_candidate_is_not_reusable_platform_knowledge: true,
      provisional_claim_binding_required: true,
      final_promotion_candidate_authenticity_required: true,
      database_only_writer_cannot_reseal_final_promotion_candidate_without_server_key: true,
      post_benchmark_claim_drift_requires_fresh_promotion_cycle: true,
      unsigned_final_promotion_candidate_compatibility_allowed: false,
      explicit_final_knowledge_release_required: true,
      rollback_plan_required_before_release: true,
      monitored_post_release_revalidation_required: true,
    },
    governance: {
      provider_free: true,
      final_promotion_candidates_sealed: candidates.length,
      platform_knowledge_written: false,
      reusable_platform_knowledge_created: false,
      production_knowledge_release_authorized: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoKnowledgeCounterfactualBenchmarkRuntime = Object.freeze({
  contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_CONTRACT,
  execution_contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EXECUTION_CONTRACT,
  evaluator_contract: AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EVALUATOR_CONTRACT,
  reconcilePlans: reconcileAvantiqoKnowledgeCounterfactualBenchmarkPlans,
  recordEvaluation: recordAvantiqoKnowledgeCounterfactualBenchmarkEvaluation,
  reconcileFinalPromotionCandidates: reconcileAvantiqoKnowledgeFinalPromotionCandidates,
});
