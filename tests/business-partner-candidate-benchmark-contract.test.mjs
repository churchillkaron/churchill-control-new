import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runner = fs.readFileSync(
  "scripts/run-business-partner-candidate-benchmark.mjs",
  "utf8",
);
const contexts = JSON.parse(
  fs.readFileSync("benchmarks/business-partner/case-contexts.v1.json", "utf8"),
);

test("candidate benchmark exercises the actual Business Partner semantic runtime", () => {
  assert.match(runner, /understandHumanBusinessPartnerTurn/);
  assert.match(runner, /OperatorHumanBusinessPartnerUnderstandingRuntime\.js/);
  assert.match(runner, /actual_semantic_runtime_non_mutating_governance_projection/);
});

test("candidate benchmark cannot mutate business state or deploy production", () => {
  assert.match(runner, /business_mutations_performed:\s*false/);
  assert.match(runner, /production_deploy_performed:\s*false/);
  assert.doesNotMatch(runner, /executeUbteCapability/);
  assert.doesNotMatch(runner, /fetch\([^\n]*\/api\/operator\/turn/);
});

test("candidate benchmark does not load hidden expected outcomes", () => {
  assert.equal(runner.includes("expectations.v1.json"), false);
  assert.equal(runner.includes("capability_contains"), false);
});

test("context-dependent benchmark cases carry explicit durable state", () => {
  for (const id of [
    "continuity-02",
    "recovery-01",
    "recovery-02",
    "recovery-03",
    "latency-03",
    "natural-language-02",
    "failure-mode-01",
    "failure-mode-02",
    "failure-mode-03",
  ]) {
    assert.ok(contexts.cases[id], id);
    assert.ok(contexts.cases[id].project_state, id);
  }
});

test("candidate output is bound to matched protocol and evidence hashes", () => {
  assert.match(runner, /suite_contract:\s*suite\.contract/);
  assert.match(runner, /protocol_contract:\s*protocol\.contract/);
  assert.match(runner, /evidence_packet_sha256:\s*evidencePacketHash/);
  assert.match(runner, /raw_output_sha256:\s*sha256\(rawOutput\)/);
});
