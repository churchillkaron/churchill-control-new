import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const selfHealing = fs.readFileSync("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js", "utf8");
const selfHealingExecution = fs.readFileSync("lib/platform/self-healing/PlatformSelfHealingCodeExecutionRuntime.js", "utf8");
const synthetic = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const commitArtifact = fs.readFileSync("lib/code/runtime/CodeAICommitArtifactRuntime.js", "utf8");
const commitCapability = fs.readFileSync("lib/platform/capabilities/createCodeAICommitCapability.js", "utf8");

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
  assert.match(core, /const verifiedSelfHealing =\s*[\s\S]*recovery\.production_deploy_performed === true &&\s*recovery\.activation_verified === true &&\s*recovery\.replay_required === true/);
  assert.match(core, /text\(recovery\.authorization_effect\) !== "SAME_ACTION_ONLY"/);
  assert.match(core, /verifyPlatformSelfHealingReplay/);
  assert.match(core, /selfHealingReplayVerification\.fixed !== true/);
});

test("post-release continuation reuses only the exact failed capability and payload through current governance", () => {
  assert.match(core, /const recoveryCapabilityKey = text\(recoveryCapability\.key\)/);
  assert.match(core, /const recoveryPayload = object\(recovery\.payload\)/);
  assert.match(core, /validateBusinessPartnerRecoveryReplayBinding\([\s\S]*recovery\.replay_binding[\s\S]*capabilityKey: recoveryCapabilityKey[\s\S]*payload: recoveryPayload/);
  assert.match(core, /capability_key: recoveryCapabilityKey,[\s\S]*payload: recoveryPayload/);
  assert.match(core, /resume_kind: "business_partner_recovery"/);
  assert.match(core, /validateBusinessPartnerRecoveryReplayBinding/);
  assert.match(core, /executionBlockedReason\(capability, \{ source, confirmed: false \}\)|confirmed: explicitlyAuthorized/);
  assert.match(core, /function clearBusinessPartnerRecovery/);
  assert.match(core, /clearBusinessPartnerRecovery\(agreementState\)/);
});

test("verified commit artifacts are physically removed only after durable commit proof", () => {
  assert.match(commitArtifact, /export async function retireCodeAICommitArtifact/);
  assert.match(commitArtifact, /\.from\(MEMORY_TABLE\)\s*\.delete\(\)/s);
  assert.match(commitArtifact, /\.eq\("organization_id", organizationId\)/);
  assert.match(commitArtifact, /\.eq\("memory_scope", MEMORY_SCOPE\)/);
  assert.match(commitArtifact, /\.eq\("memory_key", rowKey\)/);
  assert.match(commitArtifact, /\.eq\("active", true\)/);
  assert.doesNotMatch(commitArtifact, /update\(\{ active: false/);
  assert.match(commitCapability, /const artifact = commitState\.persisted\s*\? await retireVerifiedCommitArtifact/s);
  assert.match(commitCapability, /VERIFIED_COMMIT_ARTIFACT_RETAINED_FOR_RECOVERY/);
});
