import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const operator = fs.readFileSync(new URL("../lib/operator/runtime/OperatorReasoningRuntime.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/operator/turn/route.js", import.meta.url), "utf8");
const ownedPolicy = fs.readFileSync(new URL("../lib/operator/runtime/OperatorOwnedIntelligenceServiceRuntime.js", import.meta.url), "utf8");
const learning = fs.readFileSync(new URL("../lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js", import.meta.url), "utf8");
const legacyChild = fs.readFileSync(new URL("../scripts/run-avantiqo-learning-mechanism-synthesis-modal-child-local.mjs", import.meta.url), "utf8");
const providerV2 = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", import.meta.url), "utf8");
const providerRegistration = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", import.meta.url), "utf8");

test("Operator Deep remains owned-provider pinned with no automatic external fallback", () => {
  assert.match(operator, /service_id: "ai\.reasoning\.execute"[\s\S]*?\.\.\.ownedOperatorIntelligenceSelectionPolicy\(\)/);
  assert.match(ownedPolicy, /external_fallback_allowed:\s*false/);
});

test("Operator route has Node runtime budget", () => {
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export const maxDuration = 300/);
});

test("mechanism and invention learning synthesis remain local-only", () => {
  assert.match(learning, /synthesis_runtime_contract: "AVANTIQO_INTELLIGENCE_LOCAL_NODE_V1"/);
  assert.match(learning, /synthesis_local_only: mode !== "evidence"/);
  assert.match(learning, /synthesis_external_compute_allowed: false/);
  assert.match(learning, /LOCAL_SYNTHESIS_READY/);
});

test("legacy synthesis child is terminal and cannot submit provider work", () => {
  assert.match(legacyChild, /AVANTIQO_LEARNING_SYNTHESIS_LOCAL_RUNTIME_REQUIRED/);
  assert.match(legacyChild, /external_compute_allowed: false/);
  assert.match(legacyChild, /provider_job_submitted: false/);
  assert.doesNotMatch(legacyChild, /executeService|settlePendingService|ModalClient|api\.runpod\.ai/);
});

test("canonical Intelligence is local-only", () => {
  assert.match(providerV2, /executeHierarchicalLocalIntelligence/);
  assert.match(providerV2, /executeIntelligenceLocalQueue/);
  assert.match(providerV2, /executeIntelligenceLocal\(input\)/);
  assert.match(providerV2, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.match(providerRegistration, /local_compute_primary:\s*true/);
  assert.match(providerRegistration, /local_only: true/);
  assert.match(providerRegistration, /external_provider_fallback_allowed:\s*false/);
  assert.doesNotMatch(providerV2, /Modal|modal|RunPod|runpod/);
});
