import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8");

const resolver = read("lib/platform/service-runtime/providers/ProviderResolver.js");
const executor = read("lib/platform/service-runtime/providers/ProviderExecutor.js");
const intelligence = read("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
const intelligenceRegistration = read("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js");
const code = read("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js");
const codeRegistration = read("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration.js");
const image = read("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js");
const voice = read("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js");
const audio = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js");
const video = read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js");
const videoRegistration = read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js");
const training = read("lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime.js");
const worker = read("scripts/local-node/avantiqo-node01-worker.ps1");
const trainingRunner = read("scripts/local-node/intelligence-training-local.py");

function walk(dir) {
  const out=[];
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("provider resolution does not register external AI/video suppliers", () => {
  assert.doesNotMatch(resolver, /FalProviderRegistration/);
  assert.doesNotMatch(resolver, /GeminiProviderRegistration/);
  assert.doesNotMatch(resolver, /GoogleVeoProviderRegistration/);
  assert.match(resolver, /function localOnlyCapability/);
  assert.match(resolver, /value\.startsWith\("ai\."\)/);
  assert.match(resolver, /localOnlyCapability\(capability\) \? ownedCandidates/);
});

test("provider execution independently rejects non-Avantiqo providers for compute", () => {
  assert.match(executor, /function assertOwnedLocalProvider/);
  assert.match(executor, /provider\.startsWith\("avantiqo-"\)/);
  assert.match(executor, /AVANTIQO_LOCAL_ONLY_PROVIDER_REQUIRED/);
  assert.match(executor, /assertOwnedLocalProvider\(options\)/);
});

test("Intelligence and Code execute only through local runtimes", () => {
  assert.match(intelligence, /executeIntelligenceLocalQueue/);
  assert.match(intelligence, /executeIntelligenceLocal/);
  assert.match(intelligence, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(intelligence, /executeIntelligenceModalDirect|import\("modal"\)/);
  assert.match(intelligenceRegistration, /local_only:\s*true/);
  assert.match(intelligenceRegistration, /modal_fallback_allowed:\s*false/);
  assert.match(code, /AvantiqoCodeLocalQueueProvider/);
  assert.match(code, /AVANTIQO_CODE_LOCAL_NODE_UNAVAILABLE/);
  assert.doesNotMatch(code, /Modal|modal/);
  assert.match(codeRegistration, /local_only_execution:\s*true/);
});

test("image voice and audio providers fail closed locally without cloud fallback", () => {
  assert.match(image, /AVANTIQO_IMAGE_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
  assert.doesNotMatch(image, /OwnedModal|ModalDirect|import\("modal"\)/);
  assert.match(voice, /AVANTIQO_VOICE_LOCAL_NODE_UNAVAILABLE/);
  assert.doesNotMatch(voice, /executeVoiceModalDirect|voiceModalDirectConfigured/);
  assert.match(audio, /AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
  assert.doesNotMatch(audio, /OwnedModal|ModalDirect|import\("modal"\)/);
});

test("video generation runs on Node01 and unsupported video capabilities fail closed without cloud fallback", () => {
  assert.match(video, /AvantiqoVideoLocalQueueProvider\.execute/);
  assert.match(video, /AVANTIQO_VIDEO_LOCAL_ENGINE_NOT_IMPLEMENTED/);
  assert.doesNotMatch(video, /createAvantiqoOwnedModalWorker|import\("modal"\)/);
  assert.match(videoRegistration, /infrastructure_provider:\s*"AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(videoRegistration, /const localVideoWorkerImplemented = true/);
  assert.match(videoRegistration, /implemented_capabilities: IMPLEMENTED_CAPABILITIES/);
  assert.match(videoRegistration, /modal_fallback_allowed:\s*false/);
});

test("model training is a low-priority local Node01 queue workload", () => {
  assert.match(training, /CAPABILITY = "ai\.model\.train"/);
  assert.match(training, /workload:"model_training"/);
  assert.match(training, /priority:-100/);
  assert.match(training, /AVANTIQO_LOCAL_NODE_TRAINER_V1/);
  assert.match(worker, /'ai\.model\.train'/);
  assert.match(worker, /Lane -eq 'training'/);
  assert.match(worker, /RunModelTrainingJob/);
  assert.match(worker, /extend_avantiqo_local_compute_job_lease/);
  assert.match(worker, /model-training-gpu\.lock/);
  assert.match(trainingRunner, /BitsAndBytesConfig/);
  assert.match(trainingRunner, /load_in_4bit=True/);
  assert.match(trainingRunner, /prepare_model_for_kbit_training/);
  assert.match(trainingRunner, /foundation_weights_mutated':False/);
  assert.match(trainingRunner, /production_model_promoted':False/);
});

test("active app and runtime modules have no direct Modal imports outside retired historical runtime files", () => {
  const excluded = [
    "AvantiqoOwnedModalWorker.js",
    "AvantiqoIntelligenceModalDirectRuntime.js",
    "AvantiqoVoiceModalDirectRuntime.js",
  ];
  const offenders=[];
  for (const root of ["app","lib"]) {
    for (const file of walk(root)) {
      if (excluded.some((name)=>file.endsWith(name))) continue;
      const source=read(file);
      if (/import\("modal"\)|createAvantiqoOwnedModalWorker|execute[A-Za-z]*ModalDirect/.test(source)) offenders.push(file);
    }
  }
  assert.deepEqual(offenders,[]);
});
