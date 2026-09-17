import test from "node:test";
import assert from "node:assert/strict";
import { closeBusinessDiagnosisWithExternalEvidence as close } from "../lib/intelligence/runtime/AvantiqoBusinessExternalDiagnosisClosureRuntime.js";

const obs=(measure_id,baseline_value,actual_value)=>({measure_id,dimension_key:"THB",baseline_value,actual_value,source_capability_key:"finance.profit_loss.read"});
const batch={comparison_results:[{status:"OBSERVATIONS_READY",capability_key:"finance.profit_loss.read",normalized:{observations:[obs("recognized_revenue",1000,900)]},mapped:{driver_rows:[]}}]};
const request={context_id:"weather",minimum_independent_source_groups:2};
const packet={context_id:"weather",status:"SOURCES_COLLECTED",request,sources:[{url:"https://a.example/x",publisher:"A",independence_group:"A",published_at:"2026-08-01"},{url:"https://b.example/x",publisher:"B",independence_group:"B",published_at:"2026-08-02"}]};

test("raw packets never become causal without owned assessment",()=>{const r=close({metric:"revenue",internal_evidence_batch:batch,external_collection:{packets:[packet]}});assert.equal(r.validated_context_ids.length,0);assert.equal(r.validation_results[0].status,"ASSESSMENT_REQUIRED");assert.deepEqual(r.diagnosis.diagnosis.causal.supported_context_ids,[]);});

test("validated external evidence is fed into second diagnosis pass",()=>{const assessment={context_id:"weather",evidence_strength:.9,freshness_checked:true,period_matched:true,timing_consistent:true,direction_consistent:true,magnitude_plausible:true,confounders_checked:true,alternative_explanations_checked:true};const r=close({metric:"revenue",internal_evidence_batch:batch,external_collection:{packets:[packet]},external_assessments:[assessment]});assert.deepEqual(r.validated_context_ids,["weather"]);assert.deepEqual(r.diagnosis.diagnosis.causal.supported_context_ids,["weather"]);assert.equal(r.authority_effect,"NONE");});

test("incomplete assessment remains unresolved",()=>{const assessment={context_id:"weather",evidence_strength:.9,freshness_checked:true,period_matched:true,timing_consistent:true,direction_consistent:true,magnitude_plausible:true,confounders_checked:false,alternative_explanations_checked:true};const r=close({metric:"revenue",internal_evidence_batch:batch,external_collection:{packets:[packet]},external_assessments:[assessment]});assert.equal(r.validated_context_ids.length,0);assert.equal(r.validation_results[0].status,"EVIDENCE_INCOMPLETE");});


test("contradicted external evidence never enters causal diagnosis",()=>{
  const assessment={context_id:"weather",evidence_strength:.95,freshness_checked:true,period_matched:true,timing_consistent:true,direction_consistent:false,magnitude_plausible:true,confounders_checked:true,alternative_explanations_checked:true};
  const r=close({metric:"revenue",internal_evidence_batch:batch,external_collection:{packets:[packet]},external_assessments:[assessment]});
  assert.equal(r.validation_results[0].status,"EVIDENCE_CONTRADICTED");
  assert.deepEqual(r.validated_context_ids,[]);
  assert.deepEqual(r.diagnosis.diagnosis.causal.supported_context_ids,[]);
});

test("duplicate and unknown assessment context IDs fail closed and remain auditable",()=>{
  const supported={context_id:"weather",evidence_strength:.9,freshness_checked:true,period_matched:true,timing_consistent:true,direction_consistent:true,magnitude_plausible:true,confounders_checked:true,alternative_explanations_checked:true};
  const r=close({metric:"revenue",internal_evidence_batch:batch,external_collection:{packets:[packet]},external_assessments:[supported,{...supported,evidence_strength:1},{...supported,context_id:"invented_context"}]});
  assert.equal(r.validation_results[0].status,"ASSESSMENT_DUPLICATE_REJECTED");
  assert.deepEqual(r.validated_context_ids,[]);
  assert.deepEqual(r.assessment_integrity.duplicate_context_ids,["weather"]);
  assert.deepEqual(r.assessment_integrity.unknown_context_ids,["invented_context"]);
  assert.equal(r.assessment_integrity.clean,false);
});
