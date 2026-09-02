#!/usr/bin/env node

import fs from "node:fs";

const CONTRACT = "AVANTIQO_INTELLIGENCE_MODAL_ONLY_CONVERGENCE_REPAIR_V1";

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${CONTRACT}_${label}_EXPECTED_ONCE_FOUND_${count}`);
  return source.replace(before, after);
}

function replaceAll(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count < 1) throw new Error(`${CONTRACT}_${label}_EXPECTED_AT_LEAST_ONCE`);
  return source.split(before).join(after);
}

function patchFile(path, patcher) {
  const before = fs.readFileSync(path, "utf8");
  const after = patcher(before);
  if (after === before) throw new Error(`${CONTRACT}_${path}_UNCHANGED`);
  fs.writeFileSync(path, after);
}

patchFile("lib/operator/runtime/OperatorReasoningRuntime.js", (source) => {
  let next = replaceExact(
    source,
    "function localDevelopmentOwnedReasoningPolicy() {\n  return ownedOperatorIntelligenceSelectionPolicy();\n}",
    "function localDevelopmentOwnedReasoningPolicy() {\n  if (text(process.env.NODE_ENV).toLowerCase() !== \"development\") return null;\n  return ownedOperatorIntelligenceSelectionPolicy();\n}",
    "OPERATOR_LOCAL_POLICY_GUARD",
  );
  next = replaceExact(
    next,
    "    ...(localOwnedReasoning || {}),\n    input: {",
    "    ...ownedOperatorIntelligenceSelectionPolicy(),\n    input: {",
    "OPERATOR_DEEP_OWNED_SELECTION",
  );
  return next;
});

patchFile("app/api/operator/turn/route.js", (source) => {
  if (/export const maxDuration\s*=/.test(source)) {
    throw new Error(`${CONTRACT}_OPERATOR_ROUTE_MAX_DURATION_ALREADY_PRESENT`);
  }
  return `export const runtime = \"nodejs\";\nexport const maxDuration = 300;\n\n${source}`;
});

patchFile("lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js", (source) => {
  let next = replaceAll(
    source,
    "READY_FOR_SAFE_LEASE_SYNTHESIS",
    "READY_FOR_MODAL_SYNTHESIS",
    "LEARNING_READY_STATE",
  );
  next = replaceAll(
    next,
    "SAFE_LEASE_SYNTHESIS_READY",
    "MODAL_SYNTHESIS_READY",
    "LEARNING_SUMMARY_STATE",
  );
  next = replaceExact(
    next,
    '      synthesis_execution_lane: "intelligence-deep",\n      synthesis_safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",\n      synthesis_safe_lease_required: mode !== "evidence",',
    '      synthesis_execution_lane: "deep",\n      synthesis_runtime_contract: "AVANTIQO_INTELLIGENCE_MODAL_H100_V1",\n      synthesis_modal_only: mode !== "evidence",',
    "LEARNING_SYNTHESIS_RUNTIME_METADATA",
  );
  next = replaceAll(
    next,
    "automatic_runpod_submission: false",
    "automatic_non_modal_submission: false",
    "LEARNING_NON_MODAL_GUARD",
  );
  return next;
});

patchFile("scripts/avantiqo-learning-worldclass-phase4-audit.mjs", (source) => {
  let next = replaceAll(
    source,
    'child: "scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs",\n  leasePolicy: "config/avantiqo-runpod-safe-lease-policy.json",',
    'child: "scripts/run-avantiqo-learning-mechanism-synthesis-modal-child-local.mjs",',
    "AUDIT_CHILD_PATH",
  );
  next = replaceExact(
    next,
    "const [mechanism, policy, route, child, leasePolicy, index] =\n  await Promise.all(Object.values(files).map(source));",
    "const [mechanism, policy, route, child, index] =\n  await Promise.all(Object.values(files).map(source));",
    "AUDIT_LOAD_SHAPE",
  );
  next = replaceAll(next, "READY_FOR_SAFE_LEASE_SYNTHESIS", "READY_FOR_MODAL_SYNTHESIS", "AUDIT_READY_STATE");
  next = replaceAll(next, 'synthesis_execution_lane: "intelligence-deep"', 'synthesis_execution_lane: "deep"', "AUDIT_LANE");
  next = replaceAll(next, 'synthesis_safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2"', 'synthesis_runtime_contract: "AVANTIQO_INTELLIGENCE_MODAL_H100_V1"', "AUDIT_RUNTIME_CONTRACT");
  next = replaceAll(next, "automatic_runpod_submission: false", "automatic_non_modal_submission: false", "AUDIT_NON_MODAL_GUARD");
  next = replaceAll(next, "AVANTIQO_RUNPOD_SAFE_LEASE_V2", "AVANTIQO_INTELLIGENCE_MODAL_H100_V1", "AUDIT_CONTRACT_NAME");
  next = replaceAll(next, "Safe-Lease Learning synthesis child", "Modal Learning synthesis child", "AUDIT_LABEL");
  next = replaceAll(next, "deep_synthesis_safe_lease_only: true", "deep_synthesis_modal_only: true", "AUDIT_ARCHITECTURE_LABEL");
  next = replaceAll(next, "synthesis_without_safe_lease_allowed: false", "synthesis_without_modal_service_runtime_allowed: false", "AUDIT_GOVERNANCE_LABEL");
  next = replaceAll(next, "SAFE_LEASE_SYNTHESIS_EXECUTING", "MODAL_SYNTHESIS_SUBMITTING", "AUDIT_EXECUTING_STATE");
  next = replaceAll(next, "SAFE_LEASE_SYNTHESIS_REVIEW_REQUIRED", "MODAL_SYNTHESIS_REVIEW_REQUIRED", "AUDIT_REVIEW_STATE");
  next = replaceAll(next, "AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE", "MODAL_TOKEN_ID", "AUDIT_TOKEN_ID");
  next = replaceAll(next, "AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT", "MODAL_TOKEN_SECRET", "AUDIT_TOKEN_SECRET");
  next = replaceAll(next, "AVANTIQO_RUNPOD_SAFE_LEASE_LANE", "MODAL_H100_ASYNC_V1", "AUDIT_MODAL_INFRA");
  next = next.replace(/\nconst parsedLeasePolicy = JSON\.parse\(leasePolicy\);[\s\S]*?assert\.equal\(parsedLeasePolicy\.lanes\?\.\["intelligence-deep"\], "avantiqo-intelligence-v1"\);\n/, "\n");
  next = replaceAll(next, "callOwnedDeepIntelligence", "executeService", "AUDIT_PROVIDER_CALL");
  next = replaceAll(next, 'status: "SAFE_LEASE_SYNTHESIS_EXECUTING"', 'status: "MODAL_SYNTHESIS_SUBMITTING"', "AUDIT_PREPARED_STATUS");
  next = replaceAll(next, "inference = await executeService", "execution = await executeService", "AUDIT_EXECUTION_CALL");
  next = next.replace(/assert\.match\([\s\S]*?"owned deep synthesis transport must contain the bounded provider POST",\n\);\n/, 'assert.equal(/api\\.runpod\\.ai|rest\\.runpod\\.io/.test(child), false,\n  "Learning synthesis child must not call RunPod");\nassert.match(child, /executeService\\s*\\(/,\n  "Learning synthesis child must execute through Service Runtime");\nassert.match(child, /settlePendingService\\s*\\(/,\n  "Learning synthesis child must settle the same provider job through Service Runtime");\n');
  next = replaceAll(next, "synthesis_attempt_persisted_before_provider_post: true", "synthesis_attempt_persisted_before_service_execution: true", "AUDIT_PERSISTENCE_LABEL");
  next = replaceAll(next, "direct_runpod_endpoint_scaling: false", "direct_non_modal_endpoint_scaling: false", "AUDIT_DIRECT_SCALING_LABEL");
  next = replaceAll(next, "hourly_runpod_job_submission: false", "hourly_gpu_job_submission: false", "AUDIT_HOURLY_LABEL");
  return next;
});

if (fs.existsSync("scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs")) {
  fs.rmSync("scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs");
}

const guardPath = "tests/avantiqo-intelligence-modal-only-convergence.test.mjs";
fs.writeFileSync(guardPath, `import assert from "node:assert/strict";\nimport test from "node:test";\nimport fs from "node:fs";\n\nconst operator = fs.readFileSync(new URL("../lib/operator/runtime/OperatorReasoningRuntime.js", import.meta.url), "utf8");\nconst route = fs.readFileSync(new URL("../app/api/operator/turn/route.js", import.meta.url), "utf8");\nconst learning = fs.readFileSync(new URL("../lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js", import.meta.url), "utf8");\nconst child = fs.readFileSync(new URL("../scripts/run-avantiqo-learning-mechanism-synthesis-modal-child-local.mjs", import.meta.url), "utf8");\n\ntest("Operator deep reasoning is owned in production while review metadata stays development-only", () => {\n  assert.match(operator, /if \\(text\\(process\\.env\\.NODE_ENV\\)\\.toLowerCase\\(\\) !== \\\"development\\\"\\) return null/);\n  assert.match(operator, /service_id: \\\"ai\\.reasoning\\.execute\\\"[\\s\\S]*?\\.\\.\\.ownedOperatorIntelligenceSelectionPolicy\\(\\)/);\n});\n\ntest("Operator turn route has a Node runtime budget for cold-started owned Intelligence", () => {\n  assert.match(route, /export const runtime = \\\"nodejs\\\"/);\n  assert.match(route, /export const maxDuration = 300/);\n});\n\ntest("Learning synthesis advertises Modal-only governed execution", () => {\n  assert.match(learning, /READY_FOR_MODAL_SYNTHESIS/);\n  assert.match(learning, /AVANTIQO_INTELLIGENCE_MODAL_H100_V1/);\n  assert.match(learning, /synthesis_modal_only/);\n  assert.doesNotMatch(learning, /RUNPOD_SAFE_LEASE|READY_FOR_SAFE_LEASE_SYNTHESIS/);\n});\n\ntest("Learning synthesis child cannot bypass Service Runtime", () => {\n  assert.match(child, /executeService\\s*\\(/);\n  assert.match(child, /settlePendingService\\s*\\(/);\n  assert.match(child, /modal-intelligence-direct:/);\n  assert.match(child, /duplicate_provider_job_submitted: false/);\n  assert.match(child, /raw_reasoning_persisted: false/);\n  assert.doesNotMatch(child, /api\\.runpod\\.ai|rest\\.runpod\\.io|AVANTIQO_RUNPOD_SAFE_LEASE/);\n});\n\ntest("legacy direct RunPod Learning child is removed", () => {\n  assert.equal(fs.existsSync(new URL("../scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs", import.meta.url)), false);\n});\n`);

console.log(`${CONTRACT}=PASS`);
