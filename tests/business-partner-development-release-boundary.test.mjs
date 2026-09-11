import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const selfHealing = fs.readFileSync("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js", "utf8");

test("development Business Partner repair can never authorize automatic production release", () => {
  assert.match(core, /automaticProductReleaseAllowed\(permissions = \[\], environment = process\.env\.NODE_ENV\)/);
  assert.match(core, /text\(environment\)\.toLowerCase\(\) !== "production"\) return false/);
  assert.match(selfHealing, /automaticReleaseAllowed\(context = \{\}, environment = process\.env\.NODE_ENV\)/);
  assert.match(selfHealing, /text\(environment\)\.toLowerCase\(\) !== "production"\) return false/);
});

test("production automatic release still requires both dedicated permissions", () => {
  for (const source of [core, selfHealing]) {
    assert.match(source, /platform\.code\.ai\.commit/);
    assert.match(source, /platform\.deploy\.production/);
  }
});
