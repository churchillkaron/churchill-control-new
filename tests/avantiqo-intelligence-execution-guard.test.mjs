import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  evaluateOperatorIntelligenceExecutionGuard,
  operatorIntelligenceMutationBindingProof,
  operatorIntelligenceMutationBlock,
  runWithOperatorIntelligenceExecutionGuard,
} from "../lib/operator/runtime/OperatorIntelligenceExecutionGuardRuntime.js";

const SCOPE = Object.freeze({
  organization_id: "org-1",
  entity_id: "entity-1",
  period_id: "period-1",
  party_id: "party-1",
});

const SCOPE_KEYS = new Set([
  "organizationId", "organization_id", "entityId", "entity_id",
  "periodId", "period_id", "partyId", "party_id",
]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
  );
}

function fingerprint(payload = {}) {
  const businessPayload = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !SCOPE_KEYS.has(key)),
  );
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(businessPayload)))
    .digest("hex");
}

function cognitiveBriefConversation(steps, scope = SCOPE) {
  const normalizedSteps = steps.map((step) => ({
    ...step,
    ...(step.mutates === true
      ? { payload_fingerprint: fingerprint(step.payload || {}) }
      : {}),
  }));
  const brief = {
    planning_complete: true,
    execution_guidance_allowed: true,
    cognitive_plan: { status: "PLAN_VALIDATED" },
    governed_plan: {
      valid: true,
      execution_scope: scope,
      steps: normalizedSteps,
    },
  };
  return [{
    role: "assistant",
    content: `AVANTIQO_OWNED_COGNITIVE_BRIEF_V4\nServer-generated planning context.\n${JSON.stringify(brief)}`,
  }];
}

function execution(payload = {}) {
  return {
    organizationId: SCOPE.organization_id,
    entityId: SCOPE.entity_id,
    periodId: SCOPE.period_id,
    partyId: SCOPE.party_id,
    payload,
  };
}

function guardedBlock(guard, capability, executionContext = execution()) {
  return runWithOperatorIntelligenceExecutionGuard(
    guard,
    () => operatorIntelligenceMutationBlock(capability, executionContext),
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
        payload: { invoice_id: "inv-1", status: "posted" },
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
    guardedBlock(
      guard,
      { key: "finance.invoice.post", mode: "write" },
      execution({ invoice_id: "inv-1", status: "posted" }),
    ),
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
        payload: { invoice_id: "inv-1" },
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


test("same capability cannot cross the server-stamped legal-entity scope", () => {
  const payload = { invoice_id: "inv-1" };
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: cognitiveBriefConversation([{
      id: "post",
      mutates: true,
      capability_key: "finance.invoice.post",
      payload,
    }]),
  });

  const blocked = guardedBlock(
    guard,
    { key: "finance.invoice.post", mode: "write" },
    { ...execution(payload), entityId: "entity-2" },
  );
  assert.equal(blocked.reason, "COGNITIVE_PLAN_EXECUTION_SCOPE_BINDING_MISMATCH");
  assert.equal(blocked.exact_cognitive_plan_scope_binding_matched, false);
  assert.equal(blocked.authorization_effect, "NONE");
});

test("same capability and scope cannot execute a different mutation payload", () => {
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: cognitiveBriefConversation([{
      id: "post",
      mutates: true,
      capability_key: "finance.invoice.post",
      payload: { invoice_id: "inv-1", amount: 100 },
    }]),
  });

  const blocked = guardedBlock(
    guard,
    { key: "finance.invoice.post", mode: "write" },
    execution({ invoice_id: "inv-1", amount: 999 }),
  );
  assert.equal(blocked.reason, "COGNITIVE_PLAN_MUTATION_PAYLOAD_BINDING_MISMATCH");
  assert.equal(blocked.exact_cognitive_plan_payload_binding_matched, false);
  assert.equal(blocked.authorization_effect, "NONE");
});

test("mutation plans without a server execution scope fail closed", () => {
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: cognitiveBriefConversation([{
      id: "post",
      mutates: true,
      capability_key: "finance.invoice.post",
      payload: { invoice_id: "inv-1" },
    }], {}),
  });

  assert.equal(guard.mutating_execution_allowed, false);
  assert.equal(guard.reason, "COGNITIVE_PLAN_EXECUTION_SCOPE_NOT_BOUND");
});


test("successful binding emits a durable proof identity without granting authority", () => {
  const payload = { invoice_id: "inv-1", amount: 100 };
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: cognitiveBriefConversation([{
      id: "post",
      mutates: true,
      capability_key: "finance.invoice.post",
      payload,
    }]),
  });

  const proof = runWithOperatorIntelligenceExecutionGuard(guard, () =>
    operatorIntelligenceMutationBindingProof(
      { key: "finance.invoice.post", mode: "write" },
      execution(payload),
    ),
  );

  assert.equal(proof.contract, "AVANTIQO_COGNITIVE_MUTATION_BINDING_PROOF_V1");
  assert.equal(proof.step_id, "post");
  assert.equal(proof.capability_key, "finance.invoice.post");
  assert.match(proof.payload_fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(proof.execution_scope, SCOPE);
  assert.equal(proof.matched, true);
  assert.equal(proof.authorization_effect, "NONE");
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