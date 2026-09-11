import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  "lib/platform/capabilities/createProductEngineeringCycleCapability.js",
  "utf8",
);

function engineerBindingsSource() {
  const start = source.indexOf('id: "engineer_next_gap"');
  const end = source.indexOf('verify_after:', start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

test("Product Engineering stays inside the global mission binding ceiling", () => {
  const section = engineerBindingsSource();
  const declared = [...section.matchAll(/source_step_id:\s*"assess_repository"/g)].length;
  assert.ok(declared > 0);
  assert.ok(declared <= 12, `engineer_next_gap declares ${declared} bindings`);
  assert.equal(declared, 12);
});

test("Code keeps repository, selection, market, and three explicit completion targets", () => {
  const section = engineerBindingsSource();
  for (const token of [
    'target_path: "objective"',
    'target_path: "objective_context.repository_head_observed"',
    'target_path: "objective_context.selection_contract"',
    'target_path: "objective_context.selected_candidate_id"',
    'target_path: "objective_context.selection_score"',
    'target_path: "objective_context.evidence_backed"',
    'target_path: "objective_context.product_research_performed"',
    'target_path: "objective_context.market_advantage_required"',
    'target_path: "objective_context.market_advantage_criterion_bound"',
    'target_path: "objective_context.completion_criterion_1"',
    'target_path: "objective_context.completion_criterion_2"',
    'target_path: "objective_context.completion_criterion_3"',
  ]) assert.match(section, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(section, /completion_criterion_[456]/);
});
