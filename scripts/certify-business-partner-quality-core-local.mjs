import assert from "node:assert/strict";
import fs from "node:fs";
import { latestCompletedAgreementBusinessAction, registeredRevisionIntent } from "../lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js";
import { materializeRegisteredRevisionDeterministically } from "../lib/operator/runtime/OperatorRegisteredRevisionMaterializer.mjs";

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
const failed=checks.filter(x=>!x.passed);
const dimensions={};
for (const row of checks) { dimensions[row.dimension] ||= {checks:0,passed:true}; dimensions[row.dimension].checks++; dimensions[row.dimension].passed &&= row.passed; }
const report={contract:CONTRACT,certified:failed.length===0,status:failed.length?"QUALITY_CORE_BLOCKED":"QUALITY_CORE_CERTIFIED",cases:checks.length,passed:checks.length-failed.length,failed:failed.length,dimensions,failures:failed,external_reference_calls_performed:false,provider_spend_performed:false,production_writes_performed:false,production_deploy_performed:false,authorization_effect:"NONE"};
console.log(JSON.stringify(report,null,2));
if (failed.length) process.exitCode=1;
