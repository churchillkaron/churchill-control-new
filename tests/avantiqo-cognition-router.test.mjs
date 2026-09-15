import assert from "node:assert/strict";
import test from "node:test";

import {
  routeAvantiqoCognition,
  AVANTIQO_COGNITION_ROUTER_CONTRACT,
} from "../lib/intelligence/runtime/AvantiqoCognitionRouterRuntime.js";

test("bounded transformation stays on Fast in auto mode", () => {
  const route = routeAvantiqoCognition({
    goal: "Rewrite this sentence shorter and clearer.",
    requested_mode: "auto",
  });
  assert.equal(route.contract, AVANTIQO_COGNITION_ROUTER_CONTRACT);
  assert.equal(route.mode, "fast");
  assert.equal(route.requirements.research_required, false);
  assert.equal(route.requirements.verification_required, false);
});

test("current regulation comparison routes Deep and requires fresh evidence", () => {
  const route = routeAvantiqoCognition({
    goal: "Compare the latest accounting regulation changes, explain the tradeoffs and recommend what we should change.",
    requested_mode: "auto",
  });
  assert.equal(route.mode, "deep");
  assert.equal(route.requirements.research_required, true);
  assert.equal(route.requirements.live_read_required, true);
  assert.equal(route.requirements.critique_required, true);
});

test("irreversible high-risk action cannot be forced onto Fast", () => {
  const route = routeAvantiqoCognition({
    goal: "Delete the old production records after checking the evidence.",
    requested_mode: "fast",
    tools: [{
      name: "production.records.delete",
      operatorMode: "write",
      risk: "critical",
      transactional: true,
    }],
  });
  assert.equal(route.mode, "deep");
  assert.equal(route.signals.irreversible_intent, true);
  assert.equal(route.requirements.verification_required, true);
  assert.equal(route.governance.high_risk_safety_floor, true);
});

test("mutating tool availability does not invent mutation intent or a verification obligation", () => {
  const route = routeAvantiqoCognition({
    goal: "Summarize the customer record already provided in context.",
    requested_mode: "auto",
    tools: [{
      name: "customer_update",
      operatorMode: "write",
      transactional: true,
    }],
  });

  assert.equal(route.signals.mutation_intent, false);
  assert.equal(route.signals.mutation_capability_available, true);
  assert.equal(route.requirements.verification_required, false);
  assert.equal(
    route.governance.verification_tracks_intent_not_tool_availability,
    true,
  );
});

test("explicit mutation intent requires verification", () => {
  const route = routeAvantiqoCognition({
    goal: "Update the customer record with the approved value.",
    tools: [{
      name: "customer_update",
      mutates: true,
    }],
  });

  assert.equal(route.signals.mutation_intent, true);
  assert.equal(route.signals.mutation_capability_available, true);
  assert.equal(route.requirements.verification_required, true);
});

test("memory requiring a live read propagates the live-evidence obligation", () => {
  const route = routeAvantiqoCognition({
    goal: "What is our current balance?",
    memories: [{
      content: "Historic balance was 100.",
      confidence: 0.95,
      freshness: "stale",
      requires_live_read: true,
    }],
  });
  assert.equal(route.requirements.live_read_required, true);
  assert.equal(route.signals.memory_live_read_required, true);
});

test("explicit Deep request remains Deep", () => {
  const route = routeAvantiqoCognition({
    goal: "Summarize these three facts.",
    requested_mode: "deep",
  });
  assert.equal(route.mode, "deep");
});

test("Fast route publishes deterministic escalation policy", () => {
  const route = routeAvantiqoCognition({
    goal: "Extract the invoice number from this text.",
    requested_mode: "fast",
  });
  assert.equal(route.mode, "fast");
  assert.ok(route.escalation.from_fast_to_deep_if.includes("confidence_below_0_72"));
  assert.ok(route.escalation.never_downgrade_if.includes("irreversible_action"));
  assert.equal(route.governance.deterministic_pre_model_routing, true);
});

test("short hard business decision routes Deep", () => {
  const route = routeAvantiqoCognition({
    goal: "Should we reduce inventory to improve cash flow?",
    requested_mode: "auto",
  });
  assert.equal(route.mode, "deep");
  assert.equal(route.requirements.specialist_depth_required, true);
  assert.ok(route.specialist.domains.includes("business"));
});

test("short Avantiqo architecture request routes Deep", () => {
  const route = routeAvantiqoCognition({
    goal: "Refactor Avantiqo provider routing without breaking Safe Lease.",
    requested_mode: "auto",
  });
  assert.equal(route.mode, "deep");
  assert.equal(route.requirements.specialist_depth_required, true);
  assert.ok(route.specialist.domains.includes("avantiqo"));
});

test("short code debugging request routes Deep", () => {
  const route = routeAvantiqoCognition({
    goal: "Debug this Node.js runtime regression.",
    requested_mode: "auto",
  });
  assert.equal(route.mode, "deep");
  assert.equal(route.requirements.specialist_depth_required, true);
  assert.ok(route.specialist.domains.includes("code"));
});

test("trivial specialist edit can stay Fast", () => {
  const route = routeAvantiqoCognition({
    goal: "Fix this JavaScript typo.",
    requested_mode: "auto",
  });
  assert.equal(route.mode, "fast");
  assert.equal(route.specialist.trivial_fast_path, true);
});

test("explicit specialist context can deepen an otherwise terse goal", () => {
  const route = routeAvantiqoCognition({
    goal: "Find the best approach.",
    requested_mode: "auto",
    context: { intelligence_domain: "business", multi_step_execution: true },
  });
  assert.equal(route.mode, "deep");
  assert.ok(route.specialist.domains.includes("business"));
});
