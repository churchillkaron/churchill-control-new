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

test("Voice registration does not falsely certify realtime or cloning", async () => {
  const source = await readFile(
    new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /realtime_streaming_certified:\s*false/);
  assert.match(source, /voice_cloning_certified:\s*false/);
  assert.match(source, /ai\.speech\.to\.text/);
  assert.match(source, /ai\.text\.to\.speech/);
});

test("Operator speech APIs remain capability-only and do not expose provider evidence", async () => {
  const transcribe = await readFile(
    new URL("../app/api/operator/transcribe/route.js", import.meta.url),
    "utf8",
  );
  const speak = await readFile(
    new URL("../app/api/operator/speak/route.js", import.meta.url),
    "utf8",
  );
  assert.match(transcribe, /service_id:\s*"ai\.speech\.to\.text"/);
  assert.match(speak, /service_id:\s*"ai\.text\.to\.speech"/);
  assert.doesNotMatch(transcribe, /provider_evidence/);
  assert.doesNotMatch(speak, /provider_evidence/);
});

test("TTS worker keeps custom voice cloning and Thai fail-closed", async () => {
  const source = await readFile(
    new URL("../services/avantiqo-voice-tts/handler.py", import.meta.url),
    "utf8",
  );
  assert.match(source, /AVANTIQO_VOICE_TTS_CUSTOM_VOICE_NOT_CERTIFIED/);
  assert.doesNotMatch(source, /"th"/);
  assert.match(source, /"sv"/);
  assert.match(source, /voice_cloning_used": False/);
});
