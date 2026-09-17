import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessExternalDiagnosisClosureTool as create } from "../lib/intelligence/runtime/AvantiqoBusinessExternalDiagnosisClosureToolRuntime.js";

const obs=(measure_id,baseline_value,actual_value)=>({measure_id,dimension_key:"THB",baseline_value,actual_value,source_capability_key:"finance.profit_loss.read"});
const batch={comparison_results:[{status:"OBSERVATIONS_READY",capability_key:"finance.profit_loss.read",normalized:{observations:[obs("recognized_revenue",1000,900)]},mapped:{driver_rows:[]}}]};
const packet={context_id:"weather",status:"SOURCES_COLLECTED",request:{context_id:"weather",minimum_independent_source_groups:2},sources:[{url:"https://a.example/x",publisher:"A",independence_group:"A",published_at:"2026-08-01"},{url:"https://b.example/x",publisher:"B",independence_group:"B",published_at:"2026-08-02"}]};

test("closure tool binds collected sources server side",async()=>{const tool=create({metric:"revenue",internal_evidence_batch:batch,external_collection:{packets:[packet]}});assert.equal(tool.metadata.source_provenance_bound_server_side,true);assert.equal(tool.parameters.properties.assessments.items.properties.sources,undefined);const out=await tool.execute({assessments:[{context_id:"weather",evidence_strength:.9,freshness_checked:true,period_matched:true,timing_consistent:true,direction_consistent:true,magnitude_plausible:true,confounders_checked:true,alternative_explanations_checked:true}]});assert.deepEqual(out.validated_context_ids,["weather"]);assert.deepEqual(out.diagnosis.diagnosis.causal.supported_context_ids,["weather"]);});
test("closure tool is absent without collected packets",()=>{assert.equal(create({external_collection:{packets:[]}}),null);});
