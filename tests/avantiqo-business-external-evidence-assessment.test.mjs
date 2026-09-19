import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessExternalAssessmentBrief, assessBusinessExternalEvidence } from "../lib/intelligence/runtime/AvantiqoBusinessExternalEvidenceAssessmentRuntime.js";

const packet={context_id:"weather",status:"SOURCES_COLLECTED",request:{query:"weather Phuket baseline vs current",freshness:"CURRENT_OR_PERIOD_MATCHED",require_period_match:true,require_direction_test:true,require_confounder_check:true,require_alternative_explanations:true},sources:[{url:"https://example.gov/weather",publisher:"example.gov",published_at:"2026-09-10",retrieved_at:"2026-09-17",excerpt:"Rainfall was higher in the current period.",official:true,primary:true}]};

test("assessment brief is bounded and explicitly treats collected evidence as judgments to make",()=>{
  const brief=buildBusinessExternalAssessmentBrief({external_collection:{packets:[packet,{context_id:"empty",status:"NO_USABLE_SOURCES",sources:[]}]}});
  assert.equal(brief.length,1);
  assert.equal(brief[0].context_id,"weather");
  assert.equal(brief[0].sources[0].url,"https://example.gov/weather");
  assert.ok(brief[0].required_judgments.includes("confounders_checked"));
  assert.ok(brief[0].required_judgments.includes("contradicted"));
});

test("owned assessment runtime can be exercised without provider calls and preserves no-authority policy",async()=>{
  const calls=[];
  const r=await assessBusinessExternalEvidence({organization_id:"org",external_collection:{packets:[packet]},assess:async input=>{calls.push(input);return {deferred:false,infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1",assessments:[{context_id:"weather",evidence_strength:.8,freshness_checked:true,period_matched:true,timing_consistent:true,direction_consistent:true,magnitude_plausible:true,confounders_checked:true,alternative_explanations_checked:true,contradicted:false}]};}});
  assert.equal(calls.length,1);
  assert.equal(r.status,"COMPLETED");
  assert.equal(r.assessments[0].context_id,"weather");
  assert.equal(r.authority_effect,"NONE");
  assert.equal(r.external_fallback_allowed,false);
});

test("owned assessment fails closed when local reasoning is deferred",async()=>{
  const r=await assessBusinessExternalEvidence({organization_id:"org",external_collection:{packets:[packet]},assess:async()=>({deferred:true,reason:"LOCAL_NODE_OFFLINE"})});
  assert.equal(r.status,"DEFERRED");
  assert.deepEqual(r.assessments,[]);
  assert.equal(r.reason,"LOCAL_NODE_OFFLINE");
});
