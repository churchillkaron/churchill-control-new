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

test("preclaim guard is limited to graph-backed tasks", () => {
  assert.match(
    source,
    /current\.production_graph_id\s*&&\s*current\.cost\?\.approved !== true/,
  );
});
