#!/usr/bin/env node

import fs from "node:fs";

const CONTRACT = "AVANTIQO_INTELLIGENCE_MODAL_ONLY_CONVERGENCE_REPAIR_V2";

function exact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${CONTRACT}_${label}_EXPECTED_ONCE_FOUND_${count}`);
  return source.replace(before, after);
}

function all(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count < 1) throw new Error(`${CONTRACT}_${label}_EXPECTED_AT_LEAST_ONCE`);
  return source.split(before).join(after);
}

function patch(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${CONTRACT}_${path}_UNCHANGED`);
  fs.writeFileSync(path, after);
}

patch("lib/operator/runtime/OperatorReasoningRuntime.js", (source) => {
  let next = exact(
    source,
    "function localDevelopmentOwnedReasoningPolicy() {\n  return ownedOperatorIntelligenceSelectionPolicy();\n}",
    "function localDevelopmentOwnedReasoningPolicy() {\n  if (text(process.env.NODE_ENV).toLowerCase() !== \"development\") return null;\n  return ownedOperatorIntelligenceSelectionPolicy();\n}",
    "OPERATOR_LOCAL_POLICY_GUARD",
  );
  next = exact(
    next,
    "    ...(localOwnedReasoning || {}),\n    input: {",
    "    ...ownedOperatorIntelligenceSelectionPolicy(),\n    input: {",
    "OPERATOR_DEEP_OWNED_SELECTION",
  );
  return next;
});

patch("app/api/operator/turn/route.js", (source) => {
  if (/export const runtime\s*=\s*[\"']nodejs[\"']/.test(source)) {
    throw new Error(`${CONTRACT}_OPERATOR_ROUTE_NODE_RUNTIME_ALREADY_PRESENT`);
  }
  if (/export const maxDuration\s*=/.test(source)) {
    throw new Error(`${CONTRACT}_OPERATOR_ROUTE_MAX_DURATION_ALREADY_PRESENT`);
  }
  return `export const runtime = "nodejs";\nexport const maxDuration = 300;\n\n${source}`;
});

patch("lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js", (source) => {
  let next = all(source, "READY_FOR_SAFE_LEASE_SYNTHESIS", "READY_FOR_MODAL_SYNTHESIS", "READY_STATE");
  next = all(next, "SAFE_LEASE_SYNTHESIS_READY", "MODAL_SYNTHESIS_READY", "SUMMARY_STATE");
  next = exact(
    next,
    '      synthesis_execution_lane: "intelligence-deep",\n      synthesis_safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",\n      synthesis_safe_lease_required: mode !== "evidence",',
    '      synthesis_execution_lane: "deep",\n      synthesis_runtime_contract: "AVANTIQO_INTELLIGENCE_MODAL_H100_V1",\n      synthesis_modal_only: mode !== "evidence",',
    "SYNTHESIS_RUNTIME_METADATA",
  );
  next = all(next, "automatic_runpod_submission: false", "automatic_non_modal_submission: false", "NON_MODAL_GUARD");
  return next;
});

const audit = String.raw`#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE4_AUDIT_V2";
const files = Object.freeze({
  mechanism: "lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js",
  policy: "lib/platform/research/runtime/OperatorMechanismResearchPolicy.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  child: "scripts/run-avantiqo-learning-mechanism-synthesis-modal-child-local.mjs",
  index: "lib/intelligence/index.js",
});

const source = (path) => readFile(path, "utf8");
function hasAll(content, markers, label) {
  for (const marker of markers) {
    assert.ok(content.includes(marker), label + ": missing marker " + marker);
  }
}

const [mechanism, policy, route, child, index] = await Promise.all(Object.values(files).map(source));

hasAll(mechanism, [
  "AVANTIQO_MECHANISM_FIRST_LEARNING_V1",
  '"UNDERSTAND_PROBLEM"',
  '"MAP_MECHANISMS"',
  '"IDENTIFY_CONSTRAINTS"',
  '"RESEARCH_ADJACENT_FIELDS"',
  '"FORM_FALSIFIABLE_HYPOTHESES"',
  '"DESIGN_DISCRIMINATING_EXPERIMENTS"',
  '"EXECUTE_GOVERNED_EXPERIMENTS"',
  '"LEARN_FROM_RESULTS"',
  '"INVENT_ALTERNATIVES"',
  '"VERIFY_AND_REPEAT"',
  "inferOperatorResearchMode",
  "operatorResearchRequirements",
  '"READY_FOR_MODAL_SYNTHESIS"',
  'synthesis_execution_lane: "deep"',
  'synthesis_runtime_contract: "AVANTIQO_INTELLIGENCE_MODAL_H100_V1"',
  'synthesis_modal_only: mode !== "evidence"',
  "search_is_evidence_collection_not_problem_solving: true",
  "understand_problem_before_solution_search: true",
  "mechanism_before_imitation: true",
  "identify_real_constraints: true",
  "failed_approach_does_not_prove_impossibility: true",
  "adjacent_science_and_engineering_research: true",
  "falsifiable_hypotheses: true",
  "discriminating_experiments: true",
  "invent_test_learn_repeat: true",
  "hourly_director_provider_free: true",
  "automatic_gpu_execution: false",
  "automatic_non_modal_submission: false",
  "automatic_experiment_execution: false",
], "mechanism-first Learning director");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io|AVANTIQO_RUNPOD_SAFE_LEASE/.test(mechanism), false);
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(mechanism), false);

hasAll(policy, [
  "AVANTIQO_MECHANISM_FIRST_RESEARCH_POLICY_V1",
  "mechanism_before_imitation: true",
  "failed_approach_does_not_prove_objective_impossible: true",
  "hypotheses_must_be_falsifiable",
  "experiments_should_discriminate_between_hypotheses",
  "adjacent_domain_transfer_encouraged",
], "shared mechanism research policy");

hasAll(route, [
  "reconcileAvantiqoMechanismFirstLearning",
  "mechanismFirstLearning = await reconcileAvantiqoMechanismFirstLearning()",
  "mechanism_first_learning: mechanismFirstLearning",
  "runAvantiqoContinuousLearningBatch",
], "hourly Learning route");
const directorIndex = route.indexOf("mechanismFirstLearning = await reconcileAvantiqoMechanismFirstLearning()");
const researchIndex = route.indexOf("result = await runAvantiqoContinuousLearningBatch");
assert.ok(directorIndex >= 0 && researchIndex > directorIndex);
assert.equal(/api\.runpod\.ai|rest\.runpod\.io|AVANTIQO_RUNPOD_SAFE_LEASE/.test(route), false);
assert.equal(route.includes("AvantiqoStructuredIntelligenceSupervisorRuntime"), false);

hasAll(child, [
  "AVANTIQO_LEARNING_MECHANISM_SYNTHESIS_MODAL_V2",
  'RUNTIME_CONTRACT = "AVANTIQO_INTELLIGENCE_MODAL_H100_V1"',
  'PROVIDER = "avantiqo-intelligence"',
  'SERVICE_ID = "ai.reasoning.execute"',
  'REQUIRED_LANE = "deep"',
  'DIRECT_JOB_PREFIX = "modal-intelligence-direct:"',
  "AVANTIQO_LEARNING_MECHANISM_SYNTHESIS_SPEND_APPROVED",
  '"READY_FOR_MODAL_SYNTHESIS"',
  '"MODAL_SYNTHESIS_SUBMITTING"',
  '"MODAL_SYNTHESIS_SETTLING"',
  '"MODAL_SYNTHESIS_REVIEW_REQUIRED"',
  '"SYNTHESIS_READY_FOR_EXPERIMENT_GOVERNANCE"',
  "executeService",
  "settlePendingService",
  "ownedProviderPolicy",
  "provider_job_reused_for_settlement: true",
  "duplicate_provider_job_submitted: false",
  "automatic_retry_allowed: false",
  "experiment_execution_performed: false",
  "experiments_are_proposals_only: true",
  "model_training_performed: false",
  "model_weight_mutation_performed: false",
  "production_promotion_performed: false",
  "raw_provider_response_persisted: false",
  "raw_reasoning_persisted: false",
], "Modal Learning synthesis child");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io|AVANTIQO_RUNPOD_SAFE_LEASE/.test(child), false);
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(child), false);

const preparedStatusIndex = child.indexOf('status: "MODAL_SYNTHESIS_SUBMITTING"');
const preparedWriteIndex = child.indexOf("const prepared = await db", preparedStatusIndex);
const preparedVerificationIndex = child.indexOf("if (!prepared.data?.id)", preparedWriteIndex);
const serviceExecutionIndex = child.indexOf("execution = await executeService", preparedVerificationIndex);
assert.ok(preparedStatusIndex >= 0 && preparedWriteIndex > preparedStatusIndex && preparedVerificationIndex > preparedWriteIndex && serviceExecutionIndex > preparedVerificationIndex);

const providerBindingIndex = child.indexOf("synthesis_provider_job_id: providerJobId", serviceExecutionIndex);
const settlementIndex = child.indexOf("const settled = await settleSameJob", serviceExecutionIndex);
assert.ok(providerBindingIndex > serviceExecutionIndex && settlementIndex > providerBindingIndex);
assert.match(child, /executeService\s*\(/);
assert.match(child, /settlePendingService\s*\(/);
assert.match(child, /provider_job_id:\s*providerJobId/);

hasAll(index, ['export * from "./runtime/AvantiqoMechanismFirstLearningRuntime";'], "intelligence exports");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    hourly_director_provider_free: true,
    deep_synthesis_modal_only: true,
    synthesis_attempt_persisted_before_service_execution: true,
    exact_provider_job_persisted_before_settlement: true,
    ambiguous_provider_failure_blocks_automatic_retry: true,
    experiments_require_separate_governance: true,
  },
  governance: {
    service_runtime_required: true,
    direct_non_modal_provider_execution: false,
    direct_gpu_scaling: false,
    hourly_gpu_job_submission: false,
    duplicate_provider_job_submission_allowed: false,
    automatic_experiment_execution: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    raw_reasoning_persisted: false,
  },
}, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE4_AUDIT=PASS");
`;

fs.writeFileSync("scripts/avantiqo-learning-worldclass-phase4-audit.mjs", audit);

if (fs.existsSync("scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs")) {
  fs.rmSync("scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs");
}

fs.writeFileSync("tests/avantiqo-intelligence-modal-only-convergence.test.mjs", String.raw`import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const operator = fs.readFileSync(new URL("../lib/operator/runtime/OperatorReasoningRuntime.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/operator/turn/route.js", import.meta.url), "utf8");
const learning = fs.readFileSync(new URL("../lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js", import.meta.url), "utf8");
const child = fs.readFileSync(new URL("../scripts/run-avantiqo-learning-mechanism-synthesis-modal-child-local.mjs", import.meta.url), "utf8");

test("Operator Deep is owned in production while benchmark metadata is development-only", () => {
  assert.match(operator, /if \(text\(process\.env\.NODE_ENV\)\.toLowerCase\(\) !== "development"\) return null/);
  assert.match(operator, /service_id: "ai\.reasoning\.execute"[\s\S]*?\.\.\.ownedOperatorIntelligenceSelectionPolicy\(\)/);
});

test("Operator route has Node 300 second runtime budget", () => {
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export const maxDuration = 300/);
});

test("Learning director is Modal-only", () => {
  assert.match(learning, /READY_FOR_MODAL_SYNTHESIS/);
  assert.match(learning, /AVANTIQO_INTELLIGENCE_MODAL_H100_V1/);
  assert.match(learning, /synthesis_modal_only/);
  assert.doesNotMatch(learning, /RUNPOD_SAFE_LEASE|READY_FOR_SAFE_LEASE_SYNTHESIS/);
});

test("Learning synthesis cannot bypass Service Runtime", () => {
  assert.match(child, /executeService\s*\(/);
  assert.match(child, /settlePendingService\s*\(/);
  assert.match(child, /modal-intelligence-direct:/);
  assert.match(child, /duplicate_provider_job_submitted: false/);
  assert.match(child, /raw_reasoning_persisted: false/);
  assert.doesNotMatch(child, /api\.runpod\.ai|rest\.runpod\.io|AVANTIQO_RUNPOD_SAFE_LEASE/);
});

test("legacy direct RunPod Learning child is absent", () => {
  assert.equal(fs.existsSync(new URL("../scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs", import.meta.url)), false);
});
`);

console.log(`${CONTRACT}=PASS`);
