import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("owned Cinema quality repair keeps Avantiqo eligible and external challengers fallback-only", () => {
  const policy = source(
    "lib/creative/quality/runtime/CreativeOwnedCinemaRepairProviderPolicyBootstrap.js",
  );
  const instrumentation = source("instrumentation.js");
  const localBootstrap = source("scripts/creative-runtime-bootstrap.mjs");

  assert.match(policy, /CREATIVE_OWNED_CINEMA_REPAIR_PROVIDER_POLICY_V1/);
  assert.match(policy, /function ownedProvider/);
  assert.match(policy, /startsWith\("avantiqo-"\)/);
  assert.match(policy, /provider_id:\s*null/);
  assert.match(policy, /blocked_providers:\s*blocked/);
  assert.match(policy, /owned_retry_preferred:\s*true/);
  assert.match(policy, /owned_retry_provider_id:\s*provider/);
  assert.match(policy, /external_challenger_is_fallback_only:\s*true/);
  assert.match(policy, /provider_selection_owned_by_service_domain:\s*true/);
  assert.match(instrumentation, /CreativeOwnedCinemaRepairProviderPolicyBootstrap/);
  assert.match(localBootstrap, /CreativeOwnedCinemaRepairProviderPolicyBootstrap/);
});
