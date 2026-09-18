import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync("app/api/operator/turn/route.js","utf8");

test("operator turn persists compact business diagnosis audit in evidence",()=>{
  assert.match(route,/function persistedBusinessDiagnosisEvidence/);
  assert.match(route,/receipt_fingerprint/);
  assert.match(route,/class: text\(diagnosis\.class\)/);
  assert.match(route,/raw_web_content_persisted: false/);
  assert.match(route,/raw_reasoning_persisted: false/);
  assert.match(route,/\.\.\.persistedBusinessDiagnosisEvidence\(result\)/);
});

test("business diagnosis audit persistence does not alter atomic assistant turn API",()=>{
  assert.match(route,/persistAssistantTurnAndConversationState\(\{/);
  assert.match(route,/evidence: \{/);
  assert.doesNotMatch(route,/persistBusinessDiagnosisReceipt|insertBusinessDiagnosisReceipt/);
});
