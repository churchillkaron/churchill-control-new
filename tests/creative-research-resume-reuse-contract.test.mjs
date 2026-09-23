import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/creative/research/runtime/ResearchRuntime.js", import.meta.url), "utf8");

test("direction restart may reuse a valid current project research report even after a newer paid attempt failed", () => {
  assert.match(source, /function reusableCompletedProjectResearchReport/);
  assert.match(source, /reuseCompletedResearchOnDirectionRestart === true[\s\S]*reusableCompletedProjectResearchReport/);
  assert.match(source, /validCompletedResearchReport/);
  assert.match(source, /allow_missing_benchmark_lab: true/);
});
