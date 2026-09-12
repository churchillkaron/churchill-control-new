import assert from "node:assert/strict";
import test from "node:test";
import { deriveCodeAIObservedStrategyContracts, filterCodeAIStrategyCompetitionByObservedContracts } from "../lib/code/runtime/CodeAIStrategyContractAdmissibilityRuntime.js";

function read(path, content) {
  return { kind: "operation", action: "read", status: "completed", result: { file_path: path, content } };
}

test("strategy filter rejects only explicit contradictions of observed contracts", () => {
  const state = { evidence: [
    read("lib/runtime.js", "export function settleOrder(context){ return { invoice_id: context.organization_id }; }"),
    read("lib/service.js", 'import { settleOrder } from "./runtime.js"; const result = settleOrder({ organization_id: "x" }); console.log(result.invoice_id);'),
  ] };
  const result = filterCodeAIStrategyCompetitionByObservedContracts({
    state,
    competition: { ranked: [
      { id: "remove", score: 99, direction: "Rename settleOrder and remove invoice_id from its result." },
      { id: "preserve", score: 91, direction: "Repair settleOrder internally while preserving compatibility." },
      { id: "ambiguous", score: 80, direction: "Refactor the runtime for clarity." },
    ] },
  });
  assert.equal(result.contract_rejected_count, 1);
  assert.equal(result.contract_rejected_candidates[0].id, "remove");
  assert.equal(result.selected.id, "preserve");
  assert.ok(result.ranked.some((item) => item.id === "ambiguous"));
  assert.equal(result.explicit_contradictions_only, true);
  assert.equal(result.ambiguous_strategy_rejection_forbidden, true);
});

test("strategy filter never invents a contradiction without observed evidence", () => {
  const result = filterCodeAIStrategyCompetitionByObservedContracts({
    state: {},
    competition: { ranked: [{ id: "candidate", score: 90, direction: "Remove legacy compatibility code." }] },
  });
  assert.equal(result.contract_rejected_count, 0);
  assert.equal(result.selected.id, "candidate");
  assert.equal(result.contract_admissibility.obligation_count, 0);
});

test("strategy filter rejects explicit removal of observed tenant filters route fields and RPC keys", () => {
  const state = { evidence: [
    { action: "read", status: "completed", result: { file_path: "lib/orders/repository.js", content: "export async function work(db, org){ await db.from('orders').update({ organization_id: org }).eq('organization_id', org); return db.rpc('post_order', { organization_id: org }); }" } },
    { action: "read", status: "completed", result: { file_path: "app/api/orders/route.js", content: "export async function GET(){ return Response.json({ ok: true, invoice_id: 'x' }); }" } },
  ] };
  const competition = { ranked: [
    { id: "bad-filter", direction: "Remove organization_id filter from the orders repository.", score: 90 },
    { id: "bad-route", direction: "Drop invoice_id from the route response.", score: 80 },
    { id: "safe", direction: "Refactor implementation while preserving observed contracts.", score: 70 },
  ] };
  const result = filterCodeAIStrategyCompetitionByObservedContracts({ state, competition });
  assert.equal(result.contract_rejected_count, 2);
  assert.equal(result.ranked.length, 1);
  assert.equal(result.ranked[0].id, "safe");
  const kinds = result.contract_rejected_candidates.flatMap((item) => item.contract_conflicts.map((conflict) => conflict.kind));
  assert.ok(kinds.includes("SUPABASE_FILTER_KEY"));
  assert.ok(kinds.includes("NEXT_ROUTE_RESPONSE_FIELD"));
  const contracts = deriveCodeAIObservedStrategyContracts(state);
  assert.ok(contracts.obligations.some((item) => item.kind === "SUPABASE_RPC_ARGUMENT_KEY" && item.token === "organization_id"));
  assert.ok(contracts.obligations.some((item) => item.kind === "SUPABASE_MUTATION_FIELD" && item.token === "organization_id"));
});

test("strategy filter rejects explicit TypeScript public contract removal and optional tightening", () => {
  const state = { evidence: [read("lib/orders.ts", [
    "export interface OrderInput { organization_id: string; note?: string; }",
    "export function save(input: OrderInput): { id: string } { return { id: input.organization_id }; }",
  ].join("\n"))] };
  const result = filterCodeAIStrategyCompetitionByObservedContracts({
    state,
    competition: { ranked: [
      { id: "drop", score: 100, direction: "Remove organization_id from OrderInput." },
      { id: "tighten", score: 99, direction: "Make note required on OrderInput." },
      { id: "safe", score: 90, direction: "Refactor implementation while preserving OrderInput compatibility." },
    ] },
  });
  assert.equal(result.contract_rejected_count, 2);
  assert.deepEqual(result.contract_rejected_candidates.map((item) => item.id).sort(), ["drop", "tighten"]);
  assert.equal(result.selected.id, "safe");
});
