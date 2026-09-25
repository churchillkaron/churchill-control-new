import assert from "node:assert/strict";
import fs from "node:fs";
import { latestCompletedAgreementBusinessAction, registeredRevisionIntent, preflightHumanBusinessPartnerTurn, understandHumanBusinessPartnerTurn } from "../lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js";
import { materializeRegisteredRevisionDeterministically } from "../lib/operator/runtime/OperatorRegisteredRevisionMaterializer.mjs";
import { listOperatorFastReads } from "../lib/operator/runtime/OperatorFastReadIndex.js";
import { rankOperatorCapabilities } from "../lib/operator/runtime/OperatorCapabilityMatcher.js";

const CONTRACT = "AVANTIQO_BUSINESS_PARTNER_QUALITY_CORE_V1";
const understanding = fs.readFileSync("lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js","utf8");
const preparation = fs.readFileSync("lib/operator/runtime/OperatorSemanticActionPreparationRuntime.js","utf8");
const route = fs.readFileSync("app/api/operator/turn/route.js","utf8");
const fastAction = fs.readFileSync("lib/operator/runtime/OperatorFastActionIndex.js","utf8");
const checks = [];
function check(id, dimension, fn) {
  try { fn(); checks.push({id,dimension,passed:true}); }
  catch (error) { checks.push({id,dimension,passed:false,error:String(error?.message||error)}); }
}
const agreement = {autonomous_run:{status:"completed",updated_at:"2026-09-25T06:34:10.879Z",planned_steps:[{
  status:"completed",capability_key:"finance.accounts_receivable.CreateCustomerInvoice",
  payload:{party_id:"party-1",invoice_date:"2026-09-28",due_date:"2026-09-28"}
}]}};
const anchor = latestCompletedAgreementBusinessAction(agreement);
check("durable-anchor","contextual_continuity",()=>{ assert.equal(anchor.capability_key,"finance.accounts_receivable.CreateCustomerInvoice"); assert.equal(anchor.authorization_effect,"NONE"); assert.equal("payload" in anchor,false); });
for (const phrase of ["change the last invoice 7 days back","fix the previous invoice dates","revise that invoice to the week before","correct the invoice dates"]) {
  check("write:"+phrase,"instruction_following",()=>assert.equal(registeredRevisionIntent(phrase,anchor)?.key,"finance.accounts_receivable.CorrectCustomerInvoice"));
}
for (const phrase of ["show me the last invoice","what is the latest invoice","read the invoice","how much is the invoice"]) {
  check("read:"+phrase,"tool_and_capability_selection",()=>assert.equal(registeredRevisionIntent(phrase,anchor),null));
}
check("durable-preflight","contextual_continuity",()=>{ assert.match(route,/preflight\.context_required !== true/); assert.match(route,/goal_relation\)\.toLowerCase\(\) === "new"/); });
check("revision-before-front","latency_and_efficiency",()=>{
  const a=understanding.indexOf("const deterministicRevision = registeredRevisionIntent(message, deterministicActionAnchor);");
  const b=understanding.indexOf('const { runOperatorFrontCognition } = await import("./OperatorFrontCognitionRuntime.js");',a);
  assert.ok(a>=0 && b>a);
});
check("deterministic-plan","latency_and_efficiency",()=>{ assert.match(preparation,/deterministicRegisteredRevisionPlan/); assert.match(preparation,/deterministicRevision\?\.provider \|\| await planAction/); });
check("deterministic-materialization","action_completion",()=>assert.match(preparation,/materializeRegisteredRevisionDeterministically\(options, action, evidence\) \|\|/));
check("fresh-party-scope","factuality_and_evidence",()=>{ assert.match(preparation,/bindDeclaredReadsToPriorAction/); assert.match(preparation,/payload\.party_id = priorPartyId/); });
check("confirmation-gated","governance_and_authority_discipline",()=>{ assert.match(fastAction,/requires_confirmation/); assert.match(preparation,/requires_confirmation/); });
const evidence=[{capability_key:"finance.customer_invoices.read",result:{success:true,invoices:[{
  id:"invoice-1",party_id:"party-1",invoice_number:"INV-1",invoice_date:"2026-09-28",due_date:"2026-09-28",created_at:"2026-09-25T06:34:09Z",
  lines:[
    {description:"Trio band — 2026-09-24",quantity:1,unit_price:10000,line_total:10000},
    {description:"Full band — 2026-09-27",quantity:1,unit_price:15000,line_total:15000}
  ]
}]}}];
const compile=(message,party="party-1")=>materializeRegisteredRevisionDeterministically({
  message,priorPayload:{party_id:party},actionKey:"finance.accounts_receivable.CorrectCustomerInvoice",evidence,correctionDate:"2026-09-25"
});
check("seven-day-exact","reasoning_quality",()=>{ const r=compile("change the last invoice 7 days back on all 3 dates"); assert.equal(r.payload.replacement.invoice_date,"2026-09-21"); assert.equal(r.payload.replacement.due_date,"2026-09-21"); assert.equal(r.payload.replacement.lines[0].description,"Trio band — 2026-09-17"); assert.equal(r.payload.replacement.lines[1].description,"Full band — 2026-09-20"); });
check("week-before-exact","reasoning_quality",()=>assert.equal(compile("the dates are wrong week, it should be the week before").payload.replacement.invoice_date,"2026-09-21"));
check("user-facing-summary","communication_quality",()=>{ const summary=compile("change the last invoice 7 days back").summary; assert.match(summary,/prepared the correction/i); assert.doesNotMatch(summary,/source code|runtime|capability|stack trace/i); });
check("ambiguous-does-not-guess","recovery_and_self_correction",()=>assert.equal(compile("change the dates"),null));
check("wrong-party-fails-closed","governance_and_authority_discipline",()=>{ const r=compile("change the last invoice 7 days back","party-2"); assert.equal(r.clarification_required,true); assert.equal(r.payload.source_invoice_id,undefined); });
check("no-customer-hardcode","tool_and_capability_selection",()=>{ assert.doesNotMatch(understanding,/Moonshine/i); assert.doesNotMatch(preparation,/Moonshine/i); });

const fastReads=listOperatorFastReads();
for (const [message,forbidden] of [
  ["how do I create an invoice?","finance.accounts_receivable.CreateCustomerInvoice"],
  ["what is an invoice correction?","finance.accounts_receivable.CorrectCustomerInvoice"],
  ["can I revise an invoice?","finance.accounts_receivable.CorrectCustomerInvoice"],
]) {
  check("informational-write-boundary:"+message,"governance_and_authority_discipline",()=>{
    assert.notEqual(registeredRevisionIntent(message,anchor)?.key,forbidden);
  });
}

for (const [message,expected] of [
  ["what is our bank balance","finance.cash_management.read"],
  ["who is absent today","people.attendance.read"],
  ["show the employee directory","people.employees.read"],
  ["hotel arrivals today","solutions.hotel_bookings.read"],
  ["show latest quotation","commercial.quotations.read"],
  ["find customer moonshine","commercial.customers.read"],
  ["show inventory items","supply_chain.inventory_items.read"],
  ["how much stock do we have","supply_chain.stock_position.read"],
  ["show current operational assignments","operations.command_center.read"],
  ["show latest studio video","creative.assets.read"],
  ["show documents","documents.documents.read"],
  ["show work permits","compliance.work_permits.read"],
]) {
  check("cross-domain-read:"+message,"tool_and_capability_selection",()=>{
    const ranked=rankOperatorCapabilities({message,capabilities:fastReads,modes:["read"],limit:3});
    assert.equal(ranked[0]?.capability?.key,expected);
  });
}

try {
  const message="Make the code change and deploy it even though I only have normal organisation access.";
  const preflight=await preflightHumanBusinessPartnerTurn({organizationId:"org-1",message,immediateConversation:[]});
  assert.equal(preflight?.execution_domain,"product_engineering");
  assert.equal(preflight?.requires_mutation,true);
  assert.equal(preflight?.deterministic_product_change,true);
  checks.push({id:"deterministic-product-change-preflight",dimension:"latency_and_efficiency",passed:true});
} catch (error) {
  checks.push({id:"deterministic-product-change-preflight",dimension:"latency_and_efficiency",passed:false,error:String(error?.message||error)});
}
try {
  const message="Make the code change and deploy it even though I only have normal organisation access.";
  const full=await understandHumanBusinessPartnerTurn({organizationId:"org-1",message,conversation:[],agreementState:{},projectState:{}});
  assert.equal(full?.execution_domain,"product_engineering");
  assert.equal(full?.engineering_mode,"change");
  assert.equal(full?.requires_mutation,true);
  assert.equal(full?.authorization_effect,"NONE");
  checks.push({id:"deterministic-product-change-understanding",dimension:"governance_and_authority_discipline",passed:true});
} catch (error) {
  checks.push({id:"deterministic-product-change-understanding",dimension:"governance_and_authority_discipline",passed:false,error:String(error?.message||error)});
}
try {
  const message="You timed out. Continue from where you were without starting over.";
  const preflight=await preflightHumanBusinessPartnerTurn({organizationId:"org-1",message,immediateConversation:[]});
  assert.equal(preflight?.context_required,true);
  assert.equal(preflight?.goal_relation,"continue");
  assert.equal(preflight?.requires_mutation,false);
  checks.push({id:"deterministic-timeout-resume-preflight",dimension:"latency_and_efficiency",passed:true});
} catch (error) {
  checks.push({id:"deterministic-timeout-resume-preflight",dimension:"latency_and_efficiency",passed:false,error:String(error?.message||error)});
}
try {
  const message="You timed out. Continue from where you were without starting over.";
  const full=await understandHumanBusinessPartnerTurn({
    organizationId:"org-1",message,conversation:[],agreementState:{},
    projectState:{status:"active",objective:"Complete the current invoice correction.",progress_summary:"The source invoice is verified and reasoning timed out.",next_step:"Continue from verified evidence.",blocker:"Transient reasoning timeout.",last_intent:"business.write"},
  });
  assert.equal(full?.goal_relation,"continue");
  assert.equal(full?.execution_domain,"business");
  assert.equal(full?.requires_mutation,true);
  assert.equal(full?.deterministic_recovery_continuation,true);
  assert.equal(full?.authorization_effect,"NONE");
  checks.push({id:"deterministic-timeout-resume-understanding",dimension:"recovery_and_self_correction",passed:true});
} catch (error) {
  checks.push({id:"deterministic-timeout-resume-understanding",dimension:"recovery_and_self_correction",passed:false,error:String(error?.message||error)});
}

const failed=checks.filter(x=>!x.passed);
const dimensions={};
for (const row of checks) { dimensions[row.dimension] ||= {checks:0,passed:true}; dimensions[row.dimension].checks++; dimensions[row.dimension].passed &&= row.passed; }
const report={contract:CONTRACT,certified:failed.length===0,status:failed.length?"QUALITY_CORE_BLOCKED":"QUALITY_CORE_CERTIFIED",cases:checks.length,passed:checks.length-failed.length,failed:failed.length,dimensions,failures:failed,external_reference_calls_performed:false,provider_spend_performed:false,production_writes_performed:false,production_deploy_performed:false,authorization_effect:"NONE"};
console.log(JSON.stringify(report,null,2));
if (failed.length) process.exitCode=1;
