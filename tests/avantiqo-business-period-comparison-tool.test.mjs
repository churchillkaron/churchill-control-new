import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("paired comparison tool executes same capability across both periods",()=>{
  const s=fs.readFileSync("lib/intelligence/runtime/AvantiqoBusinessPeriodComparisonToolRuntime.js","utf8");
  assert.match(s,/baselineTool\.execute\(\{capability_key:key/);
  assert.match(s,/currentTool\.execute\(\{capability_key:key/);
  assert.match(s,/baseline_period_id:plan\.baseline_period_id/);
  assert.match(s,/current_period_id:plan\.current_period_id/);
});

test("paired comparison tool normalizes and maps only explicit drivers",()=>{
  const s=fs.readFileSync("lib/intelligence/runtime/AvantiqoBusinessPeriodComparisonToolRuntime.js","utf8");
  assert.match(s,/normalizeBusinessObservationPair/);
  assert.match(s,/mapBusinessObservationsToDriverRows/);
  assert.match(s,/allowed_driver_ids:pair\?\.supports_driver_ids/);
});

test("paired comparison tool binds evidence receipts without authority",()=>{
  const s=fs.readFileSync("lib/intelligence/runtime/AvantiqoBusinessPeriodComparisonToolRuntime.js","utf8");
  assert.match(s,/comparison_pair_fingerprint/);
  assert.match(s,/baseline_receipt/);
  assert.match(s,/current_receipt/);
  assert.match(s,/authority_effect:"NONE"/);
  assert.match(s,/read_only:true/);
});

test("business intelligence agent exposes paired comparison tool",()=>{
  const s=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(s,/createBusinessPeriodComparisonTools/);
  assert.match(s,/\.\.\.comparisonTools/);
  assert.match(s,/business_period_comparison_tool_contract/);
});
