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
  assert.match(cert, /resolved_catalog_no_unverified_ordinary_writes/);
  assert.match(cert, /INVALID_DECLARATION_BLOCKED/);
  assert.match(cert, /resolved_unverified_are_explicit_orchestration_only/);
  assert.doesNotMatch(cert, /const generated=/);
});
