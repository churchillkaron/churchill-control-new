import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ownedProviderForCapability,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy.js";
import {
  ownedExecutionCertification,
  ownedModelCertification,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

const voiceProvider = {
  id: "avantiqo-voice",
  metadata: {
    foundation_models: [
      "openai/whisper-large-v3-turbo",
      "resemble-ai/chatterbox:multilingual-v3",
    ],
  },
};

const productionPricing = {
  id: "voice-production-price",
  provider: "avantiqo-voice",
  metadata: {
    pricing_status: "PRODUCTION_CERTIFIED",
    owned_inference: true,
    benchmark_certified: true,
    economics_certified: true,
    model_license_verified: true,
    recalibration_required: false,
  },
};

test("speech contracts resolve to Avantiqo Voice", () => {
  assert.equal(ownedProviderForCapability("ai.speech.to.text"), "avantiqo-voice");
  assert.equal(ownedProviderForCapability("ai.text.to.speech"), "avantiqo-voice");
});

test("Whisper STT and Chatterbox multilingual TTS are model-certified", () => {
  assert.equal(
    ownedModelCertification({
      provider: voiceProvider,
      capability: "ai.speech.to.text",
    }).eligible,
    true,
  );
  assert.equal(
    ownedModelCertification({
      provider: voiceProvider,
      capability: "ai.text.to.speech",
    }).eligible,
    true,
  );
});

test("realtime speech remains uncertified until a realtime worker is implemented", () => {
  const result = ownedModelCertification({
    provider: voiceProvider,
    capability: "ai.speech.to.text.realtime",
  });
  assert.equal(result.eligible, false);
});

test("uncertified realtime Voice cannot open provider sessions or browser provider websockets", async () => {
  const client = await readFile(
    new URL("../lib/operator/voice/RealtimeTranscriptionClient.js", import.meta.url),
    "utf8",
  );
  const session = await readFile(
    new URL("../app/api/operator/transcribe/realtime/session/route.js", import.meta.url),
    "utf8",
  );
  const settle = await readFile(
    new URL("../app/api/operator/transcribe/realtime/settle/route.js", import.meta.url),
    "utf8",
  );

  for (const source of [client, session, settle]) {
    assert.match(source, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
    assert.match(source, /realtime_streaming_certified:\s*false/);
    assert.match(source, /GOVERNED_ASYNC_STT/);
    assert.doesNotMatch(source, /openai-insecure-api-key/);
    assert.doesNotMatch(source, /provider:\s*"openai"/);
  }
  assert.match(session, /status:\s*410/);
  assert.match(settle, /status:\s*410/);
  assert.doesNotMatch(session, /ServiceExecutionRuntime\.execute/);
  assert.doesNotMatch(settle, /LiveProviderSessionRuntime/);
});

test("owned Voice still requires measured production economics", () => {
  const provisional = ownedExecutionCertification({
    provider: voiceProvider,
    capability: "ai.text.to.speech",
    pricing: {
      ...productionPricing,
      metadata: {
        ...productionPricing.metadata,
        pricing_status: "PROVISIONAL_MEASURED_BASELINE",
        recalibration_required: true,
      },
    },
  });
  assert.equal(provisional.eligible, false);

  const certified = ownedExecutionCertification({
    provider: voiceProvider,
    capability: "ai.text.to.speech",
    pricing: productionPricing,
  });
  assert.equal(certified.eligible, true);
});

test("Voice registration does not falsely certify realtime or recorded-reference cloning", async () => {
  const source = await readFile(
    new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /realtime_streaming_certified:\s*false/);
  assert.match(source, /voice_cloning_certified:\s*false/);
  assert.match(source, /recorded_reference_voice_implemented:\s*true/);
  assert.match(source, /recorded_reference_voice_certified:\s*false/);
  assert.match(source, /recorded_reference_requires_consent:\s*true/);
  assert.match(source, /ai\.speech\.to\.text/);
  assert.match(source, /ai\.text\.to\.speech/);
});

test("Voice RunPod execution is durable across scale-to-zero cold starts and V2 lease-gated", async () => {
  const source = await readFile(
    new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProvider.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /runpodRequest\(endpointId, "\/run"/);
  assert.match(source, /async getStatus\(input = \{\}\)/);
  assert.match(source, /provider_job_id:\s*submitted\.jobId/);
  assert.match(source, /\/status\/\$\{encodeURIComponent\(jobId\)\}/);
  assert.match(source, /await requireSafeLeaseForSubmission\(endpointId, capability, input\)/);
  assert.match(source, /validateVoiceRunpodDistributedLease/);
  assert.match(source, /mode:\s*"DISTRIBUTED_DATABASE"/);
  assert.match(source, /mode:\s*"LOCAL_CONTROLLER_ENV"/);
  assert.match(source, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(source, /AVANTIQO_VOICE_RUNPOD_SAFE_LEASE_REQUIRED/);
  assert.doesNotMatch(source, /\/runsync/);
  assert.doesNotMatch(source, /AVANTIQO_VOICE_RUNSYNC_NOT_COMPLETED/);
});

test("Operator speech APIs delegate capability-only execution to async Voice runtimes", async () => {
  const transcribe = await readFile(
    new URL("../app/api/operator/transcribe/route.js", import.meta.url),
    "utf8",
  );
  const speakJobs = await readFile(
    new URL("../app/api/operator/speak/jobs/route.js", import.meta.url),
    "utf8",
  );
  const legacySpeak = await readFile(
    new URL("../app/api/operator/speak/route.js", import.meta.url),
    "utf8",
  );
  const transcriptionRuntime = await readFile(
    new URL("../lib/operator/runtime/OperatorVoiceAsyncTranscriptionRuntime.js", import.meta.url),
    "utf8",
  );
  const speechRuntime = await readFile(
    new URL("../lib/operator/runtime/OperatorVoiceAsyncSpeechRuntime.js", import.meta.url),
    "utf8",
  );

  assert.match(transcribe, /startOperatorAsyncTranscription/);
  assert.match(speakJobs, /OperatorVoiceAsyncSpeechRuntime\.start/);
  assert.match(transcriptionRuntime, /const CAPABILITY = "ai\.speech\.to\.text"/);
  assert.match(transcriptionRuntime, /service_id:\s*CAPABILITY/);
  assert.match(speechRuntime, /const CAPABILITY = "ai\.text\.to\.speech"/);
  assert.match(speechRuntime, /service_id:\s*CAPABILITY/);
  assert.match(legacySpeak, /AVANTIQO_OPERATOR_SPEAK_LEGACY_DISABLED/);
  assert.match(legacySpeak, /\/api\/operator\/speak\/jobs/);
  for (const source of [transcribe, speakJobs, legacySpeak]) {
    assert.doesNotMatch(source, /provider_evidence/);
  }
});

test("TTS worker implements consented recorded-reference identity while Thai stays fail-closed", async () => {
  const source = await readFile(
    new URL("../services/avantiqo-voice-tts/handler.py", import.meta.url),
    "utf8",
  );
  assert.match(source, /VOICE_REFERENCE_CONTRACT = "AVANTIQO_VOICE_REFERENCE_V1"/);
  assert.match(source, /SELF/);
  assert.match(source, /AUTHORIZED/);
  assert.match(source, /LICENSED/);
  assert.match(source, /prepare_conditionals\(reference_path/);
  assert.match(source, /voice_cloning_used/);
  assert.match(source, /voice_identity_source/);
  assert.match(source, /recorded_reference/);
  assert.doesNotMatch(source, /"th"/);
  assert.match(source, /"sv"/);
});

test("TTS image launches Python directly and emits a breadcrumb before heavy imports", async () => {
  const dockerfile = await readFile(
    new URL("../services/avantiqo-voice-tts/Dockerfile", import.meta.url),
    "utf8",
  );
  const handler = await readFile(
    new URL("../services/avantiqo-voice-tts/handler.py", import.meta.url),
    "utf8",
  );
  assert.match(dockerfile, /CMD \["python", "-u", "\/app\/handler\.py"\]/);
  const breadcrumb = handler.indexOf("AVANTIQO_VOICE_TTS_PYTHON_PROCESS");
  const heavyImport = handler.indexOf("import runpod");
  assert.ok(breadcrumb >= 0, "Voice Python startup breadcrumb must exist");
  assert.ok(heavyImport >= 0, "RunPod import must exist");
  assert.ok(breadcrumb < heavyImport, "Voice Python breadcrumb must precede heavy imports");
});

test("Voice TTS runtime binding repair is plan-first and refuses active work", async () => {
  const source = await readFile(
    new URL("../scripts/repair-avantiqo-voice-tts-runtime-binding-local.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /process\.argv\.includes\("--apply"\)/);
  assert.match(source, /AVANTIQO_VOICE_TTS_RUNTIME_BINDING_REPAIR_APPROVED/);
  assert.match(source, /JOBS_IN_QUEUE/);
  assert.match(source, /JOBS_IN_PROGRESS/);
  assert.match(source, /ACTIVE_EXECUTION_WORKER_PRESENT/);
  assert.match(source, /python_process_breadcrumb_baked/);
  assert.match(source, /startup_probe_outcome === "success"/);
  assert.match(source, /generation_submitted:\s*false/);
});
