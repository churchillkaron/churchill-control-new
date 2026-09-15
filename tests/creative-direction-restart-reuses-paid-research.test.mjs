import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const workflow = fs.readFileSync(
  "lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js",
  "utf8",
);
const research = fs.readFileSync(
  "lib/creative/research/runtime/ResearchRuntime.js",
  "utf8",
);

test("fresh direction restart reuses completed paid research without rebuying company research", () => {
  assert.match(workflow, /reuse_completed_research_on_direction_restart:\s*forceDirectionRestart === true/);
  assert.match(research, /reuseCompletedResearchOnDirectionRestart/);
  assert.match(research, /allow_missing_benchmark_lab/);
  assert.match(research, /policy\.require_benchmark_lab === true && allow_missing_benchmark_lab !== true/);
});
