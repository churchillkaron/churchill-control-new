import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const files = [
  "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
  "lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js",
  "lib/platform/self-healing/PlatformSelfHealingRegistryAuthorityRuntime.mjs",
  "lib/platform/self-healing/PlatformSelfHealingCodeResearchRuntime.js",
  "lib/platform/self-healing/PlatformSelfHealingCodeExecutionRuntime.js",
];
const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const capability = fs.readFileSync(
  "lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js",
  "utf8",
);
const synthetic = fs.readFileSync(
  "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
  "utf8",
);

test("Business Partner self-healing is global platform behavior, never certification-org specific", () => {
  assert.doesNotMatch(source, /9a148429-b6a0-4bc6-ac83-a35c64fb7045/i);
  assert.doesNotMatch(source, /supply_chain\.stock_movements\.create/i);
  assert.match(capability, /contextScope:\s*"organization"/);
  assert.match(capability, /organizationId:\s*context\.organizationId/);
});

test("repair identity comes from the failed runtime action and server-owned registry proof", () => {
  assert.match(capability, /const failed = object\(payload\.failed_action\)/);
  assert.match(capability, /const capability = object\(failed\.capability\)/);
  assert.match(capability, /provePlatformRepairRegistryAuthority/);
  assert.match(capability, /capability:\s*capability\.capability/);
  assert.match(capability, /action:\s*capability\.action/);
  assert.match(capability, /workspace:\s*authority\.evidence\.workspace_id/);
});

test("repaired code remains global while business replay stays exact to the initiating action", () => {
  assert.match(synthetic, /failed_action:\s*failedAction/);
  assert.match(synthetic, /authorizationEffect:\s*"SAME_ACTION_ONLY"/);
  assert.match(capability, /original_action:\s*failed/);
  assert.match(capability, /replay_required:\s*true/);
  assert.match(capability, /authorization_effect:\s*"SAME_ACTION_ONLY"/);
  assert.match(capability, /migration_performed:\s*false/);
});
