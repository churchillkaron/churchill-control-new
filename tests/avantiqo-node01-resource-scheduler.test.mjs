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
test("Node 01 has resource-aware scheduling and governed idle learning",()=>{
  assert.match(worker,/ResourceProfile/); assert.match(worker,/interactive_gpu/); assert.match(worker,/heavy_cpu/);
  assert.match(worker,/GpuIdleLearningAfterSeconds = 900/); assert.match(worker,/NightLearningStartHour = 1/); assert.match(worker,/NightLearningEndHour = 6/);
  assert.match(worker,/promotion_authorized=\$false/); assert.match(worker,/WarmQwenIfIdle/); assert.match(worker,/PriorityClass = 'BelowNormal'/); assert.match(worker,/ONE_HEAVY_JOB_BELOW_NORMAL/); assert.match(worker,/query-compute-apps=used_memory,process_name/);
});
test("compute telemetry exposes scheduler and candidate decisions",()=>{
  assert.match(api,/RESOURCE_AWARE_PRIORITY_V1/); assert.match(api,/local_compute_hours_today/); assert.match(api,/local_candidate_matrix/);
  assert.match(api,/MODAL_KEEP_EXACT_MODEL_TOO_LARGE/); assert.match(api,/MODAL_KEEP_SPECIALIST_GPU/); assert.match(api,/estimated_avoided_supplier_cost_30d/); assert.match(api,/modal_fallback_calls_for_local_capabilities_30d/);
  assert.match(page,/Resource-aware priority/); assert.match(page,/Qwen warm while idle/); assert.match(page,/Night learning/); assert.match(page,/Local candidate matrix/);
});

test("enqueue priorities preserve interactive-first scheduling",()=>{
  assert.match(intelligence,/executionLane === "front" \? 100 : 50/); assert.match(voice,/priority: 80/); assert.match(image,/priority: 70/); assert.match(stems,/priority:65/); assert.match(elastic,/priority: 40/);
});


test("TTS uses certified Node 01 only for background work and preserves Modal interactive path",()=>{
  assert.match(tts,/resemble-ai\/chatterbox:multilingual-v3/);
  assert.match(tts,/workload:\s*"voice_tts"/); assert.match(tts,/priority:\s*35/);
  assert.match(tts,/BATCH_BACKGROUND_ONLY/); assert.match(worker,/RunVoiceTtsJob/); assert.match(worker,/ai.text.to.speech/);
  assert.match(voiceProvider,/backgroundTts/); assert.match(voiceProvider,/AVANTIQO_VOICE_TTS_LOCAL_BATCH_FALLBACK_MODAL/);
  assert.match(asyncSpeech,/execution_mode:\s*"background"/);
  assert.match(api,/LOCAL_GPU_BACKGROUND_MODAL_INTERACTIVE/); assert.match(api,/CERTIFIED_LOCAL_BACKGROUND_MODAL_INTERACTIVE/);
  assert.match(page,/Local background · Modal interactive/);
});
