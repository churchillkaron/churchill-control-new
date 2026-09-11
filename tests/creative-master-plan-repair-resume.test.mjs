import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeMasterPlanRuntime.js", import.meta.url),
  "utf8",
);

test("master plan contract repair compacts evidence and can resume a paid result", () => {
  assert.match(source, /selected_assets: assets\.map\(masterPlanAssetEvidence\)/);
  assert.match(source, /mission: creativeMissionPromptSnapshot\(mission\)/);
  assert.match(source, /project: creativeProjectPromptSnapshot\(project\)/);
  assert.match(source, /async resumeFromResult\(\{/);
  assert.match(source, /repair_results = \[\]/);
  assert.match(source, /settled_result: settledRepairResults\[attempt\] \|\| null/);
  assert.match(source, /require_temporal_direction: false/);
  assert.match(source, /const modelPlan = normalizedPlan\(result\)/);
  assert.match(source, /resumed_from_result: true/);
  assert.ok(source.includes("if (suffix && !/^[}\\]]+$/.test(suffix)) return null;"));
  assert.match(source, /Return only the repair patch needed for the listed validation failures/);
});
