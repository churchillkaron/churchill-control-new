import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const cost = fs.readFileSync("lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js", "utf8");
const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");

test("direction preflight prices the actual bounded request instead of the generic pricing maximum", () => {
  assert.match(cost, /estimatedDirectionUsage\(input\)/);
  assert.match(cost, /DIRECTION_INPUT_TOKEN_RESERVATION_HEADROOM = 1\.15/);
  assert.match(cost, /Math\.ceil\(heuristicInputTokens \* DIRECTION_INPUT_TOKEN_RESERVATION_HEADROOM\)/);
  assert.match(cost, /boundedDirectionUsage/);
  assert.match(cost, /pricing = bounded\.pricing/);
  assert.match(cost, /estimated_input_tokens: estimatedUsage\.input_tokens/);
  assert.match(cost, /estimated_output_tokens: estimatedUsage\.output_tokens/);
});

test("targeted temporal repairs use a measured bounded output ceiling", () => {
  assert.match(temporal, /operation: "TEMPORAL_MASTER_PLAN_CONTRACT_REPAIR_V1"[\s\S]*maxOutputTokens: 12000/);
});
