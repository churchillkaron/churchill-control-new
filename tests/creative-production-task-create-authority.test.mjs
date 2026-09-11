import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/operations/tasks/runtime/ProductionTaskRuntime.js", import.meta.url),
  "utf8",
);

test("ordinary create cannot introduce production approval contract", () => {
  assert.match(source, /PRODUCTION_TASK_AUTHORIZATION_METADATA_CREATE_FORBIDDEN/);
  assert.match(source, /"production_approval_contract"/);
});

test("ordinary create cannot introduce approved cost guard in task input", () => {
  assert.match(source, /PRODUCTION_TASK_AUTHORIZATION_INPUT_CREATE_FORBIDDEN:approved_cost_guard/);
  assert.match(source, /input\?\.input\?\.approved_cost_guard/);
});
test("zero-cost approved flag alone is not treated as execution authority", () => {
  assert.match(source, /current\.production_graph_id/);
  assert.match(source, /current\.metadata\?\.production_dossier_gate_passed !== true/);
  assert.doesNotMatch(
    source,
    /PRODUCTION_TASK_AUTHORIZATION_METADATA_CREATE_FORBIDDEN:cost\.approved/,
  );
});

test("generic updates also reserve sealed approval and cost guard metadata", () => {
  const keys = source.match(/EXECUTION_AUTHORIZATION_METADATA_KEYS[\s\S]*?\]\);/)?.[0] || "";
  assert.match(keys, /"production_approval_contract"/);
  assert.match(keys, /"approved_cost_guard"/);
});
