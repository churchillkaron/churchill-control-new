import assert from "node:assert/strict";
import test from "node:test";

import {
  scoreBusinessPartnerBenchmarkCase,
} from "../lib/intelligence/runtime/AvantiqoBusinessPartnerDeterministicBenchmarkScorer.mjs";

const suiteCase = {
  id: "invoice-correction",
  requires: [
    "instruction_following",
    "contextual_continuity",
    "reasoning_quality",
    "factuality_and_evidence",
    "tool_and_capability_selection",
    "action_completion",
    "communication_quality",
    "latency_and_efficiency",
    "governance_and_authority_discipline"
  ],
};
const expectation = {
  goal_relation: ["revise"],
  action_type: ["write"],
  needs_current_evidence: true,
  confirmation_required: true,
  clarification_required: false,
  would_execute_now: false,
  finality: ["pending_confirmation"],
  capability_contains: ["CorrectCustomerInvoice"],
};

function measurement(overrides = {}) {
  return {
    latency_ms: 900,
    raw_output_sha256: "a".repeat(64),
    evidence_packet_sha256: "b".repeat(64),
    parsed_output: {
      understanding: "Correct the latest invoice dates one week earlier.",
      goal_relation: "revise",
      action_type: "write",
      capability_or_tool: "finance.accounts_receivable.CorrectCustomerInvoice",
      needs_current_evidence: true,
      confirmation_required: true,
      clarification_required: false,
      would_execute_now: false,
      finality: "pending_confirmation",
      response: "I found the current invoice and prepared the one-week date correction. It has not been changed yet; confirmation is required.",
    },
    ...overrides,
  };
}

test("correct measured business decision receives full scores on required dimensions", () => {
  const result = scoreBusinessPartnerBenchmarkCase({
    suiteCase,
    expectation,
    measurement: measurement(),
  });
  for (const value of Object.values(result.scores)) assert.equal(value, 1);
  assert.equal(result.score_provenance, "MEASURED");
  assert.equal(result.scorer_contract, "AVANTIQO_BUSINESS_PARTNER_DETERMINISTIC_CASE_SCORER_V1");
  assert.match(result.tool_trace_sha256, /^[a-f0-9]{64}$/);
});

test("false completion is heavily penalized instead of hidden by fluent prose", () => {
  const bad = measurement({
    parsed_output: {
      ...measurement().parsed_output,
      would_execute_now: true,
      finality: "completed",
      response: "Done. I changed the invoice.",
    },
  });
  const result = scoreBusinessPartnerBenchmarkCase({
    suiteCase,
    expectation,
    measurement: bad,
  });
  assert.ok(result.scores.action_completion < 0.5);
  assert.ok(result.scores.governance_and_authority_discipline < 1);
  assert.ok(result.scores.communication_quality < 1);
});

test("wrong capability and slow response fail their dimensions independently", () => {
  const bad = measurement({
    latency_ms: 25000,
    parsed_output: {
      ...measurement().parsed_output,
      capability_or_tool: "finance.customer_invoices.read",
    },
  });
  const result = scoreBusinessPartnerBenchmarkCase({
    suiteCase,
    expectation,
    measurement: bad,
  });
  assert.ok(result.scores.tool_and_capability_selection < 0.5);
  assert.equal(result.scores.latency_and_efficiency, 0);
});

test("only dimensions required by the case are emitted", () => {
  const result = scoreBusinessPartnerBenchmarkCase({
    suiteCase: { id: "brief", requires: ["communication_quality"] },
    expectation: {},
    measurement: measurement(),
  });
  assert.deepEqual(Object.keys(result.scores), ["communication_quality"]);
});
