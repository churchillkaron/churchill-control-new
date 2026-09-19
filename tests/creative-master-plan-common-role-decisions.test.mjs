import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeMasterPlanRuntime.js",
  "utf8",
);

test("master plan promotes common contract role decisions before repair", () => {
  assert.match(source, /"scenes", "role_decisions"/);
  assert.match(source, /promotedSections\[section\] = commonPlan\[section\]/);
});
