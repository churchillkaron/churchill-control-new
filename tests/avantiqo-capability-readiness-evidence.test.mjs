import test from "node:test";
import assert from "node:assert/strict";
import { assessCapabilityReadinessEvidence } from "../lib/intelligence/runtime/AvantiqoCapabilityReadinessEvidenceRuntime.js";
const key="services.wallet.read";
const outcome=(metadata)=>({subject:key,metadata:{capability_key:key,...metadata}});
const readiness=(metadata)=>({subject:key,metadata:{capability_key:key,...metadata}});
test("readiness is unknown without structural evidence",()=>{
  const result=assessCapabilityReadinessEvidence({capabilityKey:key});
  assert.equal(result.status,"UNKNOWN");
  assert.equal(result.score,null);
});
test("verified success is positive readiness evidence while historical proof is discounted",()=>{
  const result=assessCapabilityReadinessEvidence({capabilityKey:key,outcomeRows:[outcome({outcome:"VERIFIED_SUCCESS"}),outcome({outcome:"VERIFIED_SUCCESS",backfilled_from_historical_verified_execution:true})]});
  assert.equal(result.success_evidence_units,1.6);
  assert.equal(result.live_verified_success_count,1);
  assert.equal(result.historical_verified_success_count,1);
});
test("only prerequisite adaptive failures create readiness friction",()=>{
  const result=assessCapabilityReadinessEvidence({capabilityKey:key,readinessRows:[readiness({failure_class:"PREREQUISITE_FAILURE",prerequisite_signal:true,failure_occurrence_count:4}),readiness({failure_class:"MODEL_REASONING_FAILURE",failure_occurrence_count:9})]});
  assert.equal(result.prerequisite_friction_units,2);
  assert.equal(result.prerequisite_failure_occurrence_count,4);
  assert.equal(result.readiness_is_not_capability_reliability,true);
  assert.equal(result.readiness_is_not_execution_authority,true);
});
