import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

test("organizational-context renderer states current organization, legal entity and verified scope without mutation", () => {
  assert.match(source, /export function organizationalContextResponseText/);
  assert.match(source, /Current organization:/);
  assert.match(source, /Current legal entity:/);
  assert.match(source, /Registered industries:/);
  assert.match(source, /Verified from current registered organization and legal-entity data\. No business data was changed\./);
});

test("organizational-context execution bypasses AI verification synthesis", () => {
  const branch = source.indexOf("if (capability.key === ORGANIZATIONAL_CONTEXT_KEY)");
  const verification = source.indexOf("let verifiedDecision = decision");
  assert.ok(branch >= 0);
  assert.ok(verification > branch);
  const segment = source.slice(branch, verification);
  assert.match(segment, /organizational-context-result-renderer-v1/);
  assert.doesNotMatch(segment, /verifyOperatorExecution\s*\(/);
});
