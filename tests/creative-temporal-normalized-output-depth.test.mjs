import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "utf8",
);

test("temporal direction unwraps bounded nested execution envelopes", () => {
  assert.match(source, /const queue = \[result\]/);
  assert.match(source, /depth < 12/);
  assert.match(source, /\["output", "result", "data", "response"\]/);
  assert.match(source, /Array\.isArray\(current\.scenes\) \|\| Array\.isArray\(current\.shots\)/);
});
