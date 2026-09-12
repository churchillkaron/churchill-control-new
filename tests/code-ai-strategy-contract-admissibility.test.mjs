import assert from "node:assert/strict";
import test from "node:test";
import { filterCodeAIStrategyCompetitionByObservedContracts } from "../lib/code/runtime/CodeAIStrategyContractAdmissibilityRuntime.js";

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
