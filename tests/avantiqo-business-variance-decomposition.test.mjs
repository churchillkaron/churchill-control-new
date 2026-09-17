import test from "node:test";
import assert from "node:assert/strict";
import { decomposeBusinessVariance } from "../lib/intelligence/runtime/AvantiqoBusinessVarianceDecompositionRuntime.js";

test("variance decomposition quantifies explained contribution and residual",()=>{
 const r=decomposeBusinessVariance({baseline_value:100,actual_value:80,driver_rows:[{driver_id:"revenue",direct_contribution:-12},{driver_id:"labor",direct_contribution:-5}]});
 assert.equal(r.metric_change,-20); assert.equal(r.explained_amount,-17); assert.equal(r.unexplained_residual,-3); assert.equal(r.contributions[0].driver_id,"revenue");
});

test("external context stays hypothesis without timing direction and confounders",()=>{
 const r=decomposeBusinessVariance({baseline_value:100,actual_value:90,driver_rows:[{driver_id:"volume",direct_contribution:-10}],external_evidence:[{context_id:"weather",evidence_strength:.9,timing_consistent:true,direction_consistent:true}]});
 assert.equal(r.external_assessments[0].causal_state,"PLAUSIBLE_HYPOTHESIS"); assert.equal(r.external_assessments[0].attributed_amount,null);
});

test("supported external contributor requires stronger evidence contract",()=>{
 const r=decomposeBusinessVariance({baseline_value:100,actual_value:90,external_evidence:[{context_id:"weather",supported:true,evidence_strength:.95,timing_consistent:true,direction_consistent:true,confounders_checked:true}]});
 assert.equal(r.external_assessments[0].causal_state,"SUPPORTED_EXTERNAL_CONTRIBUTOR"); assert.equal(r.authority_effect,"NONE");
});

test("zero baseline does not invent percentage",()=>{const r=decomposeBusinessVariance({baseline_value:0,actual_value:10});assert.equal(r.metric_change_percent,null)});
