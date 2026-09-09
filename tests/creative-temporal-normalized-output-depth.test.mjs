import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "utf8",
);

test("temporal direction unwraps nested execution envelopes by branch depth", () => {
  assert.match(source, /const queue = \[\{ value: result, depth: 0 \}\]/);
  assert.match(source, /branchDepth > 12/);
  assert.match(source, /queue\.push\(\{ value: nested, depth: branchDepth \+ 1 \}\)/);
  assert.doesNotMatch(source, /while \(queue\.length && depth < 12\)/);
});
