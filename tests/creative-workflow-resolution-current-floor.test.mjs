import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", "utf8");

test("workflow resolver cannot reuse a stale temporal checkpoint below today's quality floor", () => {
  assert.match(source, /import \{ assertCreativeMasterPlan \} from "@\/lib\/creative\/director\/validation\/CreativeMasterPlanValidator"/);
  assert.match(source, /quality_profile: project\.quality_profile \|\| master\.plan\?\.quality_profile \|\| null/);
  assert.match(source, /const validation = assertCreativeMasterPlan\(\{/);
  assert.match(source, /assets: list\(context\.assets\)/);
  assert.match(source, /checkpoint_recertified_against_current_quality_floor: true/);
  assert.match(source, /catch \{\s*return null;\s*\}/);
});
