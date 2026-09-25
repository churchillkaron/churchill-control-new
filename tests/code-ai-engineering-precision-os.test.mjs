import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  prepareCodeAIEngineeringPrecisionOS,
  finalizeCodeAIEngineeringPrecisionOS,
  assertCodeAIEngineeringPrecisionCommitReady,
  assertCodeAIEngineeringPrecisionReviewReady,
  assertCodeAIProductionReleasePrecisionReady,
} from "../lib/code/runtime/CodeAIEngineeringPrecisionOperatingSystemRuntime.js";

const cap=await readFile(new URL("../lib/platform/capabilities/createCodeAIAutonomousCapability.js",import.meta.url),"utf8");
const mission=await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js",import.meta.url),"utf8");
const commit=await readFile(new URL("../lib/platform/capabilities/createCodeAICommitCapability.js",import.meta.url),"utf8");
const review=await readFile(new URL("../lib/platform/capabilities/createCodeAIReviewPullRequestCapability.js",import.meta.url),"utf8");
const release=await readFile(new URL("../lib/platform/capabilities/createProductProductionReleaseCapability.js",import.meta.url),"utf8");
const certify=await readFile(new URL("../lib/platform/capabilities/createCodeAIReleaseCertificationCapability.js",import.meta.url),"utf8");
const agent=await readFile(new URL("../scripts/code-device-agent.mjs",import.meta.url),"utf8");

test("Precision OS defines all 35 upgrades and A-E mapping",()=>{const p=prepareCodeAIEngineeringPrecisionOS({objective:"Make the whole platform production ready and world-class",state:{files_changed:["app/a/page.tsx","supabase/migrations/x.sql"]}});assert.equal(p.control.requirements.length,35);for(let i=1;i<=35;i++)assert.ok(p.control.requirements.some(x=>x.id===i));assert.equal(p.control.top_five.A,"compiler_semantics");assert.deepEqual(p.control.top_five.B,["test_impact","coverage_guidance","mutation_testing"]);assert.deepEqual(p.control.top_five.C,["git_history","regression_archaeology"]);assert.deepEqual(p.control.top_five.D,["context_compiler","tool_cache"]);assert.deepEqual(p.control.top_five.E,["staging_canary","shadow_verification","progressive_rollback"])});
test("Precision finalizer fails closed on required missing evidence",()=>{const p=prepareCodeAIEngineeringPrecisionOS({objective:"Fix broken auth page",state:{files_changed:["app/login/page.tsx"]}});const f=finalizeCodeAIEngineeringPrecisionOS({prepared_control:p.control,result:{state:{files_changed:["app/login/page.tsx"],precision_evidence:{}}}});assert.equal(f.precision_ready,false);assert.ok(f.missing_required_precision.length>0)});
test("commit gate blocks incomplete Precision OS",()=>assert.throws(()=>assertCodeAIEngineeringPrecisionCommitReady({engineering_precision_os:{contract:"AVANTIQO_CODE_AI_ENGINEERING_PRECISION_OS_V1",precision_ready:false,missing_required_precision:[{key:"mutation_testing"}]}}),/mutation_testing/));
test("review gate defers post-PR release evidence but not pre-review evidence",()=>{assert.equal(assertCodeAIEngineeringPrecisionReviewReady({engineering_precision_os:{contract:"AVANTIQO_CODE_AI_ENGINEERING_PRECISION_OS_V1",precision_ready:false,missing_required_precision:[{key:"staging_canary"},{key:"shadow_verification"}]}}),true);assert.throws(()=>assertCodeAIEngineeringPrecisionReviewReady({engineering_precision_os:{contract:"AVANTIQO_CODE_AI_ENGINEERING_PRECISION_OS_V1",precision_ready:false,missing_required_precision:[{key:"mutation_testing"}]}}),/mutation_testing/)});
test("production release gate always requires E evidence",()=>assert.throws(()=>assertCodeAIProductionReleasePrecisionReady({engineering_precision_os:{contract:"AVANTIQO_CODE_AI_ENGINEERING_PRECISION_OS_V1"},precision_evidence:{}}),/staging_canary/));
test("autonomous capability prepares finalizes and attests Precision OS",()=>{assert.match(cap,/prepareCodeAIEngineeringPrecisionOS/);assert.match(cap,/finalizeCodeAIEngineeringPrecisionOS/);assert.match(cap,/result\.state\.engineering_precision_os = result\.engineering_precision_os/);assert.ok(cap.indexOf("result.state.engineering_precision_os = result.engineering_precision_os")<cap.indexOf("attestCodeMissionState({"))});
test("mission exposes deterministic precision, coverage, fuzz, mutation and history actions",()=>{for(const a of ["record_precision_evidence","history","precision_analyze","mutation_test","coverage_test","fuzz_test"])assert.match(mission,new RegExp(`case "${a}"`));assert.match(mission,/CODE_AI_PRECISION_EVIDENCE_OPERATION_REQUIRED/);assert.match(mission,/passed: operation\.input\?\.passed === true/);assert.match(mission,/verified: operation\.input\?\.verified === true/);assert.match(mission,/CODE_AI_MUTATION_TEST_RESTORE_FAILED/)});
test("commit review and production each enforce the correct Precision boundary",()=>{assert.match(commit,/assertCodeAIEngineeringPrecisionCommitReady/);assert.match(review,/assertCodeAIEngineeringPrecisionReviewReady/);assert.match(release,/assertCodeAIProductionReleasePrecisionReady/);assert.match(certify,/verifyExistingVercelDeployment/);assert.match(certify,/persistCodeAICommitArtifact/)});
test("device browser provides replay accessibility visual and correct fetched review branch checkout",()=>{assert.match(agent,/replayResults/);assert.match(agent,/missing_accessible_name/);assert.match(agent,/visual_difference_ratio/);assert.match(agent,/import\("sharp"\)/);assert.match(agent,/ref==="main"\?"origin\/main":"FETCH_HEAD"/)});
