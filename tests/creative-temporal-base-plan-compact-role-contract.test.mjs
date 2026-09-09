import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "utf8",
);

test("temporal base plan does not embed the 46k agency-role schema", () => {
  assert.match(source, /"role_decisions": \{\}/);
  assert.doesNotMatch(source, /"role_decisions": \$\{JSON\.stringify\(creativeAgencyDecisionSchema\(\)\)\}/);
  assert.match(source, /contract-repair pass/);
});
