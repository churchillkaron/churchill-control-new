import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessAnswerBrief } from "../lib/intelligence/runtime/AvantiqoBusinessAnswerBriefRuntime.js";

test("answer brief separates facts supported external context and unresolved residual",()=>{
 const final_diagnosis={metric:"revenue",diagnosis:{metric:"revenue",final_evidence_state:"INTERNAL_AND_SUPPORTED_EXTERNAL",target_metric:{status:"TARGET_METRIC_READY",metric:"revenue",baseline_value:100,actual_value:80,evidence_status:"AUTHORITATIVE"},variance:{unexplained_residual:-8,contributions:[{driver_id:"volume",contribution_amount:-12,direction:"NEGATIVE",causal_state:"OBSERVED_DRIVER"}]},residual_material:true,residual_ratio:.4,internal_coverage_incomplete:false,causal:{assessments:[{context_id:"weather",causal_state:"SUPPORTED_EXTERNAL_CONTRIBUTOR",support_score:.9,evidence_strength:.9,attributed_amount:null}]}}};
 const r=buildBusinessAnswerBrief({final_diagnosis});
 assert.equal(r.facts[0].kind,"TARGET_METRIC");
 assert.equal(r.facts[1].kind,"INTERNAL_DRIVER");
 assert.equal(r.supported_external_context[0].context_id,"weather");
 assert.equal(r.supported_external_context[0].attributed_amount,null);
 assert.equal(r.unresolved[0].kind,"MATERIAL_UNEXPLAINED_RESIDUAL");
 assert.equal(r.authority_effect,"NONE");
});

test("answer brief keeps unsupported external context unresolved",()=>{
 const final_diagnosis={diagnosis:{final_evidence_state:"INTERNAL_WITH_UNRESOLVED_EXTERNAL_RESIDUAL",target_metric:{status:"TARGET_METRIC_READY",metric:"profit",baseline_value:100,actual_value:90},variance:{unexplained_residual:-10,contributions:[]},residual_material:true,residual_ratio:1,causal:{assessments:[{context_id:"tourism",causal_state:"PLAUSIBLE_HYPOTHESIS",missing_support_requirements:["CONFOUNDER_CHECK"]}]}}};
 const r=buildBusinessAnswerBrief({final_diagnosis});
 assert.equal(r.supported_external_context.length,0);
 assert.ok(r.unresolved.some(x=>x.kind==="EXTERNAL_CONTEXT_UNRESOLVED"));
 assert.equal(r.explanation_complete,false);
});
