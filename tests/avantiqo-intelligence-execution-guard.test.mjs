import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateOperatorIntelligenceExecutionGuard,
  operatorIntelligenceMutationBlock,
  runWithOperatorIntelligenceExecutionGuard,
} from "../lib/operator/runtime/OperatorIntelligenceExecutionGuardRuntime.js";

function cognitiveBriefConversation(steps) {
  const brief = {
    planning_complete: true,
    execution_guidance_allowed: true,
    cognitive_plan: {
      status: "PLAN_VALIDATED",
    },
    governed_plan: {
      valid: true,
      steps,
    },
  };
  return [
    {
      role: "assistant",
      content: `AVANTIQO_OWNED_COGNITIVE_BRIEF_V4\nServer-generated planning context.\n${JSON.stringify(brief)}`,
    },
  ];
}

function guardedBlock(guard, capability) {
  return runWithOperatorIntelligenceExecutionGuard(
    guard,
    () => operatorIntelligenceMutationBlock(capability),
  );
}

test("validated cognitive plan binds mutation authority to the exact planned capability", () => {
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: cognitiveBriefConversation([
      {
        id: "inspect",
        mutates: false,
        capability_key: "finance.invoice.read",
      },
      {
        id: "post",
        mutates: true,
        capability_key: "finance.invoice.post",
      },
    ]),
  });

  assert.equal(guard.cognitive_plan_valid, true);
  assert.equal(guard.mutating_execution_allowed, true);
  assert.equal(guard.cognitive_plan_capability_binding_enforced, true);
  assert.deepEqual(guard.allowed_mutation_capability_keys, [
    "finance.invoice.post",
  ]);
  assert.equal(
    guardedBlock(guard, {
      key: "finance.invoice.post",
      mode: "write",
    }),
    null,
  );
});

test("a different mutation cannot ride on another capability's validated cognitive plan", () => {
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: cognitiveBriefConversation([
      {
        id: "post",
        mutates: true,
        capability_key: "finance.invoice.post",
      },
    ]),
  });

  const blocked = guardedBlock(guard, {
    key: "finance.payment.refund",
    mode: "write",
  });

  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, "COGNITIVE_PLAN_CAPABILITY_BINDING_MISMATCH");
  assert.equal(blocked.exact_cognitive_plan_capability_binding_required, true);
  assert.equal(blocked.exact_cognitive_plan_capability_binding_matched, false);
  assert.equal(blocked.authorization_effect, "NONE");
});

test("a read-only cognitive plan cannot later authorize a mutation", () => {
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: cognitiveBriefConversation([
      {
        id: "inspect",
        mutates: false,
        capability_key: "finance.invoice.read",
      },
    ]),
  });

  assert.equal(guard.cognitive_plan_valid, true);
  assert.equal(guard.mutating_execution_allowed, false);
  assert.deepEqual(guard.allowed_mutation_capability_keys, []);

  const blocked = guardedBlock(guard, {
    key: "finance.invoice.post",
    mode: "write",
  });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, "COGNITIVE_PLAN_MUTATION_NOT_VALIDATED");
});

test("read-only execution remains available regardless of mutation binding", () => {
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: cognitiveBriefConversation([
      {
        id: "inspect",
        mutates: false,
        capability_key: "finance.invoice.read",
      },
    ]),
  });

  assert.equal(
    guardedBlock(guard, {
      key: "finance.invoice.read",
      mode: "read",
    }),
    null,
  );
});