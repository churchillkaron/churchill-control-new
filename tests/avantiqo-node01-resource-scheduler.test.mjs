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

test("Node 01 retries transient Supabase control-plane faults without retrying model work",()=>{
  assert.match(worker,/function IsTransientRpcFailure/);
  assert.match(worker,/408,425,429,500,502,503,504,520,521,522,523,524,525/);
  assert.match(worker,/\$maximumAttempts = 4/);
  assert.doesNotMatch(worker,/RunTextJob[\s\S]{0,500}for \(\$attempt/);
});

test("Node 01 has resource-aware scheduling and governed idle learning",()=>{
  assert.match(worker,/ResourceProfile/); assert.match(worker,/interactive_gpu/); assert.match(worker,/heavy_cpu/);
  assert.match(worker,/GpuIdleLearningAfterSeconds = 900/);
  assert.match(worker,/promotion_authorized=\$false/);
  assert.match(worker,/AVANTIQO_NODE01_IDLE_LEARNING_EVAL_V2/);
  assert.match(worker,/customer_private_content_included=\$false/);
  assert.match(worker,/model_training_performed=\$false/);
});

test("compute telemetry exposes current local-only routing decisions",()=>{
  assert.match(api,/RESOURCE_AWARE_PRIORITY_V1/);
  assert.match(api,/local_compute_hours_today/);
  assert.match(api,/local_candidate_matrix/);
  assert.match(api,/music_generation:\s*"LOCAL_ONLY"/);
  assert.match(api,/document_ocr:\s*"LOCAL_ONLY"/);
  assert.match(api,/normal_code:\s*"LOCAL_ONLY"/);
  assert.match(api,/hard_code_invent:\s*"LOCAL_ONLY"/);
  assert.match(api,/voice_tts:\s*"LOCAL_ONLY"/);
  assert.match(page,/cloud fallback disabled/);
  assert.match(page,/All engine execution on Node01/);
});

test("enqueue priorities preserve interactive-first scheduling",()=>{
  assert.match(intelligence,/priority: executionLane === "front"/);
  assert.match(intelligence,/\? 100/);
  assert.match(intelligence,/executionLane === "deep"[\s\S]*\? 95 : 50/);
  assert.match(voice,/priority: 80/);
  assert.match(image,/priority: 70/);
  assert.match(stems,/priority:65/);
  assert.match(elastic,/priority: 40/);
});

test("TTS uses certified Node01 local-only execution",()=>{
  assert.match(tts,/resemble-ai\/chatterbox:multilingual-v3/);
  assert.match(tts,/workload:\s*"voice_tts"/);
  assert.match(tts,/priority:\s*35/);
  assert.match(worker,/RunVoiceTtsJob/);
  assert.match(worker,/ai.text.to.speech/);
  assert.doesNotMatch(voiceProvider,/executeVoiceModalDirect|voiceModalDirectConfigured/);
  assert.match(asyncSpeech,/execution_mode:\s*"background"/);
  assert.match(api,/voice_tts:\s*"LOCAL_ONLY"/);
  assert.match(page,/Local GPU only/);
});

test("Node 01 learning feed is token-authenticated bounded and excludes raw private memory",()=>{
  assert.match(learningRpc,/avantiqo_local_node_authorized\(p_node_id, p_node_token\)/);
  assert.match(learningRpc,/m\.party_id is null/);
  assert.match(learningRpc,/m\.entity_id is null/);
  assert.match(learningRpc,/customer_private_content_included', false/);
  assert.match(learningRpc,/promotion_authority', false/);
});

test("Node 01 bounds long-running local model subprocesses",()=>{
  assert.match(worker,/WaitForAvantiqoChildProcess/);
  assert.match(worker,/AVANTIQO_LOCAL_MUSIC_SEPARATOR_TIMEOUT/);
  assert.match(worker,/AVANTIQO_LOCAL_MUSIC_VOCAL_CORRECTION_TIMEOUT/);
  assert.match(worker,/AVANTIQO_LOCAL_VOICE_TTS_TIMEOUT/);
  assert.match(worker,/AVANTIQO_LOCAL_SFX_TIMEOUT/);
});
