import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isBusinessDiagnosisQuestion, resolveBusinessDiagnosisPeriods, runBusinessPartnerBusinessDiagnosis } from "../lib/operator/runtime/BusinessPartnerBusinessDiagnosisRuntime.js";

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


test("diagnosis adapter forwards authenticated scope and governed context at runtime",async()=>{
 let received=null;
 const callerRequest={request_id:"req-1"};
 const actor={user_id:"user-1",email:"owner@example.com",role:"OWNER"};
 const permissions=["finance.read","analytics.read"];
 const result=await runBusinessPartnerBusinessDiagnosis({
  source:"text",message:"Why did our profit drop this month?",organizationId:"org",partyId:"party",entityId:"entity",periodId:"sep-entity",locale:"en",
  conversation:[{role:"user",content:"prior"}],longTermMemory:[{kind:"goal",value:"protect margin"}],actor,permissions,callerRequest,
  agreementState:{state:"ACTIVE"},projectState:{project_id:"p1"},
 },{loadPeriods,runDiagnosis:async(payload)=>{received=payload;return {result:{response:"Verified diagnosis."},business_diagnosis_receipt:{receipt_fingerprint:"abc123",final_evidence_state:"INTERNAL_SUFFICIENT",residual_material:false,answer_boundary_status:"PASS",answer_unsupported_recommendation_outcome_detected:false}};}});
 assert.equal(received.organization_id,"org");
 assert.equal(received.party_id,"party");
 assert.equal(received.entity_id,"entity");
 assert.equal(received.period_id,"sep-entity");
 assert.deepEqual(received.context,{baseline_period_id:"aug-entity",current_period_id:"sep-entity"});
 assert.deepEqual(received.actor,actor);
 assert.deepEqual(received.permissions,permissions);
 assert.equal(received.callerRequest,callerRequest);
 assert.deepEqual(received.messages,[{role:"user",content:"prior"}]);
 assert.deepEqual(received.memories,[{kind:"goal",value:"protect margin"}]);
 assert.equal(received.mode,"deep");
 assert.equal(result.decision.response_text,"Verified diagnosis.");
 assert.equal(result.business_diagnosis.receipt_fingerprint,"abc123");
 assert.equal(result.business_diagnosis.authority_effect,"NONE");
});

test("diagnosis adapter guards event and pending execution before any dependency call",async()=>{
 let calls=0;
 const dependencies={loadPeriods:async()=>{calls+=1;return periodRows;},runDiagnosis:async()=>{calls+=1;throw new Error("should not run");}};
 const event=await runBusinessPartnerBusinessDiagnosis({source:"event",message:"Why did revenue drop?",organizationId:"org"},dependencies);
 const pending=await runBusinessPartnerBusinessDiagnosis({source:"text",message:"Why did revenue drop?",organizationId:"org",agreementState:{pending_execution:{id:"pending"}}},dependencies);
 assert.equal(event,null);
 assert.equal(pending,null);
 assert.equal(calls,0);
});

test("diagnosis adapter falls back when no valid period pair exists without calling diagnosis",async()=>{
 let diagnosisCalls=0;
 const result=await runBusinessPartnerBusinessDiagnosis({source:"text",message:"Why did revenue drop?",organizationId:"org",entityId:"entity"},{loadPeriods:async()=>[{id:"only",organization_id:"org",entity_id:"entity",start_date:"2026-09-01",end_date:"2026-09-30",status:"OPEN"}],now:new Date("2026-09-18T00:00:00Z"),runDiagnosis:async()=>{diagnosisCalls+=1;return {};}});
 assert.equal(result,null);
 assert.equal(diagnosisCalls,0);
});
