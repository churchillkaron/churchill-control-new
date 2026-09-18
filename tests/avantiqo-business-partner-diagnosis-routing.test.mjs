import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isBusinessDiagnosisQuestion, resolveBusinessDiagnosisPeriods } from "../lib/operator/runtime/BusinessPartnerBusinessDiagnosisRuntime.js";

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


const periodRows=[
 {id:"future-org",organization_id:"org",entity_id:null,start_date:"2026-10-01",end_date:"2026-10-31",status:"OPEN"},
 {id:"sep-org",organization_id:"org",entity_id:null,start_date:"2026-09-01",end_date:"2026-09-30",status:"OPEN"},
 {id:"sep-entity",organization_id:"org",entity_id:"entity",start_date:"2026-09-01",end_date:"2026-09-30",status:"OPEN"},
 {id:"aug-org",organization_id:"org",entity_id:null,start_date:"2026-08-01",end_date:"2026-08-31",status:"CLOSED"},
 {id:"aug-entity",organization_id:"org",entity_id:"entity",start_date:"2026-08-01",end_date:"2026-08-31",status:"CLOSED"},
 {id:"jul-entity",organization_id:"org",entity_id:"entity",start_date:"2026-07-01",end_date:"2026-07-31",status:"LOCKED"},
];
const loadPeriods=async()=>periodRows;

test("period resolver excludes future automatic current and prefers exact entity scope",async()=>{
 const out=await resolveBusinessDiagnosisPeriods({organizationId:"org",entityId:"entity",now:new Date("2026-09-18T00:00:00Z"),loadPeriods});
 assert.equal(out.status,"PERIOD_PAIR_READY");
 assert.equal(out.current_period_id,"sep-entity");
 assert.equal(out.baseline_period_id,"aug-entity");
 assert.equal(out.baseline_status,"CLOSED");
});

test("period resolver honors explicitly selected scoped period",async()=>{
 const out=await resolveBusinessDiagnosisPeriods({organizationId:"org",entityId:"entity",currentPeriodId:"aug-entity",now:new Date("2026-09-18T00:00:00Z"),loadPeriods});
 assert.equal(out.current_period_id,"aug-entity");
 assert.equal(out.baseline_period_id,"jul-entity");
});

test("period resolver falls back to organization period only when exact entity period is absent",async()=>{
 const rows=periodRows.filter((row)=>row.id!=="aug-entity");
 const out=await resolveBusinessDiagnosisPeriods({organizationId:"org",entityId:"entity",currentPeriodId:"sep-entity",loadPeriods:async()=>rows});
 assert.equal(out.baseline_period_id,"aug-org");
});

test("period resolver fails closed for unknown selected period and missing baseline",async()=>{
 const unknown=await resolveBusinessDiagnosisPeriods({organizationId:"org",entityId:"entity",currentPeriodId:"missing",loadPeriods});
 assert.equal(unknown.status,"CURRENT_PERIOD_NOT_FOUND");
 const noBaseline=await resolveBusinessDiagnosisPeriods({organizationId:"org",entityId:"entity",currentPeriodId:"jul-entity",loadPeriods});
 assert.equal(noBaseline.status,"BASELINE_PERIOD_NOT_FOUND");
});
