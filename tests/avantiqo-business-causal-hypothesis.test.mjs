import test from "node:test";
import assert from "node:assert/strict";
import { testBusinessCausalHypotheses } from "../lib/intelligence/runtime/AvantiqoBusinessCausalHypothesisRuntime.js";

test("strong period matched evidence can become supported contributor",()=>{
 const out=testBusinessCausalHypotheses({unexplained_residual:-8000,external_evidence:[{context_id:"weather",evidence_strength:.9,timing_consistent:true,direction_consistent:true,magnitude_plausible:true,confounders_checked:true,alternative_explanations_checked:true}]});
 assert.equal(out.assessments[0].causal_state,"SUPPORTED_EXTERNAL_CONTRIBUTOR");
 assert.equal(out.assessments[0].attributed_amount,null);
 assert.equal(out.causal_claim_allowed,true);
});

test("correlation without confounder and alternative checks stays hypothesis",()=>{
 const out=testBusinessCausalHypotheses({external_evidence:[{context_id:"tourism_demand",evidence_strength:.95,timing_consistent:true,direction_consistent:true,magnitude_plausible:true}]});
 assert.equal(out.assessments[0].causal_state,"PLAUSIBLE_HYPOTHESIS");
 assert.ok(out.assessments[0].missing_support_requirements.includes("CONFOUNDER_CHECK"));
 assert.ok(out.assessments[0].missing_support_requirements.includes("ALTERNATIVE_EXPLANATIONS"));
});

test("wrong timing or direction contradicts hypothesis",()=>{
 const out=testBusinessCausalHypotheses({external_evidence:[{context_id:"competitor_pressure",evidence_strength:.9,timing_consistent:false,direction_consistent:true,magnitude_plausible:true,confounders_checked:true,alternative_explanations_checked:true}]});
 assert.equal(out.assessments[0].causal_state,"CONTRADICTED");
});

test("causal testing never grants authority or automatic monetary attribution",()=>{
 const out=testBusinessCausalHypotheses({unexplained_residual:-10000,external_evidence:[{context_id:"fx",evidence_strength:.85,timing_consistent:true,direction_consistent:true,magnitude_plausible:true,confounders_checked:true,alternative_explanations_checked:true}]});
 assert.equal(out.authority_effect,"NONE");
 assert.equal(out.policy.monetary_attribution_requires_separate_supported_model,true);
 assert.equal(out.assessments[0].attributed_amount,null);
});
