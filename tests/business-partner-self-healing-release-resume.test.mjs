import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const selfHealing = fs.readFileSync("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js", "utf8");
const selfHealingExecution = fs.readFileSync("lib/platform/self-healing/PlatformSelfHealingCodeExecutionRuntime.js", "utf8");
const synthetic = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

test("verified self-healing artifacts enter the canonical persistence evidence store", () => {
  assert.match(selfHealingExecution, /persistCodeAIAutonomousExecutionState/);
  assert.match(selfHealingExecution, /persistCodeAICommitArtifact/);
  assert.match(selfHealingExecution, /execution_key: verificationEvidence\?\.execution_key \|\| null/);
  assert.match(selfHealingExecution, /authorization_effect: "NONE"/);
});

test("automatic production release requires both existing privileged permissions and Product Intelligence persistence approval", () => {
  assert.match(selfHealing, /platform\.code\.ai\.commit/);
  assert.match(selfHealing, /platform\.deploy\.production/);
  assert.match(selfHealing, /decideAvantiqoProductPersistence/);
  assert.match(selfHealing, /persistenceDecision\?\.decision === "REQUEST_COMMIT_CONFIRMATION" && automaticReleaseAllowed\(context\)/);
  assert.match(selfHealing, /capability: "product_production_release"/);
  assert.match(selfHealing, /databaseMigrationExecutionAllowed: false/);
});

test("Business Partner never authorizes replay before exact production activation is verified", () => {
  assert.match(synthetic, /resume_authorized: selfHealing\.production_deploy_performed === true && selfHealing\.activation_verified === true/);
  assert.match(core, /recovery\.production_deploy_performed !== true/);
  assert.match(core, /recovery\.activation_verified !== true/);
  assert.match(core, /recovery\.authorization_effect\) !== "SAME_ACTION_ONLY"/);
});

test("post-release continuation reuses only the exact failed capability and payload through current governance", () => {
  assert.match(core, /capability_key: capabilityKey,[\s\S]*payload: object\(recovery\.payload\)/);
  assert.match(core, /resume_kind: "business_partner_recovery"/);
  assert.match(core, /executionBlockedReason\(capability, \{ source, confirmed: false \}\)/);
  assert.match(core, /function clearBusinessPartnerRecovery/);
  assert.match(core, /clearBusinessPartnerRecovery\(agreementState\)/);
});
