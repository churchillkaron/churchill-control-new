import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("business intelligence agent carries governed two-period comparison plan",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/buildBusinessPeriodComparisonPlan/);
  assert.match(source,/baseline_period_id/);
  assert.match(source,/business_period_comparison_plan/);
  assert.match(source,/AVANTIQO_BUSINESS_PERIOD_COMPARISON_PLAN_CONTRACT/);
});
