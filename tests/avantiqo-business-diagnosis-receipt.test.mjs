import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessDiagnosisReceipt as build, buildBusinessDiagnosisAuditProjectionFromReceipt, verifyBusinessDiagnosisAuditProjection } from "../lib/intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime.js";

const input={organization_id:"org",entity_id:"entity",metric:"profit",diagnosis_class:"CAUSAL_DIAGNOSIS",business_timezone:"Asia/Bangkok",baseline_period_id:"2026-07",baseline_period_start_date:"2026-07-01",baseline_period_end_date:"2026-07-31",current_period_id:"2026-08",current_period_start_date:"2026-08-01",current_period_end_date:"2026-08-31",final_diagnosis:{metric:"profit",diagnosis:{final_evidence_state:"INTERNAL_AND_SUPPORTED_EXTERNAL",target_metric:{status:"TARGET_METRIC_READY"},residual_material:true,residual_ratio:.25,variance:{unexplained_residual:-5},internal_coverage_incomplete:false,causal:{supported_context_ids:["weather"]}}},external_research_plan:{status:"RESEARCH_ALLOWED"},external_evidence_assessment:{status:"ASSESSED"},external_diagnosis_closure:{validated_context_ids:["weather"],causal_evidence:[{context_id:"weather",source_refs:[{url:"https://example.gov/weather",publisher:"gov",independence_group:"example.gov",observed_at:"2026-08-31"}]}],validation_results:[{context_id:"weather",status:"CAUSAL_EVIDENCE_READY"},{context_id:"tourism",status:"EVIDENCE_INCOMPLETE",reason:"MISSING_REQUIRED_SUPPORT",missing_requirements:["CONFOUNDER_CHECK"]}]},answer_brief:{status:"INTERNAL_AND_SUPPORTED_EXTERNAL",unresolved:[{kind:"MATERIAL_UNEXPLAINED_RESIDUAL"}]},answer_boundary:{status:"APPENDED_REQUIRED_UNCERTAINTY",required_uncertainty_appended:true,overclaim_detected:false}};

test("receipt fingerprints exact structural diagnosis proof",()=>{const a=build(input),b=build(input);assert.equal(a.receipt_fingerprint,b.receipt_fingerprint);assert.equal(a.receipt_fingerprint.length,64);assert.deepEqual(a.supported_external_context_ids,["weather"]);assert.equal(a.answer_boundary_status,"APPENDED_REQUIRED_UNCERTAINTY");});
test("receipt excludes raw evidence content and reasoning",()=>{const out=build(input);const serialized=JSON.stringify(out);assert.equal(out.raw_web_content_persisted,false);assert.equal(out.raw_reasoning_persisted,false);assert.doesNotMatch(serialized,/excerpt|chain.of.thought/i);});
test("receipt records rejected external evidence without promoting it",()=>{const out=build(input);assert.equal(out.rejected_or_unresolved_external_contexts[0].context_id,"tourism");assert.equal(out.rejected_or_unresolved_external_contexts[0].status,"EVIDENCE_INCOMPLETE");assert.equal(out.authority_effect,"NONE");});


test("receipt fingerprint is stable across semantic set ordering",()=>{
  const first=build(input);
  const reordered=structuredClone(input);
  reordered.final_diagnosis.diagnosis.causal.supported_context_ids=["weather","weather"];
  reordered.external_diagnosis_closure.validated_context_ids=["weather"];
  reordered.external_diagnosis_closure.validation_results=[...reordered.external_diagnosis_closure.validation_results].reverse();
  reordered.external_diagnosis_closure.validation_results[0].missing_requirements=["CONFOUNDER_CHECK","CONFOUNDER_CHECK"];
  reordered.external_diagnosis_closure.causal_evidence=[...reordered.external_diagnosis_closure.causal_evidence].reverse();
  assert.equal(build(reordered).receipt_fingerprint,first.receipt_fingerprint);
});

test("receipt fingerprint canonicalizes nested object key ordering",()=>{
  const first=build(input);
  const reordered=structuredClone(input);
  reordered.answer_boundary={overclaim_detected:false,required_uncertainty_appended:true,status:"APPENDED_REQUIRED_UNCERTAINTY"};
  reordered.final_diagnosis={diagnosis:{causal:{supported_context_ids:["weather"]},internal_coverage_incomplete:false,variance:{unexplained_residual:-5},residual_ratio:.25,residual_material:true,target_metric:{status:"TARGET_METRIC_READY"},final_evidence_state:"INTERNAL_AND_SUPPORTED_EXTERNAL"},metric:"profit"};
  assert.equal(build(reordered).receipt_fingerprint,first.receipt_fingerprint);
});


test("receipt records recommendation outcome enforcement",()=>{
 const guarded=structuredClone(input);
 guarded.answer_boundary={status:"REPLACED_UNSUPPORTED_RECOMMENDATION_OUTCOME",unsupported_recommendation_outcome_detected:true,required_uncertainty_appended:false,overclaim_detected:false};
 const out=build(guarded);
 assert.equal(out.answer_unsupported_recommendation_outcome_detected,true);
 assert.equal(out.answer_boundary_status,"REPLACED_UNSUPPORTED_RECOMMENDATION_OUTCOME");
});


test("receipt cryptographically binds diagnosis routing class",()=>{const a=build(input),b=build({...input,diagnosis_class:"PERIOD_COMPARISON"});assert.equal(a.diagnosis_class,"CAUSAL_DIAGNOSIS");assert.notEqual(a.receipt_fingerprint,b.receipt_fingerprint);});


test("receipt cryptographically binds period display dates",()=>{const a=build(input),b=build({...input,current_period_end_date:"2026-08-30"});assert.equal(a.current_period_start_date,"2026-08-01");assert.equal(a.current_period_end_date,"2026-08-31");assert.notEqual(a.receipt_fingerprint,b.receipt_fingerprint);});


test("persisted audit projection verifies and detects changed safe fields",()=>{
 const receipt=build(input);
 const evidence={
  class:receipt.diagnosis_class,business_timezone:receipt.business_timezone,receipt_fingerprint:receipt.receipt_fingerprint,audit_projection_fingerprint:receipt.audit_projection_fingerprint,
  final_evidence_state:receipt.final_evidence_state,residual_material:receipt.residual_material,answer_boundary_status:receipt.answer_boundary_status,
  answer_unsupported_recommendation_outcome_detected:receipt.answer_unsupported_recommendation_outcome_detected,
  validated_external_context_count:receipt.validated_external_context_ids.length,unresolved_external_context_count:receipt.rejected_or_unresolved_external_contexts.length,
  periods:{baseline_period_id:receipt.baseline_period_id,baseline_start_date:receipt.baseline_period_start_date,baseline_end_date:receipt.baseline_period_end_date,current_period_id:receipt.current_period_id,current_start_date:receipt.current_period_start_date,current_end_date:receipt.current_period_end_date},
 };
 const verified=verifyBusinessDiagnosisAuditProjection(evidence);
 assert.equal(verified.status,"VERIFIED");
 assert.equal(verified.verified,true);
 const changed=verifyBusinessDiagnosisAuditProjection({...evidence,class:"PERIOD_COMPARISON"});
 assert.equal(changed.status,"MISMATCH");
 assert.equal(changed.verified,false);
});


test("audit projection binds external evidence summary counts",()=>{
 const receipt=build(input);
 const evidence={class:receipt.diagnosis_class,business_timezone:receipt.business_timezone,receipt_fingerprint:receipt.receipt_fingerprint,audit_projection_fingerprint:receipt.audit_projection_fingerprint,final_evidence_state:receipt.final_evidence_state,residual_material:receipt.residual_material,answer_boundary_status:receipt.answer_boundary_status,answer_unsupported_recommendation_outcome_detected:receipt.answer_unsupported_recommendation_outcome_detected,validated_external_context_count:receipt.validated_external_context_ids.length,unresolved_external_context_count:receipt.rejected_or_unresolved_external_contexts.length,periods:{baseline_period_id:receipt.baseline_period_id,baseline_start_date:receipt.baseline_period_start_date,baseline_end_date:receipt.baseline_period_end_date,current_period_id:receipt.current_period_id,current_start_date:receipt.current_period_start_date,current_end_date:receipt.current_period_end_date}};
 assert.equal(verifyBusinessDiagnosisAuditProjection(evidence).status,"VERIFIED");
 assert.equal(verifyBusinessDiagnosisAuditProjection({...evidence,unresolved_external_context_count:99}).status,"MISMATCH");
});


test("receipt and persisted audit cryptographically bind business timezone",()=>{
 const bangkok=build(input);
 const utc=build({...input,business_timezone:"UTC"});
 assert.equal(bangkok.business_timezone,"Asia/Bangkok");
 assert.notEqual(bangkok.receipt_fingerprint,utc.receipt_fingerprint);
 const evidence={class:bangkok.diagnosis_class,business_timezone:bangkok.business_timezone,receipt_fingerprint:bangkok.receipt_fingerprint,audit_projection_fingerprint:bangkok.audit_projection_fingerprint,final_evidence_state:bangkok.final_evidence_state,residual_material:bangkok.residual_material,answer_boundary_status:bangkok.answer_boundary_status,answer_unsupported_recommendation_outcome_detected:bangkok.answer_unsupported_recommendation_outcome_detected,validated_external_context_count:bangkok.validated_external_context_ids.length,unresolved_external_context_count:bangkok.rejected_or_unresolved_external_contexts.length,periods:{baseline_period_id:bangkok.baseline_period_id,baseline_start_date:bangkok.baseline_period_start_date,baseline_end_date:bangkok.baseline_period_end_date,current_period_id:bangkok.current_period_id,current_start_date:bangkok.current_period_start_date,current_end_date:bangkok.current_period_end_date}};
 assert.equal(verifyBusinessDiagnosisAuditProjection(evidence).status,"VERIFIED");
 assert.equal(verifyBusinessDiagnosisAuditProjection({...evidence,business_timezone:"UTC"}).status,"MISMATCH");
});


test("canonical audit projection from receipt matches persisted proof semantics",()=>{
 const receipt=build(input);
 const projection=buildBusinessDiagnosisAuditProjectionFromReceipt(receipt);
 assert.equal(projection.receipt_fingerprint,receipt.receipt_fingerprint);
 assert.equal(projection.diagnosis_class,receipt.diagnosis_class);
 assert.equal(projection.business_timezone,receipt.business_timezone);
 assert.equal(projection.validated_external_context_count,1);
 assert.equal(projection.unresolved_external_context_count,1);
 assert.equal(projection.periods.current_end_date,"2026-08-31");
});
