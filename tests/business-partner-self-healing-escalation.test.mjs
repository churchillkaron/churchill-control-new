import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const synthetic = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js", "utf8");
const registry = fs.readFileSync("lib/platform/self-healing/PlatformSelfHealingRegistryAuthorityRuntime.mjs", "utf8");
const domain = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");

test("Business Partner automatically escalates only deterministic product defect candidates", () => {
  assert.match(synthetic, /recovery_classification !== "PRODUCT_DEFECT_CANDIDATE"/);
  assert.match(synthetic, /code_engineering_candidate !== true/);
  assert.match(synthetic, /business_partner_self_healing/);
  assert.match(synthetic, /authorizationEffect: "SAME_ACTION_ONLY"/);
});

test("self-healing escalation is a registered governed Platform capability", () => {
  assert.match(domain, /business_partner_self_healing: \{ execute:/);
  assert.match(capability, /platform\.code\.ai\.execute/);
  assert.match(capability, /requireExecutionPermission/);
  assert.match(capability, /operatorEnabled: false/);
});

test("server-owned ERP registry proof is required before Code engineering", () => {
  assert.match(capability, /provePlatformRepairRegistryAuthority/);
  assert.match(capability, /REPAIR_AUTHORITY_REQUIRED/);
  assert.match(registry, /getWorkspaceItemByRoute/);
  assert.match(registry, /getCapabilitySearchIndex/);
  assert.match(registry, /ERP_REGISTRY_CAPABILITY_AMBIGUOUS/);
  assert.match(registry, /authority_purpose: "repair"/);
  assert.match(capability, /action: capability\.action/);
  assert.match(registry, /ERP_REGISTRY_ACTION_MISMATCH/);
  assert.match(registry, /registered_action_match/);
});

test("canonical self-healing research and Code runtimes are reused and release stays separately permissioned", () => {
  assert.match(capability, /preparePlatformSelfHealingCodeMission/);
  assert.match(capability, /executePlatformSelfHealingCodeMission/);
  assert.match(capability, /decideAvantiqoProductPersistence/);
  assert.match(capability, /automaticReleaseAllowed/);
  assert.match(capability, /capability: "product_production_release"/);
  assert.match(capability, /commit_performed: productionRelease\?\.commit_completed === true/);
  assert.match(capability, /production_deploy_performed: productionRelease\?\.production_deployed === true/);
  assert.match(capability, /migration_performed: false/);
  assert.match(capability, /replay_required: true/);
});

test("exact failed action remains bound through engineering for later continuation", () => {
  assert.match(synthetic, /business_partner_recovery/);
  assert.match(synthetic, /failed_action: failedAction/);
  assert.match(synthetic, /originalGoalPreserved: true/);
  assert.match(synthetic, /resume_authorized: selfHealing\.production_deploy_performed === true && selfHealing\.activation_verified === true/);
  assert.match(capability, /original_action: failed/);
  assert.match(capability, /authorization_effect: "SAME_ACTION_ONLY"/);
});
