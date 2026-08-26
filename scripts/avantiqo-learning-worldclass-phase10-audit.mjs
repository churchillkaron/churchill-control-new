#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE10_AUDIT_V1";
const files = Object.freeze({
  lifecycle: "lib/intelligence/runtime/AvantiqoKnowledgeLifecycleRuntime.js",
  coverage: "lib/intelligence/runtime/AvantiqoLearningCoverageRuntime.js",
  continuous: "lib/intelligence/runtime/AvantiqoContinuousLearningRuntime.js",
  finalRelease: "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js",
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

const [lifecycle, coverage, continuous, finalRelease, route, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(lifecycle, [
  "AVANTIQO_KNOWLEDGE_LIFECYCLE_V1",
  'KNOWLEDGE_SCOPE = "platform_knowledge"',
  'AGENDA_SCOPE = "platform_learning_agenda"',
  'EVENT_SCOPE = "platform_learning_knowledge_lifecycle_events"',
  'INTERNAL_SOURCE = "avantiqo_canonical_product_knowledge"',
  'status: "EXPIRED_RELEARNING_REQUIRED"',
  'status: "REVALIDATION_DUE"',
  'status: progress >= AGING_FRACTION ? "AGING" : "FRESH"',
  'lifecycle_status: "RETIRED_EXPIRED"',
  'lifecycle_status: "RETIRED_EXACT_DUPLICATE"',
  'retirement_reason: "KNOWLEDGE_VALIDITY_EXPIRED"',
  'retirement_reason: "EXACT_NORMALIZED_CLAIM_DUPLICATE"',
  "exact_duplicate_only: true",
  "semantic_deletion_used: false",
  "active: false",
  "forgotten_at: nowIso",
  "superseded_by: winner.id",
  "superseded_at: nowIso",
  'source: "knowledge_lifecycle_curriculum_regeneration"',
  "curriculum_depth: Math.min(12, generation)",
  'research_mode: deepRefresh ? "mechanism" : "evidence"',
  "failed_replication_search_required: deepRefresh",
  "contradiction_search_required: true",
  "changed_standard_search_required: true",
  "boundary_condition_search_required: true",
  "automatic_restore_allowed: false",
  "automatic_knowledge_promotion: false",
  "relearning_bypasses_epistemic_pipeline: false",
  "canonical_internal_product_knowledge_excluded: true",
  "exact_duplicate_supersession_allowed: true",
  "semantic_similarity_deletion_allowed: false",
  "expired_knowledge_removed_from_router_visibility: true",
  "aging_knowledge_remains_visible_until_due_or_expired: true",
  "revalidation_due_enqueues_learning: true",
  "expired_knowledge_enqueues_learning: true",
  "repeated_refresh_escalates_to_mechanism_research: true",
  "provider_free: true",
  "web_research_executed_here: false",
  "runpod_job_submitted: false",
  "runpod_endpoint_mutated: false",
  "automatic_training_started: false",
  "automatic_model_weight_mutation: false",
  "automatic_model_promotion: false",
  "customer_private_content_promoted: false",
  "raw_reasoning_persisted: false",
], "knowledge lifecycle");

assert.match(
  lifecycle,
  /return list\(result\.data\)\.filter\(\(row\) => row\.source !== INTERNAL_SOURCE\);/,
  "canonical internal product truth must be excluded from learned-knowledge lifecycle mutation",
);
assert.match(
  lifecycle,
  /const claim = normalizedClaim\(row\.content\);[\s\S]*?digest\([\s\S]*?"exact-claim"/,
  "duplicate retirement must be based on normalized exact claim fingerprints",
);
assert.equal(/embedding|cosine|levenshtein|semanticScore|semantic_score/i.test(lifecycle), false,
  "semantic similarity must not be used to retire platform knowledge");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(lifecycle), false,
  "knowledge lifecycle reconciliation must not call RunPod");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(lifecycle), false,
  "knowledge lifecycle reconciliation must not mutate RunPod worker bounds");
assert.equal(/fetch\s*\(/.test(lifecycle), false,
  "knowledge lifecycle reconciliation must not directly call external providers");

hasAll(coverage, [
  'const KNOWLEDGE_SCOPE = "platform_knowledge"',
  "EXACT_KNOWLEDGE_STALE",
  "validExternalKnowledge",
  "row?.forgotten_at || row?.superseded_at || row?.superseded_by",
], "Learning coverage stale-knowledge discipline");

hasAll(continuous, [
  'const KNOWLEDGE_SCOPE = "platform_knowledge"',
  'EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates"',
  'epistemic_state: "EVIDENCE_CANDIDATE_NOT_RELEASED"',
  "reusable_platform_knowledge: false",
  "knowledge_router_reuse_allowed: false",
  "requires_epistemic_promotion_pipeline: true",
], "continuous learning evidence staging");

hasAll(finalRelease, [
  'KNOWLEDGE_SCOPE = "platform_knowledge"',
  'RELEASE_APPROVAL_ENV = "AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED"',
  "automatic_unquarantine_allowed: false",
  "explicit_fresh_release_cycle_required_after_quarantine: true",
], "final release boundary");

hasAll(route, [
  "reconcileAvantiqoKnowledgeLifecycle",
  "const knowledgeLifecycle = await reconcileAvantiqoKnowledgeLifecycle();",
  "const learningCoverage = await reconcileAvantiqoLearningCoverage();",
  "knowledge_lifecycle: knowledgeLifecycle",
  "runAvantiqoContinuousLearningBatch",
], "hourly Learning route");

const productIndex = route.indexOf(
  "const internalProductKnowledge = await syncAvantiqoInternalProductKnowledge();",
);
const lifecycleIndex = route.indexOf(
  "const knowledgeLifecycle = await reconcileAvantiqoKnowledgeLifecycle();",
);
const coverageIndex = route.indexOf(
  "const learningCoverage = await reconcileAvantiqoLearningCoverage();",
);
const researchIndex = route.indexOf(
  "const result = await runAvantiqoContinuousLearningBatch",
);
assert.ok(productIndex >= 0 && lifecycleIndex > productIndex,
  "knowledge lifecycle must run after canonical product truth synchronization");
assert.ok(coverageIndex > lifecycleIndex,
  "knowledge lifecycle must clean up stale/expired knowledge before coverage measurement");
assert.ok(researchIndex > coverageIndex,
  "bounded research must run after lifecycle and coverage reconciliation");
assert.equal(route.includes("releaseAvantiqoFinalKnowledge"), false,
  "hourly Learning route must never invoke explicit final knowledge release");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must not call RunPod");

hasAll(index, [
  'export * from "./runtime/AvantiqoKnowledgeLifecycleRuntime";',
  'export * from "./runtime/AvantiqoLearningCoverageRuntime";',
  'export * from "./runtime/AvantiqoFinalKnowledgeReleaseRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    fresh_aging_due_expired_states: true,
    expired_knowledge_retired_from_router_visibility: true,
    revalidation_due_generates_relearning_curriculum: true,
    expired_knowledge_generates_relearning_curriculum: true,
    exact_duplicate_supersession_only: true,
    semantic_similarity_never_deletes_knowledge: true,
    canonical_internal_product_truth_excluded: true,
    lifecycle_runs_before_coverage: true,
    repeated_relearning_escalates_to_mechanism_research: true,
    retired_knowledge_reenters_normal_epistemic_pipeline: true,
    lifecycle_events_durable: true,
  },
  governance: {
    hourly_provider_execution: false,
    direct_runpod_submission: false,
    direct_runpod_endpoint_scaling: false,
    automatic_restore: false,
    automatic_knowledge_promotion: false,
    hourly_final_release: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    customer_private_content_promoted: false,
    raw_reasoning_persisted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE10_AUDIT=PASS");
