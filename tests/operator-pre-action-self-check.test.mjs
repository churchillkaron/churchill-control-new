import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyOperatorPreActionSelfCheck,
  evaluateOperatorPreAction,
} from "../lib/operator/runtime/OperatorPreActionSelfCheckPolicy.js";

const writeCapability = {
  key: "finance.invoice.create",
  mode: "write",
  context_scope: "entity",
};

function executeDecision(payload = { amount: 100 }) {
  return {
    intent: "execute",
    confidence: 0.9,
    clarification: { required: false, question: null, options: [] },
    navigation: { target_id: null },
    execution: {
      capability_key: writeCapability.key,
      payload,
      reason: "Create the invoice",
    },
    plan: [],
  };
}

test("allows a structurally valid proposed action", () => {
  const result = evaluateOperatorPreAction({
    decision: executeDecision(),
    capability: writeCapability,
    entityId: "entity-1",
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, "PRE_ACTION_SELF_CHECK_PASSED");
});

test("fails closed when execute and clarification conflict", () => {
  const decision = executeDecision();
  decision.clarification = {
    required: true,
    question: "Which customer?",
    options: [],
  };

  const result = evaluateOperatorPreAction({
    decision,
    capability: writeCapability,
    entityId: "entity-1",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "EXECUTE_AND_CLARIFY_CONTRADICTION");
});

test("enforces entity scope again before execution", () => {
  const result = evaluateOperatorPreAction({
    decision: executeDecision(),
    capability: writeCapability,
    entityId: null,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "ENTITY_CONTEXT_REQUIRED");
});

test("blocks exact duplicate side effect only with real prior payload evidence", () => {
  const result = evaluateOperatorPreAction({
    decision: executeDecision({ amount: 100, customer_id: "c1" }),
    capability: writeCapability,
    entityId: "entity-1",
    projectState: {
      last_execution: {
        status: "completed",
        capability: { key: writeCapability.key },
        requested_payload: {
          amount: 100,
          customer_id: "c1",
          organization_id: "ignored-scope",
        },
      },
    },
    message: "create the invoice",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "EXACT_COMPLETED_ACTION_ALREADY_EXECUTED");
});

test("does not infer duplicate when prior payload evidence is absent", () => {
  const result = evaluateOperatorPreAction({
    decision: executeDecision(),
    capability: writeCapability,
    entityId: "entity-1",
    projectState: {
      last_execution: {
        status: "completed",
        capability: { key: writeCapability.key },
      },
    },
  });

  assert.equal(result.allowed, true);
});

test("explicit retry request can intentionally repeat exact side effect", () => {
  const payload = { amount: 100, customer_id: "c1" };
  const result = evaluateOperatorPreAction({
    decision: executeDecision(payload),
    capability: writeCapability,
    entityId: "entity-1",
    projectState: {
      last_execution: {
        status: "completed",
        capability: { key: writeCapability.key },
        requested_payload: payload,
      },
    },
    message: "run it again",
  });

  assert.equal(result.allowed, true);
});

test("read capabilities are never duplicate-side-effect blocked", () => {
  const readCapability = {
    key: "finance.invoice.read",
    mode: "read",
    context_scope: "entity",
  };
  const decision = executeDecision({ invoice_id: "i1" });
  decision.execution.capability_key = readCapability.key;

  const result = evaluateOperatorPreAction({
    decision,
    capability: readCapability,
    entityId: "entity-1",
    projectState: {
      last_execution: {
        status: "completed",
        capability: { key: readCapability.key },
        requested_payload: { invoice_id: "i1" },
      },
    },
  });

  assert.equal(result.allowed, true);
});

test("applying a failed self-check removes executable intent", () => {
  const checked = applyOperatorPreActionSelfCheck({
    decision: executeDecision(),
    capability: null,
    entityId: "entity-1",
  });

  assert.equal(checked.self_check.allowed, false);
  assert.equal(checked.decision.intent, "clarify");
  assert.equal(checked.decision.execution.capability_key, null);
  assert.equal(checked.decision.clarification.required, true);
});
