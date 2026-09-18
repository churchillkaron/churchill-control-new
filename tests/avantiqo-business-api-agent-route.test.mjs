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
  const spread=source.indexOf("...objectValue(body.context)");
  const bound=source.indexOf("business_diagnosis_class: diagnosisClass");
  assert.ok(spread>=0&&bound>spread);
  assert.doesNotMatch(source,/business_diagnosis_class:\s*cleanValue\(body/);
});

test("diagnosis POST audit exposes signed diagnosis class from receipt",()=>{
  assert.match(source,/diagnosis_class: cleanValue\(receipt\.diagnosis_class\)/);
  assert.doesNotMatch(source,/diagnosis_class: cleanValue\(body/);
});
