import test from "node:test";
import assert from "node:assert/strict";
import { scoreAvantiqoCapabilityLearningPriority } from "../lib/intelligence/runtime/AvantiqoCapabilityLearningPriorityRuntime.js";
const coverage=(score,outcomes=0,live=0,ready=0)=>({score,outcome_weighted_evidence_units:outcomes,live_verified_outcome_count:live,readiness:{success_evidence_units:ready}});
test("real usage raises learning priority for equally weak capabilities",()=>{const idle=scoreAvantiqoCapabilityLearningPriority({capability:{risk:"low"},coverage:coverage(.4)});const used=scoreAvantiqoCapabilityLearningPriority({capability:{risk:"low"},coverage:coverage(.4,4,1,4)});assert.ok(used.priority>idle.priority);});
test("higher business risk raises priority when evidence gap is equal",()=>{const low=scoreAvantiqoCapabilityLearningPriority({capability:{risk:"low"},coverage:coverage(.3,2)});const high=scoreAvantiqoCapabilityLearningPriority({capability:{risk:"high"},coverage:coverage(.3,2)});assert.ok(high.priority>low.priority);});
test("unused capabilities retain exploration credit",()=>{const result=scoreAvantiqoCapabilityLearningPriority({capability:{risk:"low"},coverage:coverage(.2)});assert.ok(result.exploration_credit>0);assert.equal(result.authority_effect,"NONE");});

test("ordinary Business Partner experience raises priority without overriding authority",()=>{const base=scoreAvantiqoCapabilityLearningPriority({capability:{risk:"low"},coverage:coverage(.4)});const experienced=scoreAvantiqoCapabilityLearningPriority({capability:{risk:"low"},coverage:coverage(.4),experience:{turn_count:20,verified_outcome_count:0}});assert.ok(experienced.priority>base.priority);assert.ok(experienced.experience_signal_units>0);assert.equal(experienced.authority_effect,"NONE");});
