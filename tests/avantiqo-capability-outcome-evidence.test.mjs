import test from "node:test";
import assert from "node:assert/strict";
import { weightedCapabilityOutcomeEvidence } from "../lib/intelligence/runtime/AvantiqoCapabilityOutcomeEvidenceRuntime.js";
const key="services.wallet.read";
const row=(metadata)=>({subject:key,metadata:{capability_key:key,...metadata}});
test("fresh live verified outcomes carry more evidence than historical backfills",()=>{
  const result=weightedCapabilityOutcomeEvidence([row({outcome:"VERIFIED_SUCCESS"}),row({outcome:"VERIFIED_SUCCESS",backfilled_from_historical_verified_execution:true})],key);
  assert.equal(result.weighted_evidence_units,1.6);
  assert.equal(result.live_outcome_weight,1);
  assert.equal(result.historical_backfill_weight,0.6);
});
test("runtime and model failures never reduce capability reliability",()=>{
  const result=weightedCapabilityOutcomeEvidence([row({outcome:"VERIFIED_FAILURE",failure_class:"TRANSPORT_RUNTIME_FAILURE"}),row({outcome:"VERIFIED_FAILURE",failure_class:"MODEL_REASONING_FAILURE"})],key);
  assert.equal(result.weighted_evidence_units,0);
  assert.equal(result.verified_failure_count,0);
});
test("only verified business-effect failures count against capability reliability",()=>{
  const result=weightedCapabilityOutcomeEvidence([row({outcome:"VERIFIED_FAILURE",failure_class:"BUSINESS_OUTCOME_FAILURE"}),row({outcome:"VERIFIED_FAILURE",failure_class:"PREREQUISITE_FAILURE"})],key);
  assert.equal(result.weighted_evidence_units,1);
  assert.equal(result.verified_failure_count,1);
  assert.equal(result.prerequisite_failures_excluded,true);
  assert.equal(result.authority_effect,"NONE");
});

test("reliability distinguishes evidence amount from estimated success",()=>{
  const one=weightedCapabilityOutcomeEvidence([row({outcome:"VERIFIED_SUCCESS"})],key);
  const eight=weightedCapabilityOutcomeEvidence(Array.from({length:8},()=>row({outcome:"VERIFIED_SUCCESS"})),key);
  assert.equal(one.reliability_estimate,0.6);
  assert.equal(one.reliability_maturity,"EARLY");
  assert.ok(eight.reliability_confidence>one.reliability_confidence);
  assert.ok(eight.score>one.score);
});
test("no evidence is unproven rather than unreliable",()=>{const result=weightedCapabilityOutcomeEvidence([],key);assert.equal(result.reliability_estimate,null);assert.equal(result.reliability_maturity,"UNPROVEN");assert.equal(result.no_evidence_means_unproven_not_unreliable,true);});
