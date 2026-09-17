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

test("business intelligence agent pre-executes deterministic internal evidence batch",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/executeBusinessInternalEvidenceBatch/);
  assert.match(source,/business_internal_evidence_batch: internalEvidenceBatch/);
  assert.match(source,/business_internal_comparison_results/);
  assert.match(source,/business_internal_evidence_bundle/);
});

test("business intelligence agent injects completed deterministic diagnosis",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/executeBusinessDiagnosisOrchestration/);
  assert.match(source,/business_completed_diagnosis/);
  assert.match(source,/AVANTIQO_BUSINESS_DIAGNOSIS_ORCHESTRATOR_CONTRACT/);
});

test("business intelligence agent gates external research from completed diagnosis",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/buildBusinessExternalResearchPlan/);
  assert.match(source,/business_external_research_plan/);
  assert.match(source,/external_research_required: externalResearchPlan\?\.research_allowed === true/);
  assert.match(source,/AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT/);
});
