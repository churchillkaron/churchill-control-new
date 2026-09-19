import assert from "node:assert/strict";
import test from "node:test";

import {
  selectCodeAIDependencyAwareVerifiers,
} from "../lib/code/runtime/CodeAIDependencyAwareVerifierSelectionRuntime.js";
import {
  planCodeAIDeterministicVerificationGates,
} from "../lib/code/runtime/CodeAIDeterministicVerificationPlanRuntime.js";
import {
  planCodeAIRuntimeEvidenceCollection,
} from "../lib/code/runtime/CodeAIRuntimeEvidenceCollectorRuntime.js";

function read(path, content) {
  return { action: "read", status: "completed", result: { file_path: path, content } };
}

test("dependency-aware selector prefers direct observed tests of changed symbols", () => {
  const state = {
    files_changed: ["lib/orders/runtime.js"],
    source_changes: [{
      path: "lib/orders/runtime.js",
      operation: "write",
      content: "export function settleOrder(){ return true; }",
    }],
    evidence: [read(
      "tests/orders-runtime.test.mjs",
      'import { settleOrder } from "../lib/orders/runtime.js";\nsettleOrder();',
    )],
  };
  const selection = selectCodeAIDependencyAwareVerifiers({ state });
  assert.equal(selection.selected_test_paths[0], "tests/orders-runtime.test.mjs");
  assert.equal(selection.candidates[0].score, 100);
  assert.deepEqual(selection.candidates[0].verifier, {
    command: "node",
    args: ["--test", "tests/orders-runtime.test.mjs"],
  });
  assert.equal(selection.unsafe_test_runner_guessing_performed, false);
});

test("changed migration selects observed schema integration test", () => {
  const state = {
    files_changed: ["supabase/migrations/20990101000000_orders.sql"],
    source_changes: [{
      path: "supabase/migrations/20990101000000_orders.sql",
      operation: "write",
      content: "alter table public.orders add column memo text;",
    }],
    evidence: [read(
      "tests/orders.integration.mjs",
      'export async function check(db){ return db.from("orders").select("id"); }',
    )],
  };
  const selection = selectCodeAIDependencyAwareVerifiers({ state });
  assert.ok(selection.selected_test_paths.includes("tests/orders.integration.mjs"));
  const candidate = selection.candidates.find((item) => item.path === "tests/orders.integration.mjs");
  assert.equal(candidate.dependency_target, "schema:table:public.orders");
  assert.equal(candidate.family, "api_integration");
});

test("deterministic verification planner runs graph-linked test before generic syntax fallback", () => {
  const state = {
    files_changed: ["app/api/orders/route.js"],
    source_changes: [{
      path: "app/api/orders/route.js",
      operation: "write",
      content: "export function GET(){ return Response.json({ok:true}); }",
    }],
    evidence: [read(
      "tests/orders-route.test.mjs",
      'import { GET } from "../app/api/orders/route.js";\nawait GET();',
    )],
  };
  const plan = planCodeAIDeterministicVerificationGates({
    state,
    authoritative_verification: { command: "git", args: ["diff", "--check"] },
  });
  assert.equal(plan.operations[0].obligation, "DEPENDENCY_AWARE_BEHAVIORAL_GATE");
  assert.deepEqual(plan.operations[0].input, {
    command: "node",
    args: ["--test", "tests/orders-route.test.mjs"],
  });
  assert.equal(plan.planned_dependency_aware_gate_count, 1);
});

test("runtime evidence collector can use graph-selected integration test even when behavioral list is empty", () => {
  const state = {
    repository_url: "https://github.com/example/repo",
    ref: "main",
    patch: "diff",
    files_changed: ["app/api/orders/route.js"],
    source_changes: [{
      path: "app/api/orders/route.js",
      operation: "write",
      content: "export function GET(){ return Response.json({ok:true}); }",
    }],
    evidence: [read(
      "tests/orders.integration.mjs",
      'import { GET } from "../app/api/orders/route.js";\nawait GET();',
    )],
  };
  const plan = planCodeAIRuntimeEvidenceCollection({
    state,
    quality: { risk: "high" },
    behavioral_verification: { observed_impacted_test_paths: [] },
  });
  assert.equal(plan.applicable, true);
  assert.equal(plan.probes[0].path, "tests/orders.integration.mjs");
  assert.deepEqual(plan.probes[0].args, ["--test", "tests/orders.integration.mjs"]);
  assert.equal(plan.dependency_aware_verifier_selection.selected_count, 1);
});

test("multi-hop blast radius selects integration test through service and route consumers", () => {
  const state = {
    files_changed: ["lib/orders/runtime.js"],
    source_changes: [{
      path: "lib/orders/runtime.js",
      operation: "write",
      content: "export function settleOrder(){ return true; }",
    }],
    evidence: [
      read("lib/orders/service.js", 'import { settleOrder } from "./runtime.js";\nexport function settle(){ return settleOrder(); }'),
      read("app/api/orders/route.js", 'import { settle } from "../../../lib/orders/service.js";\nexport function POST(){ return settle(); }'),
      read("tests/orders.integration.mjs", 'import { POST } from "../app/api/orders/route.js";\nawait POST();'),
    ],
  };
  const selection = selectCodeAIDependencyAwareVerifiers({ state });
  const candidate = selection.candidates.find((item) => item.path === "tests/orders.integration.mjs");
  assert.ok(candidate);
  assert.equal(candidate.dependency_depth, 3);
  assert.equal(candidate.score, 78);
  assert.deepEqual(candidate.dependency_chain.map((edge) => edge.consumer), [
    "lib/orders/service.js",
    "app/api/orders/route.js",
    "tests/orders.integration.mjs",
  ]);
  assert.equal(selection.multi_hop_candidate_count, 1);
  assert.equal(selection.max_consumer_hops, 3);
  assert.equal(selection.blast_radius_bounded, true);
});

test("direct verifier outranks farther transitive verifier for the same changed source", () => {
  const state = {
    files_changed: ["lib/orders/runtime.js"],
    source_changes: [{ path: "lib/orders/runtime.js", operation: "write", content: "export function run(){ return true; }" }],
    evidence: [
      read("tests/runtime.test.mjs", 'import { run } from "../lib/orders/runtime.js";\nrun();'),
      read("lib/orders/service.js", 'import { run } from "./runtime.js";\nexport function serve(){ return run(); }'),
      read("tests/service.integration.mjs", 'import { serve } from "../lib/orders/service.js";\nserve();'),
    ],
  };
  const selection = selectCodeAIDependencyAwareVerifiers({ state });
  assert.equal(selection.selected_test_paths[0], "tests/runtime.test.mjs");
  const transitive = selection.candidates.find((item) => item.path === "tests/service.integration.mjs");
  assert.equal(transitive.dependency_depth, 2);
  assert.ok(selection.candidates[0].score > transitive.score);
});

test("schema blast radius can traverse application service before reaching integration test", () => {
  const state = {
    files_changed: ["supabase/migrations/20990101000000_orders.sql"],
    source_changes: [{ path: "supabase/migrations/20990101000000_orders.sql", operation: "write", content: "alter table public.orders add column note text;" }],
    evidence: [
      read("lib/orders/repository.js", 'export async function list(db){ return db.from("orders").select("id"); }'),
      read("tests/orders-repository.integration.mjs", 'import { list } from "../lib/orders/repository.js";\nawait list(db);'),
    ],
  };
  const selection = selectCodeAIDependencyAwareVerifiers({ state });
  const candidate = selection.candidates.find((item) => item.path === "tests/orders-repository.integration.mjs");
  assert.ok(candidate);
  assert.equal(candidate.dependency_target, "schema:table:public.orders");
  assert.equal(candidate.dependency_depth, 2);
  assert.equal(candidate.schema_seed, true);
});
