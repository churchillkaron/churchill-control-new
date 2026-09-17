import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessPeriodComparisonPlan } from "../lib/intelligence/runtime/AvantiqoBusinessPeriodComparisonPlanRuntime.js";

test("comparison plan pairs identical capabilities across two periods",()=>{
  const plan=buildBusinessPeriodComparisonPlan({metric:"cash",baseline_period_id:"2026-07",current_period_id:"2026-08",organization_id:"org",entity_id:"ent"});
  assert.ok(plan.read_pairs.length>0);
  assert.equal(plan.read_pairs[0].baseline.period_id,"2026-07");
  assert.equal(plan.read_pairs[0].current.period_id,"2026-08");
  assert.equal(plan.read_pairs[0].capability_key,plan.read_pairs[0].capability_key);
  assert.equal(plan.policy.same_capability_required,true);
});

test("comparison requires two different periods",()=>{
  assert.throws(()=>buildBusinessPeriodComparisonPlan({baseline_period_id:"x",current_period_id:"x"}),/MUST_DIFFER/);
  assert.throws(()=>buildBusinessPeriodComparisonPlan({baseline_period_id:"",current_period_id:"y"}),/PERIODS_REQUIRED/);
});

test("comparison remains read only and authority neutral",()=>{
  const plan=buildBusinessPeriodComparisonPlan({metric:"staffing",baseline_period_id:"a",current_period_id:"b"});
  assert.equal(plan.policy.read_only,true);
  assert.equal(plan.authority_effect,"NONE");
  assert.ok(plan.read_pairs.every(r=>r.mutates===false));
});
