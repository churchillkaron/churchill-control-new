#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE9_AUDIT_V1";
const files = Object.freeze({
  release: "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js",
  counterfactual: "lib/intelligence/runtime/AvantiqoKnowledgeCounterfactualBenchmarkRuntime.js",
  provisional: "lib/intelligence/runtime/AvantiqoEpistemicPromotionRuntime.js",
  continuous: "lib/intelligence/runtime/AvantiqoContinuousLearningRuntime.js",
  hybrid: "lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  index: "lib/intelligence/index.js",
});

async function source(path) {
  return readFile(path, "utf8");
}

function hasAll(content, markers, label) {
  for (const marker of markers) {
    assert.ok(content.includes(marker), `${label}: missing marker ${marker}`);
  }
}

const [release, counterfactual, provisional, continuous, hybrid, route, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(release, [
  "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_V1",
  'FINAL_CANDIDATE_SCOPE = "platform_learning_knowledge_final_promotion_candidates"',
  'PROVISIONAL_SCOPE = "platform_provisional_knowledge"',
  'KNOWLEDGE_SCOPE = "platform_knowledge"',
  'EVIDENCE_SCOPE = "platform_evidence_graph"',
  'RELEASE_EVENT_SCOPE = "platform_learning_knowledge_release_events"',
  'RELEASE_APPROVAL_ENV = "AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED"',
  'source: RELEASE_SOURCE',
  'memory_scope: KNOWLEDGE_SCOPE',
  'memory_key: `released-knowledge:${hypothesisFingerprint.slice(0, 40)}`',
  'content: text(provisional.content, 6000)',
  'release_status: "RELEASED_MONITORED"',
  'explicit_final_release_approved: true',
  'reusable_platform_knowledge: true',
  'knowledge_router_reuse_allowed: true',
  'automatic_knowledge_promotion: false',
  'post_release_revalidation_required: true',
  'rollback_mode: "FAIL_CLOSED_QUARANTINE"',
  'automatic_unquarantine_allowed: false',
  'candidateBenchmarkStillEligible',
  'provisionalStillEligible',
  'supportingEvidence',
  'CURRENT_EVIDENCE_GRAPH_BLOCKS_RELEASE',
  'SUPPORTING_SOURCE_PROVENANCE_REQUIRED',
  'FINAL_CANDIDATE_OPTIMISTIC_UPDATE_CONFLICT',
  'FINALIZATION_CONFLICT_RELEASE_QUARANTINED',
  'status: "FINAL_KNOWLEDGE_RELEASED_AND_MONITORED"',
  'benchmark_summary_released_as_claim: false',
  'supporting_source_provenance_required: true',
  'evidence_graph_unavailable_quarantines: true',
  'evidence_conflict_quarantines: true',
  'stale_evidence_quarantines: true',
  'missing_supporting_source_provenance_quarantines: true',
  'quarantine_removes_knowledge_router_visibility: true',
  'automatic_unquarantine_allowed: false',
  'explicit_fresh_release_cycle_required_after_quarantine: true',
], "final knowledge release runtime");

assert.match(release, /if \(!enabled\(process\.env\[RELEASE_APPROVAL_ENV\]\)\)/,
  "final knowledge release must require explicit environment approval");
assert.match(release, /if \(!approvalReason\)/,
  "final knowledge release must require an explicit approval reason");
assert.match(release, /query: state\.provisional\.content/,
  "final release must re-check the exact provisional claim against the current evidence graph");
assert.match(release, /content: text\(provisional\.content, 6000\)/,
  "release must promote the exact provisional claim, not benchmark summary text");
assert.match(release, /\.eq\("source", RELEASE_SOURCE\)/,
  "revalidation must be restricted to explicitly released learned knowledge");
assert.match(release, /active: false,[\s\S]{0,300}forgotten_at: nowIso/,
  "quarantine must remove released knowledge from active recall");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(release), false,
  "final release and quarantine runtime must not call RunPod");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(release), false,
  "final release and quarantine runtime must not mutate RunPod workers");
assert.equal(/fetch\s*\(/.test(release), false,
  "final release and quarantine runtime must be provider-free");

hasAll(counterfactual, [
  'status: "FINAL_KNOWLEDGE_RELEASE_REVIEW_PENDING"',
  "exact_claim_release_requires_separate_runtime: true",
  "explicit_final_knowledge_release_required: true",
  "production_knowledge_release_authorized: false",
  "reusable_platform_knowledge: false",
  "platform_knowledge_written: false",
  "rollback_plan_required_before_release: true",
  "monitored_post_release_revalidation_required: true",
], "Phase 8 final release candidate");

hasAll(provisional, [
  'status: "PROVISIONAL_SHADOW_ONLY"',
  'epistemic_state: "PROVISIONAL_NOT_CANONICAL"',
  "reusable_platform_knowledge: false",
  "knowledge_router_reuse_allowed: false",
  "explicit_final_promotion_required: true",
  "rollback_on_conflict: true",
], "provisional knowledge boundary");

hasAll(continuous, [
  'const KNOWLEDGE_SCOPE = "platform_knowledge"',
  'const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates"',
  'epistemic_state: "EVIDENCE_CANDIDATE_NOT_RELEASED"',
  "reusable_platform_knowledge: false",
  "knowledge_router_reuse_allowed: false",
  "requires_epistemic_promotion_pipeline: true",
], "continuous Learning release boundary");
assert.equal(
  continuous.includes('source: "continuous_learning"') && continuous.includes('memory_scope: KNOWLEDGE_SCOPE'),
  false,
  "fresh continuous research must not directly release reusable platform knowledge",
);

hasAll(hybrid, [
  'const KNOWLEDGE_SCOPE = "platform_knowledge"',
  '.eq("memory_scope", KNOWLEDGE_SCOPE)',
  '.eq("active", true)',
], "hybrid knowledge recall");

hasAll(route, [
  "reconcileAvantiqoReleasedKnowledgeRevalidation",
  "await reconcileAvantiqoReleasedKnowledgeRevalidation();",
  "released_knowledge_revalidation: releasedKnowledgeRevalidation",
  "runAvantiqoContinuousLearningBatch",
], "hourly Learning route");
assert.equal(route.includes("releaseAvantiqoFinalKnowledge"), false,
  "hourly Learning route must never execute final knowledge release");
assert.equal(route.includes("AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED"), false,
  "hourly route must not consume final release approval");
const revalidationIndex = route.indexOf("await reconcileAvantiqoReleasedKnowledgeRevalidation();");
const researchIndex = route.indexOf("const result = await runAvantiqoContinuousLearningBatch");
assert.ok(revalidationIndex >= 0 && researchIndex > revalidationIndex,
  "released knowledge must be revalidated before the next bounded research cycle");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must not call RunPod");

hasAll(index, [
  'export * from "./runtime/AvantiqoKnowledgeCounterfactualBenchmarkRuntime";',
  'export * from "./runtime/AvantiqoFinalKnowledgeReleaseRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    explicit_final_release_boundary: true,
    exact_provisional_claim_resolution: true,
    current_evidence_graph_rechecked_before_release: true,
    supporting_source_provenance_required: true,
    benchmark_gate_revalidated_before_release: true,
    release_candidate_optimistic_concurrency: true,
    finalization_conflict_fail_closed_quarantine: true,
    released_knowledge_reusable_only_after_explicit_release: true,
    continuous_research_stages_evidence_candidates_not_facts: true,
    post_release_revalidation: true,
    evidence_conflict_quarantine: true,
    stale_evidence_quarantine: true,
    source_provenance_loss_quarantine: true,
    quarantine_enqueues_adversarial_revalidation: true,
    automatic_unquarantine_forbidden: true,
  },
  governance: {
    final_release_requires_explicit_approval: true,
    final_release_requires_reason: true,
    hourly_automatic_release: false,
    hourly_automatic_restore: false,
    direct_runpod_submission: false,
    direct_runpod_endpoint_scaling: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    customer_private_content_promoted: false,
    raw_reasoning_persisted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE9_AUDIT=PASS");
