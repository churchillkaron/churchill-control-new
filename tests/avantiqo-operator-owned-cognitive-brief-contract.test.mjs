import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url),
  "utf8",
);

test("complex Operator turns receive an owned Avantiqo cognitive brief", () => {
  assert.match(source, /AvantiqoStructuredIntelligenceSupervisorRuntime\.run/);
  assert.match(source, /AVANTIQO_OPERATOR_OWNED_COGNITIVE_BRIEF_V1/);
  assert.match(source, /mode:\s*"deep"/);
  assert.match(source, /allow_mutating_tools:\s*false/);
});

test("owned cognitive brief cannot bypass execution governance", () => {
  assert.match(source, /not authorization to execute a write/i);
  assert.match(source, /permissions, confirmation, approval, wallet and verification rules/i);
  assert.match(source, /execution_governance_bypassed:\s*false/);
});

test("voice path avoids a serial deep preflight to preserve latency", () => {
  assert.match(source, /if \(source === "voice"\) return false/);
});

test("owned cognitive brief fails open only to the existing governed Operator path", () => {
  assert.match(source, /OPERATOR_OWNED_COGNITIVE_BRIEF_UNAVAILABLE/);
  assert.match(source, /return null/);
  assert.match(source, /runOperatorTurn/);
});
