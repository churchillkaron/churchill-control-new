import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("app/api/platform/intelligence/business/route.js","utf8");

test("business intelligence API preserves legacy GET and exposes governed diagnosis POST",()=>{
  assert.match(source,/export async function GET\(request\)/);
  assert.match(source,/BusinessIntelligenceRuntime\.analyzeOrganization/);
  assert.match(source,/export async function POST\(request\)/);
  assert.match(source,/BusinessIntelligenceAgentRuntime\.run/);
});

test("diagnosis POST binds organization identity actor and permissions server side",()=>{
  assert.match(source,/requireOrganizationAccess\(\{ organizationId, request \}\)/);
  assert.match(source,/organization_id: access\.organizationId/);
  assert.match(source,/user_id: access\.userId/);
  assert.match(source,/permissions: listValue\(access\.permissions\)/);
  assert.match(source,/callerRequest: request/);
  assert.doesNotMatch(source,/actor:\s*objectValue\(body\.actor\)/);
  assert.doesNotMatch(source,/permissions:\s*listValue\(body\.permissions\)/);
});

test("diagnosis POST returns compact privacy-safe audit receipt envelope",()=>{
  assert.match(source,/receipt_fingerprint/);
  assert.match(source,/final_evidence_state/);
  assert.match(source,/answer_boundary_status/);
  assert.match(source,/raw_web_content_exposed: false/);
  assert.match(source,/raw_reasoning_exposed: false/);
  assert.match(source,/authority_effect: "NONE"/);
  assert.doesNotMatch(source,/audit: result\.business_diagnosis_receipt/);
});


test("diagnosis POST server-classifies request type and overrides client class",()=>{
  assert.match(source,/classifyBusinessDiagnosisQuestion\(question\)/);
  assert.match(source,/DIRECT_GOVERNED_DIAGNOSIS/);
  assert.match(source,/business_diagnosis_class: diagnosisClass/);
  const spread=source.indexOf("...requestContext");
  const bound=source.indexOf("business_diagnosis_class: diagnosisClass");
  assert.ok(spread>=0&&bound>spread);
  assert.doesNotMatch(source,/business_diagnosis_class:\s*cleanValue\(body/);
});

test("diagnosis POST audit exposes signed diagnosis class from receipt",()=>{
  assert.match(source,/diagnosis_class: cleanValue\(receipt\.diagnosis_class\)/);
  assert.doesNotMatch(source,/diagnosis_class: cleanValue\(body/);
});


test("diagnosis POST resolves periods through shared governed resolver",()=>{
  assert.match(source,/function resolveDirectDiagnosisPeriods/);
  assert.match(source,/resolveBusinessDiagnosisPeriods/);
  assert.match(source,/from\("accounting_periods"\)/);
  assert.match(source,/\.eq\("organization_id", organizationId\)/);
  assert.match(source,/baseline_period_start_date/);
  assert.match(source,/baseline_period_end_date/);
  assert.match(source,/current_period_start_date/);
  assert.match(source,/current_period_end_date/);
  assert.match(source,/baseline_period_id: resolvedPeriods\.periods\.baseline_period_id/);
  assert.match(source,/current_period_id: resolvedPeriods\.periods\.current_period_id/);
});

test("diagnosis POST rejects unresolved governed period pairs",()=>{
  assert.match(source,/business diagnosis period resolution failed/);
  assert.match(source,/if \(!resolvedPeriods\.success\) return errorResponse\(resolvedPeriods\.error, 400\)/);
  assert.doesNotMatch(source,/baseline_period_start_date:\s*cleanValue\(body/);
  assert.doesNotMatch(source,/current_period_end_date:\s*cleanValue\(body/);
});


test("diagnosis POST auto-resolves missing comparison periods instead of trusting caller defaults",()=>{
  assert.match(source,/baselinePeriodId,/);
  assert.match(source,/currentPeriodId,/);
  assert.match(source,/loadPeriods: directDiagnosisPeriodRows/);
  assert.match(source,/period_id: context\.current_period_id/);
});
