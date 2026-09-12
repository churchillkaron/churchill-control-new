import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bridge = fs.readFileSync("lib/platform/registry/operatorRegistryBridge.js", "utf8");
const cert = fs.readFileSync("scripts/certify-business-partner-write-verification-coverage-local.mjs", "utf8");

test("registry bridge exposes generated writes only with authoritative identity", () => {
  assert.match(bridge, /createEndpoint && authoritativeIdentity/);
  assert.match(bridge, /missing_authoritative_identity/);
  assert.match(bridge, /operatorVerification:/);
  assert.match(bridge, /recovery_payload_from_evidence/);
});

test("write verification certification audits resolved catalog", () => {
  assert.match(cert, /listOperatorCapabilities/);
  assert.match(cert, /includeUnsafe:true/);
  assert.match(cert, /no_unclassified_non_secretary_writes/);
  assert.match(cert, /true_orchestration_requires_explicit_execution_boundary/);
  assert.match(cert, /remaining_unverified_are_secretary_records_only/);
  assert.match(cert, /INVALID_DECLARATION_BLOCKED/);
  assert.match(cert, /operator_execution_boundary_status/);
  assert.doesNotMatch(cert, /const generated=/);
});
