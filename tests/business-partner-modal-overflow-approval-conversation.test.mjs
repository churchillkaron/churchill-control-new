import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const reasoning = fs.readFileSync("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8");
const turn = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");

test("Business Partner never offers external Intelligence approval", () => {
  assert.doesNotMatch(reasoning, /Approve this one job|modal_overflow_proposal_allowed|modalOverflowProposalDecision/);
  assert.doesNotMatch(turn, /approveIntelligenceModalOverflowProposal|rejectIntelligenceModalOverflowProposal|pendingIntelligenceModalOverflowProposal/);
});

test("local capacity failures remain local and ask to narrow or split", () => {
  assert.match(reasoning, /I kept the work local and did not start external compute/);
  assert.match(reasoning, /Narrow the scope/);
  assert.match(reasoning, /Split into local jobs/);
  assert.match(reasoning, /external_compute_started: false/);
});

test("active provider cannot execute an external Intelligence job", () => {
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(provider, /Modal|modal|RunPod|runpod/);
});
