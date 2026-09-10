import assert from "node:assert/strict";
import test from "node:test";

import {
  bindOperatorSelfEngineeringDecision,
} from "../lib/operator/runtime/OperatorSelfEngineeringDecisionBinding.js";

const cycle = { key: "platform.product_engineering_cycle.execute" };
const portfolio = { key: "platform.product_engineering_portfolio.execute" };

function request(capability_key, original_message = "fix Avantiqo signup") {
  return {
    detected: true,
    capability_key,
    original_message,
  };
}
test("classified self-engineering cannot be downgraded to a conversational answer", () => {
  const bound = bindOperatorSelfEngineeringDecision({
    decision: { intent: "answer", execution: { capability_key: null } },
    selfEngineeringRequest: request(cycle.key),
    capabilities: [cycle],
  });
  assert.equal(bound.applied, true);
  assert.equal(bound.decision.intent, "execute");
  assert.equal(bound.decision.execution.capability_key, cycle.key);
  assert.deepEqual(bound.decision.execution.payload, { focus: "fix Avantiqo signup" });
  assert.equal(bound.authorization_effect, "NONE");
  assert.equal(bound.automatic_deploy_allowed, false);
});

test("classified self-engineering overrides an unrelated model-selected capability", () => {
  const bound = bindOperatorSelfEngineeringDecision({
    decision: { intent: "execute", execution: { capability_key: "finance.invoice.create" } },
    selfEngineeringRequest: request(cycle.key),
    capabilities: [cycle],
  });
  assert.equal(bound.applied, true);
  assert.equal(bound.decision.execution.capability_key, cycle.key);
});
test("broad self-engineering binds to the portfolio capability and business goal", () => {
  const bound = bindOperatorSelfEngineeringDecision({
    decision: { intent: "clarify", execution: { capability_key: null } },
    selfEngineeringRequest: request(portfolio.key, "make Finance world class end to end"),
    capabilities: [cycle, portfolio],
  });
  assert.equal(bound.applied, true);
  assert.equal(bound.decision.execution.capability_key, portfolio.key);
  assert.deepEqual(bound.decision.execution.payload, {
    business_goal: "make Finance world class end to end",
  });
});

test("binding fails closed when the server-selected capability is not registered", () => {
  const original = { intent: "answer", execution: { capability_key: null } };
  const bound = bindOperatorSelfEngineeringDecision({
    decision: original,
    selfEngineeringRequest: request(cycle.key),
    capabilities: [],
  });
  assert.equal(bound.applied, false);
  assert.equal(bound.reason, "SELF_ENGINEERING_CAPABILITY_NOT_REGISTERED");
  assert.equal(bound.decision, original);
});
