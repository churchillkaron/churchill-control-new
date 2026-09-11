import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/operations/tasks/runtime/ProductionTaskRuntime.js", import.meta.url),
  "utf8",
);

test("graph-backed READY task requires approval before execution claim", () => {
  const approval = source.indexOf('throw new Error("PRODUCTION_TASK_EXECUTION_APPROVAL_REQUIRED")');
  const claim = source.indexOf("Repository.claimForExecution(id");
  assert.ok(approval > 0, "approval guard must exist");
  assert.ok(claim > 0, "execution claim must exist");
  assert.ok(approval < claim, "approval guard must run before execution claim");
});

test("graph-backed task also requires verified execution authorization before claim", () => {
  const authorization = source.indexOf('throw new Error("PRODUCTION_TASK_EXECUTION_AUTHORIZATION_REQUIRED")');
  const claim = source.indexOf("Repository.claimForExecution(id");
  assert.ok(authorization > 0, "authorization guard must exist");
  assert.ok(authorization < claim, "authorization guard must run before execution claim");
  assert.match(source, /current\.metadata\?\.production_dossier_gate_passed !== true/);
});

test("preclaim guards are limited to graph-backed tasks", () => {
  assert.match(source, /if \(current\.production_graph_id\) \{/);
});
