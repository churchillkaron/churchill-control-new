import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync("app/api/operator/turn/route.js","utf8");

test("operator turn persists compact business diagnosis audit in evidence",()=>{
  assert.match(route,/function persistedBusinessDiagnosisEvidence/);
  assert.match(route,/receipt_fingerprint/);
  assert.match(route,/audit_projection_fingerprint/);
  assert.match(route,/validated_external_context_count/);
  assert.match(route,/unresolved_external_context_count/);
  assert.match(route,/class: text\(diagnosis\.class\)/);
  assert.match(route,/baseline_start_date: text\(diagnosis\?\.periods\?\.baseline_start_date\)/);
  assert.match(route,/current_end_date: text\(diagnosis\?\.periods\?\.current_end_date\)/);
  assert.match(route,/raw_web_content_persisted: false/);
  assert.match(route,/raw_reasoning_persisted: false/);
  assert.match(route,/\.\.\.persistedBusinessDiagnosisEvidence\(result\)/);
});

test("business diagnosis audit persistence does not alter atomic assistant turn API",()=>{
  assert.match(route,/persistAssistantTurnAndConversationState\(\{/);
  assert.match(route,/evidence: \{/);
  assert.doesNotMatch(route,/persistBusinessDiagnosisReceipt|insertBusinessDiagnosisReceipt/);
});


test("conversation snapshot verifies persisted diagnosis audit projection before returning turns",()=>{
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  assert.match(runtime,/verifyBusinessDiagnosisAuditProjection/);
  assert.match(runtime,/audit_projection_verification_status:verification\.status/);
  assert.match(runtime,/audit_projection_verified:verification\.verified===true/);
  const bounded=runtime.indexOf("function boundedTurns");
  const verify=runtime.indexOf("verifyBusinessDiagnosisAuditProjection(diagnosis)");
  assert.ok(bounded>=0&&verify>bounded);
});
