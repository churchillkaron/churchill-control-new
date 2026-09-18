import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessDiagnosisReceipt as build } from "../lib/intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime.js";

const input={organization_id:"org",entity_id:"entity",metric:"profit",baseline_period_id:"2026-07",current_period_id:"2026-08",final_diagnosis:{metric:"profit",diagnosis:{final_evidence_state:"INTERNAL_AND_SUPPORTED_EXTERNAL",target_metric:{status:"TARGET_METRIC_READY"},residual_material:true,residual_ratio:.25,variance:{unexplained_residual:-5},internal_coverage_incomplete:false,causal:{supported_context_ids:["weather"]}}},external_research_plan:{status:"RESEARCH_ALLOWED"},external_evidence_assessment:{status:"ASSESSED"},external_diagnosis_closure:{validated_context_ids:["weather"],causal_evidence:[{context_id:"weather",source_refs:[{url:"https://example.gov/weather",publisher:"gov",independence_group:"example.gov",observed_at:"2026-08-31"}]}],validation_results:[{context_id:"weather",status:"CAUSAL_EVIDENCE_READY"},{context_id:"tourism",status:"EVIDENCE_INCOMPLETE",reason:"MISSING_REQUIRED_SUPPORT",missing_requirements:["CONFOUNDER_CHECK"]}]},answer_brief:{status:"INTERNAL_AND_SUPPORTED_EXTERNAL",unresolved:[{kind:"MATERIAL_UNEXPLAINED_RESIDUAL"}]},answer_boundary:{status:"APPENDED_REQUIRED_UNCERTAINTY",required_uncertainty_appended:true,overclaim_detected:false}};

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
