import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync("lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js","utf8");
test("research approval remains reusable while approved budget remains",()=>{
  assert.match(source,/approvalHasRemainingBudget = spend \+ 0\.000001 < maximumApproved/);
  assert.match(source,/approved: approvalHasRemainingBudget/);
  assert.match(source,/approval_reusable_after_failure_with_remaining_budget: approvalHasRemainingBudget/);
});
