import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const lifecycle = await readFile(
  "lib/code/runtime/CodeAIEngineeringSkillLifecycleRuntime.js",
  "utf8",
);
const skills = await readFile(
  "lib/code/runtime/CodeAIEngineeringSkillRuntime.js",
  "utf8",
);
const workPackage = await readFile(
  "lib/code/runtime/CodeAIWorkPackageRuntime.js",
  "utf8",
);
const capability = await readFile(
  "lib/platform/capabilities/createCodeAIAutonomousCapability.js",
  "utf8",
);
const authenticity = await readFile(
  "lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateAuthenticityRuntime.js",
  "utf8",
);

test("engineering skill lifecycle decays only from direct current-HEAD contradiction", () => {
  assert.match(lifecycle, /AVANTIQO_CODE_AI_ENGINEERING_SKILL_LIFECYCLE_V1/);
  assert.match(lifecycle, /direct_current_head_contradiction_required_for_decay:\s*true/);
  assert.match(lifecycle, /sha_movement_alone_causes_decay:\s*false/);
  assert.match(lifecycle, /repository_head_movement_without_contradiction/);
  assert.match(lifecycle, /architecture_drift_signal/);
  assert.match(lifecycle, /pre_mutation_verifier_failures/);
  assert.match(lifecycle, /failed_pre_mutation_area_reads/);
});

test("engineering skills move through explicit lifecycle states and suppress contradicted patterns", () => {
  assert.match(lifecycle, /"FORMED"/);
  assert.match(lifecycle, /"PROVEN"/);
  assert.match(lifecycle, /"DECAYING"/);
  assert.match(lifecycle, /"SUPPRESSED"/);
  assert.match(lifecycle, /"PROMOTION_CANDIDATE"/);
  assert.match(lifecycle, /effectiveUseCount\s*>?=\s*3/);
  assert.match(lifecycle, /revalidationSuccessCount\s*>?=\s*3/);
  assert.match(lifecycle, /verifiedSuccessCount\s*>?=\s*3/);
  assert.match(lifecycle, /contradictionCount\s*===\s*0/);
  assert.match(lifecycle, /architectureDriftCount\s*===\s*0/);
  assert.match(lifecycle, /lifecycleScore\s*>?=\s*0\.82/);
});

test("skill governance supports deterministic equivalent merge and broad-skill splitting", () => {
  assert.match(lifecycle, /mergeEquivalentSkills/);
  assert.match(lifecycle, /stableSkillSignature/);
  assert.match(lifecycle, /merged_equivalent_skill_ids/);
  assert.match(lifecycle, /splitOverlyBroadSkills/);
  assert.match(lifecycle, /CROSS_AREA_VERIFIER_SKILL/);
  assert.match(lifecycle, /AREA_VERIFICATION_SKILL/);
  assert.match(lifecycle, /split_from_skill_id/);
  assert.match(lifecycle, /dynamic_merge_split:\s*true/);
  assert.match(skills, /source_missions:/);
});

test("Code planner applies lifecycle governance before formed skills become advisory context", () => {
  assert.match(workPackage, /governCodeAIEngineeringSkills/);
  assert.match(workPackage, /resolveEngineeringSkills/);
  assert.match(workPackage, /engineering_skill_lifecycle_contract/);
  assert.match(workPackage, /engineering_skill_lifecycle_feedback:\s*true/);
  assert.match(workPackage, /engineering_skill_lifecycle_failure_blocks_code:\s*false/);
  assert.match(workPackage, /engineering_skill_sha_movement_alone_causes_decay:\s*false/);
  assert.match(workPackage, /engineering_skill_direct_platform_knowledge_write_allowed:\s*false/);
  assert.match(workPackage, /allowPromotionCandidate:\s*false/);
});

test("final verified Code boundary alone may evaluate skill promotion", () => {
  assert.match(capability, /recordCodeAIEngineeringSkillLifecycleOutcome/);
  assert.match(capability, /allowPromotionCandidate:\s*verifiedEmployeeCompletion\(result\)/);
  assert.match(capability, /FINAL_SKILL_LIFECYCLE_RECORD_FAILED/);
  assert.match(capability, /verified_code_result_remains_valid/);
  assert.match(capability, /direct_platform_knowledge_write_allowed:\s*false/);
  assert.match(capability, /reusable_platform_knowledge_written:\s*false/);
  assert.match(capability, /automatic_knowledge_promotion:\s*false/);
});

test("skill promotion writes only an HMAC-sealed Learning evidence candidate", () => {
  assert.match(lifecycle, /platform_learning_evidence_candidates/);
  assert.match(lifecycle, /EVIDENCE_CANDIDATE_NOT_RELEASED/);
  assert.match(lifecycle, /knowledge_router_reuse_allowed:\s*false/);
  assert.match(lifecycle, /explicit_final_promotion_required:\s*true/);
  assert.match(lifecycle, /requires_epistemic_promotion_pipeline:\s*true/);
  assert.match(lifecycle, /direct_platform_knowledge_write_allowed:\s*false/);
  assert.match(lifecycle, /sealAvantiqoLearningEvidenceCandidateAuthenticity/);
  assert.match(lifecycle, /evidence_candidate_authenticity_required:\s*true/);
  assert.match(lifecycle, /raw_source_code_included:\s*false/);
  assert.match(lifecycle, /raw_patch_included:\s*false/);
  assert.match(lifecycle, /raw_reasoning_persisted:\s*false/);
  assert.match(authenticity, /HMAC-SHA256/);
  assert.match(authenticity, /domain_separated_from_observation_authenticity:\s*true/);
});

test("skill lifecycle never grants commit, deployment or automatic model-training authority", () => {
  assert.match(lifecycle, /commit_authority:\s*false/);
  assert.match(lifecycle, /production_deploy_authority:\s*false/);
  assert.match(lifecycle, /automatic_training_effect:\s*"NONE"/);
  assert.match(lifecycle, /automatic_model_weight_mutation:\s*false/);
  assert.match(lifecycle, /production_model_promotion_effect:\s*"NONE"/);
  assert.match(lifecycle, /automatic_runpod_submission:\s*false/);
  assert.match(lifecycle, /authorization_effect:\s*"NONE"/);
});
