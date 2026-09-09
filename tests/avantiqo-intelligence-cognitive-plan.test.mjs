import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  compileOwnedCognitivePlan,
  OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT,
} from "../lib/operator/runtime/OperatorOwnedCognitivePlanRuntime.js";
function fingerprint(value = {}) {
  const canonical = (input) => {
    if (Array.isArray(input)) return input.map(canonical);
    if (!input || typeof input !== "object") return input ?? null;
    return Object.fromEntries(Object.keys(input).sort().map((key) => [key, canonical(input[key]) ]));
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}


function readStep(overrides = {}) {
  return {
    id: "read-current-state",
    title: "Read current state",
    kind: "read",
    depends_on: [],
    mutates: false,
    verification: {
      required: true,
      criteria: ["Current scoped evidence was returned."],
    },
    ...overrides,
  };
}

test("cognitive plan compiler accepts a valid governed plan graph", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Inspect the current state and verify it",
    completion_test: "Current evidence has been verified.",
    plan_steps: [readStep()],
  });

  assert.equal(result.contract, OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT);
  assert.equal(result.status, "PLAN_VALIDATED");
  assert.equal(result.planning_complete, true);
  assert.equal(result.execution_guidance_allowed, true);
  assert.equal(result.governed_plan.valid, true);
  assert.deepEqual(result.governed_plan.execution_order, ["read-current-state"]);
  assert.equal(result.governance.execution_authority, "NONE");
});

test("cognitive plan compiler rejects a missing materialized plan", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Do something complex",
    plan_steps: [],
  });

  assert.equal(result.status, "PLAN_NOT_MATERIALIZED");
  assert.equal(result.planning_complete, false);
  assert.equal(result.execution_guidance_allowed, false);
  assert.equal(result.governed_plan, null);
  assert.ok(result.issues.some((issue) => issue.code === "COGNITIVE_PLAN_STEPS_REQUIRED"));
});

test("cognitive plan compiler rejects invalid dependencies", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Reject a malformed graph",
    plan_steps: [
      readStep({ id: "a", depends_on: ["b"] }),
      readStep({ id: "b", depends_on: ["a"] }),
    ],
  });

  assert.equal(result.status, "PLAN_REJECTED_INVALID_GRAPH");
  assert.equal(result.planning_complete, false);
  assert.equal(result.execution_guidance_allowed, false);
  assert.equal(result.governed_plan.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "PLAN_DEPENDENCY_CYCLE"));
});

test("cognitive plan compiler rejects unsafe mutation planning", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Attempt a mutation without governance",
    plan_steps: [
      {
        id: "unsafe-change",
        title: "Unsafe change",
        kind: "action_candidate",
        depends_on: [],
        mutates: true,
        verification: { required: false, criteria: [] },
      },
    ],
  });

  assert.equal(result.status, "PLAN_REJECTED_INVALID_GRAPH");
  assert.equal(result.execution_guidance_allowed, false);
  const codes = result.issues.map((issue) => issue.code);
  assert.ok(codes.includes("MUTATION_CAPABILITY_KEY_REQUIRED"));
  assert.ok(codes.includes("MUTATION_ACTION_CANDIDATE_VALIDATION_REQUIRED"));
  assert.ok(codes.includes("MUTATION_COMPLETION_VERIFICATION_REQUIRED"));
});

test("Synthetic Intelligence V4 compiles model plan steps before Operator handoff", () => {
  const source = fs.readFileSync(
    new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /AVANTIQO_OPERATOR_OWNED_COGNITIVE_BRIEF_V4/);
  assert.match(source, /OperatorOwnedCognitivePlanRuntime\.attach/);
  assert.match(source, /completion_test, plan_steps/);
  assert.match(source, /governed_plan is a deterministic planning graph only/);
  assert.match(source, /execution_guidance_allowed=false/);
  assert.match(source, /cognitive_plan_execution_guidance_allowed/);
  assert.match(source, /execution_governance_bypassed:\s*false/);
});

test("cognitive plan seals server scope and mutation payload without persisting raw payload", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Create exactly one scoped invoice",
    execution_scope: {
      organization_id: "org-1",
      entity_id: "entity-1",
      period_id: "period-1",
      party_id: "party-1",
    },
    plan_steps: [{
      id: "create-invoice",
      title: "Create the invoice",
      kind: "action_candidate",
      depends_on: [],
      capability_key: "finance.invoice.create",
      payload: { customer_id: "customer-1", amount: 1250 },
      mutates: true,
      reversible: true,
      candidate_validation: {
        validated: true,
        payload_complete: true,
      },
      verification: {
        required: true,
        criteria: ["The exact invoice can be read back."],
      },
      rollback: { available: true, strategy: "Void the draft invoice." },
    }],
  });

  assert.equal(result.status, "PLAN_VALIDATED");
  assert.deepEqual(result.governed_plan.execution_scope, {
    organization_id: "org-1",
    entity_id: "entity-1",
    period_id: "period-1",
    party_id: "party-1",
  });
  const mutation = result.governed_plan.steps[0];
  assert.match(mutation.payload_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(mutation, "payload"), false);
});

test("historical memory cannot support a mutation without a fresh capability-bound read", () => {
  const plan = compileOwnedCognitivePlan({
    goal: "Continue and send the invoice",
    execution_scope: { organization_id: "org-1", entity_id: "entity-1" },
    temporal_memory_obligation: {
      current_state_live_read_required: true,
      source: "SERVER_RECALLED_HISTORY",
      authorization_effect: "NONE",
    },
    plan_steps: [
      {
        id: "send-invoice",
        title: "Send invoice",
        kind: "action_candidate",
        capability_key: "finance.invoice.send",
        mutates: true,
        payload: { invoice_id: "inv-1" },
        candidate_validation: { validated: true, payload_complete: true },
        verification: { required: true, criteria: ["Invoice send is verified."] },
      },
    ],
  });

  assert.equal(plan.planning_complete, false);
  assert.equal(plan.execution_guidance_allowed, false);
  assert.ok(plan.issues.some((issue) => issue.code === "MUTATION_REQUIRES_FRESH_STATE_READ"));
});

test("fresh capability-bound read may satisfy historical-memory mutation freshness only with server receipt", () => {
  const plan = compileOwnedCognitivePlan({
    goal: "Continue and send the invoice",
    execution_scope: { organization_id: "org-1", entity_id: "entity-1" },
    temporal_memory_obligation: {
      current_state_live_read_required: true,
      source: "SERVER_RECALLED_HISTORY",
      authorization_effect: "NONE",
    },
    server_live_read_receipts: [{
      contract: "AVANTIQO_OPERATOR_INTELLIGENCE_LIVE_READ_RECEIPT_V1",
      capability_key: "finance.invoice.read",
      plan_step_id: "read-invoice",
      payload_fingerprint: fingerprint({ invoice_id: "inv-1" }),
      result_fingerprint: fingerprint({ observed: true }),
      evidence_semantics: "VALID_OBSERVATION",
      organization_id: "org-1",
      entity_id: "entity-1",
      period_id: null,
      party_id: null,
      status: "completed",
      authorization_effect: "NONE",
    }],
    plan_steps: [
      {
        id: "read-invoice",
        title: "Read current invoice state",
        kind: "read",
        capability_key: "finance.invoice.read",
        payload: { invoice_id: "inv-1" },
        mutates: false,
        verification: { required: true, criteria: ["Current invoice state is returned."] },
      },
      {
        id: "send-invoice",
        title: "Send invoice",
        kind: "action_candidate",
        capability_key: "finance.invoice.send",
        mutates: true,
        depends_on: ["read-invoice"],
        payload: { invoice_id: "inv-1" },
        candidate_validation: { validated: true, payload_complete: true },
        verification: { required: true, criteria: ["Invoice send is verified."] },
      },
    ],
  });

  assert.equal(plan.planning_complete, true);
  assert.equal(plan.execution_guidance_allowed, true);
  assert.equal(plan.issues.length, 0);
});



test("planned read without successful server receipt does not satisfy mutation freshness", () => {
  const plan = compileOwnedCognitivePlan({
    goal: "Continue and send the invoice",
    execution_scope: { organization_id: "org-1", entity_id: "entity-1" },
    temporal_memory_obligation: {
      current_state_live_read_required: true,
      source: "SERVER_RECALLED_HISTORY",
      authorization_effect: "NONE",
    },
    plan_steps: [
      {
        id: "read-invoice",
        title: "Read current invoice state",
        kind: "read",
        capability_key: "finance.invoice.read",
        mutates: false,
        verification: { required: true, criteria: ["Current invoice state is returned."] },
      },
      {
        id: "send-invoice",
        title: "Send invoice",
        kind: "action_candidate",
        capability_key: "finance.invoice.send",
        mutates: true,
        depends_on: ["read-invoice"],
        payload: { invoice_id: "inv-1" },
        candidate_validation: { validated: true, payload_complete: true },
        verification: { required: true, criteria: ["Invoice send is verified."] },
      },
    ],
  });

  assert.equal(plan.planning_complete, false);
  assert.ok(plan.issues.some((issue) => issue.code === "MUTATION_REQUIRES_FRESH_STATE_READ"));
});

test("receipt for a different read capability cannot satisfy mutation freshness", () => {
  const plan = compileOwnedCognitivePlan({
    goal: "Continue and send the invoice",
    execution_scope: { organization_id: "org-1", entity_id: "entity-1" },
    temporal_memory_obligation: {
      current_state_live_read_required: true,
      source: "SERVER_RECALLED_HISTORY",
      authorization_effect: "NONE",
    },
    server_live_read_receipts: [{
      contract: "AVANTIQO_OPERATOR_INTELLIGENCE_LIVE_READ_RECEIPT_V1",
      capability_key: "finance.customer.read",
      plan_step_id: "read-invoice",
      payload_fingerprint: fingerprint({ invoice_id: "inv-1" }),
      result_fingerprint: fingerprint({ observed: true }),
      evidence_semantics: "VALID_OBSERVATION",
      organization_id: "org-1",
      entity_id: "entity-1",
      status: "completed",
      authorization_effect: "NONE",
    }],
    plan_steps: [
      {
        id: "read-invoice",
        title: "Read current invoice state",
        kind: "read",
        capability_key: "finance.invoice.read",
        payload: { invoice_id: "inv-1" },
        mutates: false,
        verification: { required: true, criteria: ["Current invoice state is returned."] },
      },
      {
        id: "send-invoice",
        title: "Send invoice",
        kind: "action_candidate",
        capability_key: "finance.invoice.send",
        mutates: true,
        depends_on: ["read-invoice"],
        payload: { invoice_id: "inv-1" },
        candidate_validation: { validated: true, payload_complete: true },
        verification: { required: true, criteria: ["Invoice send is verified."] },
      },
    ],
  });

  assert.equal(plan.planning_complete, false);
  assert.ok(plan.issues.some((issue) => issue.code === "MUTATION_REQUIRES_FRESH_STATE_READ"));
});

test("live-read receipt from the wrong entity cannot satisfy mutation freshness", () => {
  const plan = compileOwnedCognitivePlan({
    goal: "Continue and send the invoice",
    execution_scope: { organization_id: "org-1", entity_id: "entity-1" },
    temporal_memory_obligation: { current_state_live_read_required: true, source: "SERVER_RECALLED_HISTORY", authorization_effect: "NONE" },
    server_live_read_receipts: [{
      contract: "AVANTIQO_OPERATOR_INTELLIGENCE_LIVE_READ_RECEIPT_V1",
      capability_key: "finance.invoice.read",
      plan_step_id: "read-invoice",
      payload_fingerprint: fingerprint({ invoice_id: "inv-1" }),
      result_fingerprint: fingerprint({ observed: true }),
      evidence_semantics: "VALID_OBSERVATION",
      organization_id: "org-1",
      entity_id: "entity-2",
      period_id: null,
      party_id: null,
      status: "completed",
      authorization_effect: "NONE",
    }],
    plan_steps: [
      { id: "read-invoice", title: "Read current invoice state", kind: "read", capability_key: "finance.invoice.read", payload: { invoice_id: "inv-1" }, mutates: false, verification: { required: true, criteria: ["Current invoice state is returned."] } },
      { id: "send-invoice", title: "Send invoice", kind: "action_candidate", capability_key: "finance.invoice.send", mutates: true, depends_on: ["read-invoice"], payload: { invoice_id: "inv-1" }, candidate_validation: { validated: true, payload_complete: true }, verification: { required: true, criteria: ["Invoice send is verified."] } },
    ],
  });
  assert.equal(plan.planning_complete, false);
  assert.ok(plan.issues.some((issue) => issue.code === "MUTATION_REQUIRES_FRESH_STATE_READ"));
});

test("live-read receipt for a different payload cannot satisfy mutation freshness", () => {
  const plan = compileOwnedCognitivePlan({
    goal: "Continue and send the invoice",
    execution_scope: { organization_id: "org-1", entity_id: "entity-1" },
    temporal_memory_obligation: { current_state_live_read_required: true, source: "SERVER_RECALLED_HISTORY", authorization_effect: "NONE" },
    server_live_read_receipts: [{
      contract: "AVANTIQO_OPERATOR_INTELLIGENCE_LIVE_READ_RECEIPT_V1",
      capability_key: "finance.invoice.read",
      plan_step_id: "read-invoice",
      payload_fingerprint: fingerprint({ invoice_id: "inv-2" }),
      result_fingerprint: fingerprint({ observed: true }),
      evidence_semantics: "VALID_OBSERVATION",
      organization_id: "org-1",
      entity_id: "entity-1",
      period_id: null,
      party_id: null,
      status: "completed",
      authorization_effect: "NONE",
    }],
    plan_steps: [
      { id: "read-invoice", title: "Read current invoice state", kind: "read", capability_key: "finance.invoice.read", payload: { invoice_id: "inv-1" }, mutates: false, verification: { required: true, criteria: ["Current invoice state is returned."] } },
      { id: "send-invoice", title: "Send invoice", kind: "action_candidate", capability_key: "finance.invoice.send", mutates: true, depends_on: ["read-invoice"], payload: { invoice_id: "inv-1" }, candidate_validation: { validated: true, payload_complete: true }, verification: { required: true, criteria: ["Invoice send is verified."] } },
    ],
  });
  assert.equal(plan.planning_complete, false);
  assert.ok(plan.issues.some((issue) => issue.code === "MUTATION_REQUIRES_FRESH_STATE_READ"));
});

test("completed-looking receipt without valid observation semantics cannot satisfy freshness", () => {
  const plan = compileOwnedCognitivePlan({
    goal: "Continue and send the invoice",
    execution_scope: { organization_id: "org-1", entity_id: "entity-1" },
    temporal_memory_obligation: { current_state_live_read_required: true, source: "SERVER_RECALLED_HISTORY", authorization_effect: "NONE" },
    server_live_read_receipts: [{
      contract: "AVANTIQO_OPERATOR_INTELLIGENCE_LIVE_READ_RECEIPT_V1",
      capability_key: "finance.invoice.read",
      plan_step_id: "read-invoice",
      payload_fingerprint: fingerprint({ invoice_id: "inv-1" }),
      result_fingerprint: fingerprint({ observed: true }),
      organization_id: "org-1",
      entity_id: "entity-1",
      period_id: null,
      party_id: null,
      status: "completed",
      authorization_effect: "NONE",
    }],
    plan_steps: [
      { id: "read-invoice", title: "Read current invoice state", kind: "read", capability_key: "finance.invoice.read", payload: { invoice_id: "inv-1" }, mutates: false, verification: { required: true, criteria: ["Current invoice state is returned."] } },
      { id: "send-invoice", title: "Send invoice", kind: "action_candidate", capability_key: "finance.invoice.send", mutates: true, depends_on: ["read-invoice"], payload: { invoice_id: "inv-1" }, candidate_validation: { validated: true, payload_complete: true }, verification: { required: true, criteria: ["Invoice send is verified."] } },
    ],
  });
  assert.equal(plan.planning_complete, false);
  assert.ok(plan.issues.some((issue) => issue.code === "MUTATION_REQUIRES_FRESH_STATE_READ"));
});

test("historical memory cannot answer current status without a capability-bound live read", () => {
  const plan = compileOwnedCognitivePlan({
    goal: "Is the invoice still draft now?",
    temporal_memory_obligation: {
      current_state_live_read_required: true,
      source: "SERVER_RECALLED_HISTORY",
      authorization_effect: "NONE",
    },
    plan_steps: [
      {
        id: "analyze-history",
        title: "Analyze prior verified history",
        kind: "analysis",
        mutates: false,
        verification: { required: true, criteria: ["Historical evidence is summarized."] },
      },
    ],
  });

  assert.equal(plan.planning_complete, false);
  assert.ok(plan.issues.some((issue) => issue.code === "CURRENT_STATE_LIVE_READ_REQUIRED"));
});
