import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
const runtime=fs.readFileSync("lib/intelligence/runtime/AvantiqoArenaWeaknessPracticeRuntime.js","utf8"); const route=fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js","utf8");
test("weakness practice is fresh synthetic local-only practice",()=>{assert.match(runtime,/synthetic_cases_only:true/);assert.match(runtime,/held_out_benchmark_cases_reused:false/);assert.match(runtime,/hidden_benchmark_answers_available:false/);assert.match(runtime,/isIntelligenceLocalQueueJob/);assert.match(runtime,/external_provider_spend_allowed:false/)});
test("weakness practice does not train or promote automatically",()=>{assert.match(runtime,/automatic_training_started:false/);assert.match(runtime,/automatic_model_promotion:false/);assert.match(runtime,/raw_reasoning_persisted:false/)});
test("nightly route practices immediately after weakness curriculum",()=>{const a=route.indexOf("reconcileAvantiqoArenaWeaknessCurriculum()");const b=route.indexOf("runAvantiqoArenaWeaknessPractice()");assert.ok(a>=0&&b>a);assert.match(route,/arena_weakness_practice: arenaWeaknessPractice/)});

test("weakness practice cancels only its queued job when the local GPU becomes contended",()=>{assert.match(runtime,/MAX_QUEUE_WAIT_POLLS/);assert.match(runtime,/getIntelligenceLocalQueueStatus/);assert.match(runtime,/LOCAL_GPU_QUEUE_CONTENDED/);assert.match(runtime,/WEAKNESS_PRACTICE_LOCAL_QUEUE_CONTENTION/);assert.match(runtime,/cancelPendingService/)});
test("weakness practice forces a constrained action vocabulary",()=>{assert.match(runtime,/allowedActions/);assert.match(runtime,/Action MUST be exactly one of/);assert.match(runtime,/Do not use prose as the action/)});

test("practice persists the immutable source arena fingerprint for retest eligibility",()=>{assert.match(runtime,/sourceArenaFingerprints/);assert.match(runtime,/source_arena_fingerprints:sourceArenaFingerprints/)});

test("weakness practice rotates fresh synthetic variants across arena attempts",()=>{
  assert.match(runtime,/variants:\[/);
  assert.match(runtime,/arena_attempt/);
  assert.match(runtime,/variant_index/);
  assert.match(runtime,/practice_variants/);
});
