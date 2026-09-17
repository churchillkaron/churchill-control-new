import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isBusinessDiagnosisQuestion } from "../lib/operator/runtime/BusinessPartnerBusinessDiagnosisRuntime.js";

test("business diagnosis classifier catches causal business questions",()=>{
 assert.equal(isBusinessDiagnosisQuestion("Why did our profit drop this month?"),true);
 assert.equal(isBusinessDiagnosisQuestion("Revenue is down, what changed?"),true);
 assert.equal(isBusinessDiagnosisQuestion("Show me the current invoices"),false);
});

test("synthetic business partner routes diagnosis before fast conversation",()=>{
 const source=fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js","utf8");
 const diagnosis=source.indexOf("runBusinessPartnerBusinessDiagnosis(effectiveOptions)");
 const fast=source.indexOf("isFastConversationTurn(effectiveOptions)");
 assert.ok(diagnosis>0);assert.ok(fast>diagnosis);
});

test("diagnosis adapter binds governed agent and returns receipt fingerprint",()=>{
 const source=fs.readFileSync("lib/operator/runtime/BusinessPartnerBusinessDiagnosisRuntime.js","utf8");
 assert.match(source,/BusinessIntelligenceAgentRuntime\.run/);
 assert.match(source,/receipt_fingerprint/);
 assert.match(source,/authority_effect:"NONE"/);
 assert.match(source,/accounting_periods/);
 assert.match(source,/business_diagnosis_routed:true/);
 assert.match(source,/pending_execution/);
 assert.match(source,/toLowerCase\(\)==="event"/);
});
