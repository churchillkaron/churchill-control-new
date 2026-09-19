import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAvantiqoExperiencePracticeCases, MAX_AVANTIQO_EXPERIENCE_PRACTICE_CASES } from "../lib/intelligence/runtime/AvantiqoBusinessPartnerExperiencePracticePolicyRuntime.js";
const runtime=fs.readFileSync("lib/intelligence/runtime/AvantiqoBusinessPartnerExperiencePracticeRuntime.js","utf8");
const route=fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js","utf8");

test("experience failures map to semantically correct practice actions",()=>{
 const cases=buildAvantiqoExperiencePracticeCases([{capability_key:"finance.invoice.create",experience_strength:.8,verified_failure_count:2,model_reasoning_failure_count:1,prerequisite_failure_count:3,transport_runtime_failure_count:1}]);
 const by=new Map(cases.map(c=>[c.failure_class,c.expected]));
 assert.equal(by.get("BUSINESS_OUTCOME_FAILURE"),"INVESTIGATE_BUSINESS_EFFECT");
 assert.equal(by.get("MODEL_REASONING_FAILURE"),"REPLAN_WITH_CRITIQUE");
 assert.equal(by.get("PREREQUISITE_FAILURE"),"REPAIR_PREREQUISITE");
 assert.equal(by.get("TRANSPORT_RUNTIME_FAILURE"),"VERIFY_STATE_BEFORE_SAFE_RETRY");
});

test("experience practice is bounded local-only and authority neutral",()=>{
 assert.equal(MAX_AVANTIQO_EXPERIENCE_PRACTICE_CASES,6);
 assert.match(runtime,/owned_only_required:true/);
 assert.match(runtime,/external_fallback_allowed:false/);
 assert.match(runtime,/LOCAL_GPU_BUSY/);
 assert.match(runtime,/LOCAL_GPU_QUEUE_CONTENDED/);
 assert.match(runtime,/authority_effect:"NONE"/);
 assert.match(runtime,/automatic_training_started:false/);
 assert.match(runtime,/automatic_model_promotion:false/);
});

test("experience-derived practice contains no customer content or benchmark leakage",()=>{
 assert.match(runtime,/synthetic_cases_only:true/);
 assert.match(runtime,/customer_private_content_included:false/);
 assert.match(runtime,/customer_identifiers_included:false/);
 assert.match(runtime,/raw_reasoning_persisted:false/);
 assert.doesNotMatch(runtime,/hidden_answer_key/i);
});

test("nightly route runs experience failure practice after structural experience exists",()=>{
 assert.match(route,/runAvantiqoBusinessPartnerExperiencePractice/);
 const practice=route.indexOf("runAvantiqoBusinessPartnerExperiencePractice()");
 const curriculum=route.indexOf("reconcileAvantiqoCapabilityIntelligenceCurriculum()");
 assert.ok(practice>curriculum);
 assert.match(route,/business_partner_experience_practice: experienceFailurePractice/);
});
