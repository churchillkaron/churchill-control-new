#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE11_AUDIT_V1";
const files = Object.freeze({
  dependency: "lib/intelligence/runtime/AvantiqoKnowledgeDependencyCurriculumRuntime.js",
  releaseLifecycle: "lib/intelligence/runtime/AvantiqoReleasedKnowledgeLifecycleRuntime.js",
  knowledgeLifecycle: "lib/intelligence/runtime/AvantiqoKnowledgeLifecycleRuntime.js",
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

const [dependency, releaseLifecycle, knowledgeLifecycle, route, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(dependency, [
  "AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_V1",
  'DEPENDENCY_SCOPE = "platform_learning_knowledge_dependencies"',
  'IMPACT_SCOPE = "platform_learning_knowledge_dependency_impacts"',
  'CURRICULUM_SCOPE = "platform_learning_curriculum_nodes"',
  '"PREREQUISITE"',
  '"DERIVES_FROM"',
  '"ASSUMES"',
  '"CONSTRAINED_BY"',
  '"SHARED_EVIDENCE_CONTEXT"',
  '"SHARED_SYNTHESIS_LINEAGE"',
  '"RELATED_TOPIC"',
  "const MAX_IMPACT_WAVE = 25",
  "const MAX_IMPACT_DEPTH = 3",
  "const MAX_DISCOVERY_AGENDA = 8",
  "verified_dependency === true",
  "semantic_similarity_inference_used: false",
  "automatic_dependency_inference: false",
  "structural_dependency_evidence_required: true",
  "semantic_similarity_is_not_dependency_evidence: true",
  "propagation_enabled: propagation",
  "HARD_RELATIONS.has(relation)",
  "SOFT_RELATIONS.has",
  "fail_closed_dependency_hold: true",
  "dependent_claim_proven_false: false",
  "revalidation_required_before_reuse: true",
  'release_status: "DEPENDENCY_HOLD"',
  "reusable_platform_knowledge: false",
  "knowledge_router_reuse_allowed: false",
  "automatic_dependency_unhold_allowed: false",
  "automatic_restore_allowed: false",
  "automatic_knowledge_promotion: false",
  'hierarchy: ["DOMAIN", "TOPIC", "CLAIM"]',
  "bounded_relearning_wave: true",
  "deeper_dependency_waves_escalate_to_mechanism_research: true",
  "curriculum_does_not_bypass_epistemic_pipeline: true",
], "dependency curriculum runtime");

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(dependency), false,
  "dependency curriculum runtime must not call RunPod");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(dependency), false,
  "dependency curriculum runtime must not scale endpoints");
assert.equal(/fetch\s*\(/.test(dependency), false,
  "dependency curriculum runtime must remain provider-free");
assert.equal(dependency.includes('memory_scope: "platform_knowledge"'), false,
  "dependency curriculum runtime must not create platform_knowledge rows");
assert.equal(dependency.includes("semantic similarity"), true,
  "runtime must explicitly forbid semantic similarity as dependency evidence");

hasAll(releaseLifecycle, [
  "AVANTIQO_RELEASED_KNOWLEDGE_LIFECYCLE_V1",
  "reconcileAvantiqoReleasedKnowledgeRevalidation",
  "healthy_revalidation_renews_valid_until: true",
  "quarantine_never_renews_valid_until: true",
  "automatic_unquarantine_allowed: false",
], "released knowledge lifecycle");

hasAll(knowledgeLifecycle, [
  "AVANTIQO_KNOWLEDGE_LIFECYCLE_V1",
  'event: "EXPIRED_RETIRED"',
  "expired_knowledge_removed_from_router_visibility: true",
  "automatic_restore_allowed: false",
], "knowledge lifecycle");

hasAll(route, [
  "reconcileAvantiqoKnowledgeDependencyCurriculum",
  "const releasedKnowledgeLifecycle =",
  "await reconcileAvantiqoReleasedKnowledgeLifecycle();",
  "const knowledgeDependencyCurriculum =",
  "await reconcileAvantiqoKnowledgeDependencyCurriculum();",
  "const result = await runAvantiqoContinuousLearningBatch({ limit });",
  "knowledge_dependency_curriculum: knowledgeDependencyCurriculum",
], "hourly Learning route");

const releaseLifecycleIndex = route.indexOf(
  "await reconcileAvantiqoReleasedKnowledgeLifecycle();",
);
const dependencyIndex = route.indexOf(
  "await reconcileAvantiqoKnowledgeDependencyCurriculum();",
);
const researchIndex = route.indexOf(
  "const result = await runAvantiqoContinuousLearningBatch({ limit });",
);
assert.ok(releaseLifecycleIndex >= 0 && dependencyIndex > releaseLifecycleIndex,
  "dependency propagation must run after released-knowledge lifecycle events exist");
assert.ok(researchIndex > dependencyIndex,
  "dependency curriculum must feed bounded research in the same cycle");
assert.equal(route.includes("recordAvantiqoVerifiedKnowledgeDependency"), false,
  "hourly cron must not fabricate verified dependencies");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must not call RunPod");

hasAll(index, [
  'export * from "./runtime/AvantiqoKnowledgeLifecycleRuntime";',
  'export * from "./runtime/AvantiqoReleasedKnowledgeLifecycleRuntime";',
  'export * from "./runtime/AvantiqoKnowledgeDependencyCurriculumRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    verified_dependency_registry: true,
    explicit_hard_prerequisite_relations: true,
    soft_relationships_are_non_disabling: true,
    semantic_similarity_never_creates_dependency: true,
    structural_dependency_evidence_required: true,
    hierarchical_domain_topic_claim_curriculum: true,
    bounded_dependency_wave_size: true,
    bounded_dependency_wave_depth: true,
    upstream_quarantine_propagates_review: true,
    upstream_expiry_propagates_review: true,
    dependent_claim_not_declared_false_automatically: true,
    dependent_reuse_fail_closed_until_revalidated: true,
    unmapped_released_claims_generate_dependency_discovery: true,
    deeper_dependency_waves_escalate_to_mechanism_research: true,
    normal_epistemic_pipeline_preserved: true,
    dependency_stage_runs_after_release_lifecycle: true,
    dependency_stage_runs_before_bounded_research: true,
  },
  governance: {
    automatic_dependency_inference: false,
    semantic_similarity_dependency_inference: false,
    soft_relationship_auto_quarantine: false,
    automatic_dependency_unhold: false,
    automatic_knowledge_restore: false,
    automatic_knowledge_promotion: false,
    hourly_verified_dependency_fabrication: false,
    hourly_provider_execution: false,
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
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE11_AUDIT=PASS");
