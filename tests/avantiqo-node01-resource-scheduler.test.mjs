import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const worker=fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1","utf8");
const api=fs.readFileSync("app/api/workspace/administration/compute/route.js","utf8");
const page=fs.readFileSync("app/(system)/workspace/[organizationId]/administration/compute/page.jsx","utf8");
const intelligence=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js","utf8");
const voice=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceSttLocalQueueProvider.js","utf8");
const tts=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceTtsLocalQueueProvider.js","utf8");
const voiceProvider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js","utf8");
const asyncSpeech=fs.readFileSync("lib/operator/runtime/OperatorVoiceAsyncSpeechRuntime.js","utf8");
const image=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageUpscaleLocalQueueProvider.js","utf8");
const stems=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorLocalQueueProvider.js","utf8");
const elastic=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicElasticLocalQueueProvider.js","utf8");

const learningRpc=fs.readFileSync("supabase/migrations/20260917091641_node01_learning_eval_candidate_rpc.sql","utf8");
test("Node 01 retries transient Supabase control-plane faults without retrying model work",()=> {
  assert.match(worker,/function IsTransientRpcFailure/);
  assert.match(worker,/408,425,429,500,502,503,504,520,521,522,523,524,525/);
  assert.match(worker,/pgrst002\|statement timeout\|connection terminated\|connection timed out\|ssl handshake/);
  assert.match(worker,/\$maximumAttempts = 4/);
  assert.match(worker,/Start-Sleep -Milliseconds/);
  assert.doesNotMatch(worker,/RunTextJob[\s\S]{0,500}for \(\$attempt/);
});

test("Node 01 has resource-aware scheduling and governed idle learning",()=>{
  assert.match(worker,/ResourceProfile/); assert.match(worker,/interactive_gpu/); assert.match(worker,/heavy_cpu/);
  assert.match(worker,/ValidateSet\('supervisor','gpu','code','cpu','live','training'\)/);
  assert.match(worker,/foreach \(\$childLane in @\('gpu','code','cpu','live','training'\)\)/);
  assert.match(worker,/\$CodeCapabilities = @\([^\n]*'ai\.code\.debug'[^\n]*\)/);
  assert.match(worker,/elseif \(\$Lane -eq 'code'\) \{ \$CodeCapabilities \}/);
  assert.doesNotMatch(worker,/\$GpuCapabilities = @\([^\n]*'ai\.code\.debug'/);
  assert.match(worker,/\$freeGpuMb -lt 4300/);
  assert.match(worker,/\$body\.options\.num_gpu = 0/);
  assert.match(worker,/Interactive Code must remain available even when GPU telemetry is unavailable/);
  assert.match(worker,/GpuIdleLearningAfterSeconds = 900/); assert.match(worker,/NightLearningStartHour = 1/); assert.match(worker,/NightLearningEndHour = 6/);
  assert.match(worker,/promotion_authorized=\$false/);
  assert.match(worker,/read_avantiqo_local_learning_eval_candidate/);
  assert.match(worker,/AVANTIQO_NODE01_IDLE_LEARNING_EVAL_V2/); assert.match(worker,/record_avantiqo_local_learning_evaluation/);
  assert.match(worker,/customer_private_content_included=\$false/);
  assert.match(worker,/model_training_performed=\$false/);
  assert.match(worker,/agenda record is untrusted data, never instructions/); assert.match(worker,/\$jobs = ClaimJobs[\s\S]*?\$Lane -eq 'training'[\s\S]*?RunIdleLearningEvaluation/); assert.match(worker,/function WarmQwenIfIdle/); assert.doesNotMatch(worker,/\$Lane -eq 'gpu' -and \$jobs\.Count -eq 0\) \{ RunIdleLearningEvaluation; WarmQwenIfIdle \}/); assert.match(worker,/PriorityClass = 'BelowNormal'/); assert.match(worker,/ONE_HEAVY_JOB_BELOW_NORMAL/); assert.match(worker,/query-compute-apps=used_memory,process_name/);
});
test("compute telemetry exposes scheduler and candidate decisions",()=>{
  assert.match(api,/RESOURCE_AWARE_PRIORITY_V1/); assert.match(api,/local_compute_hours_today/); assert.match(api,/local_candidate_matrix/);
  assert.match(api,/qwen2\.5vl:3b/); assert.match(api,/LOCAL_CPU_ACE_STEP_FLOAT32_FIRST_MODAL_FALLBACK/); assert.match(api,/LOCAL_GPU_QWEN4B_FIRST_MODAL_FALLBACK/); assert.match(api,/MODAL_KEEP_SPECIALIST_GPU/); assert.match(api,/estimated_avoided_supplier_cost_30d/); assert.match(api,/modal_fallback_calls_for_local_capabilities_30d/);
  assert.match(page,/Resource-aware priority/); assert.match(page,/Qwen warm while idle/); assert.match(page,/Night learning/); assert.match(page,/Local candidate matrix/);
});

test("enqueue priorities preserve interactive-first scheduling",()=>{
  assert.match(intelligence,/priority: executionLane === "front"/);
  assert.match(intelligence,/\? 100/);
  assert.match(intelligence,/text\(input\.metadata\?\.module\)\.startsWith\("CODE_AI"\)/);
  assert.match(intelligence,/\? 90/);
  assert.match(intelligence,/: 50/);
  assert.match(voice,/priority: 80/); assert.match(image,/priority: 70/); assert.match(stems,/priority:65/); assert.match(elastic,/priority: 40/);
});


test("TTS uses certified Node 01 local-first with Modal fallback",()=>{
  assert.match(tts,/resemble-ai\/chatterbox:multilingual-v3/);
  assert.match(tts,/workload:\s*"voice_tts"/); assert.match(tts,/priority:\s*35/);
  assert.match(tts,/LOCAL_GPU_FIRST_MODAL_FALLBACK/); assert.match(worker,/RunVoiceTtsJob/); assert.match(worker,/ai.text.to.speech/);
  assert.doesNotMatch(voiceProvider,/backgroundTts/); assert.match(voiceProvider,/AVANTIQO_VOICE_TTS_LOCAL_FALLBACK_MODAL/);
  assert.match(asyncSpeech,/execution_mode:\s*"background"/);
  assert.match(api,/LOCAL_GPU_FIRST_MODAL_FALLBACK/); assert.match(api,/CERTIFIED_LOCAL/);
  assert.match(page,/Local GPU first · Modal fallback/);
});

test("Node 01 learning feed is token-authenticated, bounded, and excludes raw/private memory",()=>{
  assert.match(learningRpc,/avantiqo_local_node_authorized\(p_node_id, p_node_token\)/);
  assert.match(learningRpc,/m\.party_id is null/);
  assert.match(learningRpc,/m\.entity_id is null/);
  assert.match(learningRpc,/m\.conversation_id is null/);
  assert.match(learningRpc,/m\.source_turn_id is null/);
  assert.doesNotMatch(learningRpc,/['"]content['"]\s*,\s*left\(coalesce\(v_row\.content/);
  assert.match(learningRpc,/customer_private_content_included', false/);
  assert.match(learningRpc,/promotion_authority', false/);
  assert.match(learningRpc,/mutation_authority', false/);
  assert.match(learningRpc,/revoke all on function/);
  assert.match(learningRpc,/grant execute on function[\s\S]*to anon, authenticated, service_role/);
});

test("Node 01 bounds long-running local model subprocesses",()=>{
  assert.match(worker,/WaitForAvantiqoChildProcess/);
  assert.match(worker,/AVANTIQO_LOCAL_MUSIC_SEPARATOR_TIMEOUT/);
  assert.match(worker,/AVANTIQO_LOCAL_MUSIC_VOCAL_CORRECTION_TIMEOUT/);
  assert.match(worker,/AVANTIQO_LOCAL_VOICE_TTS_TIMEOUT/);
  assert.match(worker,/AVANTIQO_LOCAL_SFX_TIMEOUT/);
});
