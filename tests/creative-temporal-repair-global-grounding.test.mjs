import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
test("temporal repair preserves researched grounding generically across all jobs", () => {
  assert.match(source, /exact named researched subject, location, machine\/product identity/);
  assert.doesNotMatch(source, /Norwegian\/North Sea setting, helicopter\/platform identity/);
  assert.match(source, /Do not invent procedures, operational documents, measurements or KPIs/);
});
