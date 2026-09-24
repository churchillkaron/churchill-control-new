import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js", "utf8");

test("in-progress direction may continue after start deadline without resetting caps", () => {
  assert.match(source, /DIRECTION_IN_PROGRESS_CONTINUATION_WINDOW_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(source, /status === "IN_PROGRESS"/);
  assert.match(source, /Number\(approval\.call_count \|\| 0\) > 0/);
  assert.match(source, /now <= expiresAt \+ DIRECTION_IN_PROGRESS_CONTINUATION_WINDOW_MS/);
});

test("approval state still enforces original money and call ceilings", () => {
  assert.match(source, /remaining === null \|\| remaining <= 0/);
  assert.match(source, /channel\.errorPrefix.*BUDGET_EXHAUSTED/);
  assert.match(source, /Number\(approval\.call_count \|\| 0\) >= Number\(approval\.maximum_calls\)/);
  assert.match(source, /channel\.errorPrefix.*CALL_BUDGET_EXHAUSTED/);
  assert.match(source, /maximum - spent/);
});
