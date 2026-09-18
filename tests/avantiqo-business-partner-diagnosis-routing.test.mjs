import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isBusinessDiagnosisQuestion, classifyBusinessDiagnosisQuestion, resolveBusinessDiagnosisPeriods, runBusinessPartnerBusinessDiagnosis } from "../lib/operator/runtime/BusinessPartnerBusinessDiagnosisRuntime.js";
import { businessDiagnosisAuditProjectionFingerprint } from "../lib/intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime.js";

test("business diagnosis classifier catches causal business questions",()=>{
 assert.equal(isBusinessDiagnosisQuestion("Why did our profit drop this month?"),true);
 assert.equal(isBusinessDiagnosisQuestion("Revenue is down, what changed?"),true);
 assert.equal(isBusinessDiagnosisQuestion("Show me the current invoices"),false);
});


test("business diagnosis classifier separates causal comparison recommendation and current reads",()=>{
 assert.deepEqual(classifyBusinessDiagnosisQuestion("Why did our profit drop this month?"),{match:true,class:"CAUSAL_DIAGNOSIS"});
 assert.deepEqual(classifyBusinessDiagnosisQuestion("Is revenue down compared with last month?"),{match:true,class:"PERIOD_COMPARISON"});
 assert.deepEqual(classifyBusinessDiagnosisQuestion("What should we do about lower revenue?"),{match:true,class:"EVIDENCE_FIRST_RECOMMENDATION"});
 assert.deepEqual(classifyBusinessDiagnosisQuestion("Revenue dropped this month"),{match:true,class:"CHANGE_DIAGNOSIS"});
 assert.deepEqual(classifyBusinessDiagnosisQuestion("Show me the current revenue"),{match:false,class:null});
 assert.deepEqual(classifyBusinessDiagnosisQuestion("What is our cash balance now?"),{match:false,class:null});
});


test("business diagnosis classifier supports multilingual customer questions without hijacking current reads",()=>{
 const cases=[
  ["Varför har våra intäkter sjunkit den här månaden?","CAUSAL_DIAGNOSIS"],
  ["Är omsättningen lägre jämfört med förra månaden?","PERIOD_COMPARISON"],
  ["Vad ska vi göra åt lägre intäkter?","EVIDENCE_FIRST_RECOMMENDATION"],
  ["Warum ist unser Umsatz gesunken?","CAUSAL_DIAGNOSIS"],
  ["Ist der Umsatz niedriger verglichen mit letztem Monat?","PERIOD_COMPARISON"],
  ["Was sollen wir wegen des niedrigeren Umsatzes tun?","EVIDENCE_FIRST_RECOMMENDATION"],
  ["Pourquoi le revenu a baissé ce mois-ci ?","CAUSAL_DIAGNOSIS"],
  ["Le revenu est-il plus bas par rapport au mois dernier ?","PERIOD_COMPARISON"],
  ["Que devons-nous faire face à la baisse du revenu ?","EVIDENCE_FIRST_RECOMMENDATION"],
  ["¿Por qué bajaron los ingresos este mes?","CAUSAL_DIAGNOSIS"],
  ["¿Los ingresos están más bajos comparado con el mes pasado?","PERIOD_COMPARISON"],
  ["¿Qué debemos hacer con los ingresos más bajos?","EVIDENCE_FIRST_RECOMMENDATION"],
  ["ทำไมรายได้ลดลงเดือนนี้","CAUSAL_DIAGNOSIS"],
  ["รายได้ต่ำลงเทียบกับเดือนที่แล้วหรือไม่","PERIOD_COMPARISON"],
  ["เราควรทำอย่างไรเมื่อรายได้ต่ำลง","EVIDENCE_FIRST_RECOMMENDATION"],
 ];
 for(const [question,expected] of cases) assert.deepEqual(classifyBusinessDiagnosisQuestion(question),{match:true,class:expected},question);
 for(const question of ["Visa nuvarande intäkter","Zeige mir den aktuellen Umsatz","Montre le revenu actuel","Muestra los ingresos actuales","แสดงรายได้ปัจจุบัน"]) assert.deepEqual(classifyBusinessDiagnosisQuestion(question),{match:false,class:null},question);
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
 assert.equal(out.baseline_end_date,"2026-08-31");
 assert.equal(out.current_end_date,"2026-09-30");
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
 },{loadPeriods,runDiagnosis:async(payload)=>{
  received=payload;
  const receipt={receipt_fingerprint:"abc123",diagnosis_class:"CAUSAL_DIAGNOSIS",business_timezone:"UTC",final_evidence_state:"INTERNAL_SUFFICIENT",residual_material:false,answer_boundary_status:"PASS",answer_unsupported_recommendation_outcome_detected:false,validated_external_context_ids:[],rejected_or_unresolved_external_contexts:[],baseline_period_id:"aug-entity",baseline_period_start_date:"2026-08-01",baseline_period_end_date:"2026-08-31",current_period_id:"sep-entity",current_period_start_date:"2026-09-01",current_period_end_date:"2026-09-30"};
  receipt.audit_projection_fingerprint=businessDiagnosisAuditProjectionFingerprint({receipt_fingerprint:receipt.receipt_fingerprint,diagnosis_class:receipt.diagnosis_class,business_timezone:receipt.business_timezone,final_evidence_state:receipt.final_evidence_state,residual_material:receipt.residual_material,answer_boundary_status:receipt.answer_boundary_status,answer_unsupported_recommendation_outcome_detected:receipt.answer_unsupported_recommendation_outcome_detected,validated_external_context_count:0,unresolved_external_context_count:0,baseline_period_id:receipt.baseline_period_id,baseline_period_start_date:receipt.baseline_period_start_date,baseline_period_end_date:receipt.baseline_period_end_date,current_period_id:receipt.current_period_id,current_period_start_date:receipt.current_period_start_date,current_period_end_date:receipt.current_period_end_date});
  return {result:{response:"Verified diagnosis."},business_diagnosis_receipt:receipt};
 }});
 assert.equal(received.organization_id,"org");
 assert.equal(received.party_id,"party");
 assert.equal(received.entity_id,"entity");
 assert.equal(received.period_id,"sep-entity");
 assert.deepEqual(received.context,{baseline_period_id:"aug-entity",current_period_id:"sep-entity",baseline_period_start_date:"2026-08-01",baseline_period_end_date:"2026-08-31",current_period_start_date:"2026-09-01",current_period_end_date:"2026-09-30",business_timezone:"UTC",business_diagnosis_class:"CAUSAL_DIAGNOSIS"});
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


test("period resolver honors explicit baseline and rejects reversed explicit pair",async()=>{
 const explicit=await resolveBusinessDiagnosisPeriods({organizationId:"org",entityId:"entity",baselinePeriodId:"jul-entity",currentPeriodId:"sep-entity",loadPeriods});
 assert.equal(explicit.status,"PERIOD_PAIR_READY");
 assert.equal(explicit.baseline_period_id,"jul-entity");
 assert.equal(explicit.current_period_id,"sep-entity");
 const reversed=await resolveBusinessDiagnosisPeriods({organizationId:"org",entityId:"entity",baselinePeriodId:"sep-entity",currentPeriodId:"aug-entity",loadPeriods});
 assert.equal(reversed.status,"BASELINE_PERIOD_INVALID_ORDER");
});


test("period resolver uses organization timezone at midnight boundary",async()=>{
 const rows=[
  {id:"oct",organization_id:"org",entity_id:"entity",start_date:"2026-10-01",end_date:"2026-10-31",status:"OPEN"},
  {id:"sep",organization_id:"org",entity_id:"entity",start_date:"2026-09-01",end_date:"2026-09-30",status:"CLOSED"},
  {id:"aug",organization_id:"org",entity_id:"entity",start_date:"2026-08-01",end_date:"2026-08-31",status:"CLOSED"},
 ];
 const instant=new Date("2026-09-30T18:30:00Z");
 const bangkok=await resolveBusinessDiagnosisPeriods({organizationId:"org",entityId:"entity",timezone:"Asia/Bangkok",now:instant,loadPeriods:async()=>rows});
 const utc=await resolveBusinessDiagnosisPeriods({organizationId:"org",entityId:"entity",timezone:"UTC",now:instant,loadPeriods:async()=>rows});
 assert.equal(bangkok.current_period_id,"oct");
 assert.equal(bangkok.baseline_period_id,"sep");
 assert.equal(utc.current_period_id,"sep");
 assert.equal(utc.baseline_period_id,"aug");
});


test("business partner verifies live diagnosis proof before returning it",()=>{
 const source=fs.readFileSync("lib/operator/runtime/BusinessPartnerBusinessDiagnosisRuntime.js","utf8");
 assert.match(source,/verifyBusinessDiagnosisAuditProjection/);
 assert.match(source,/businessDiagnosisProofIntegrityError\("BUSINESS_PARTNER_LIVE_RETURN"\)/);
 assert.match(source,/audit_projection_verification_status:liveProof\.status/);
 assert.match(source,/audit_projection_verified:true/);
});
