import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  AVANTIQO_OWNED_MODEL_CATALOG,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

const registration = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", import.meta.url),
  "utf8",
);
const provider = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", import.meta.url),
  "utf8",
);
const worker = fs.readFileSync(
  new URL("../services/avantiqo-audio-engine/handler.py", import.meta.url),
  "utf8",
);

test("owned audio registration keeps generation certified while advanced transforms stay gated", () => {
  assert.match(
    registration,
    /DEFAULT_CERTIFIED_CAPABILITIES = Object\.freeze\(\["ai\.music\.generate"\]\)/,
  );
  assert.match(registration, /"ai\.audio\.remix"/);
  assert.match(registration, /"ai\.audio\.edit"/);
  assert.match(registration, /modelVariant === EXPECTED_MODEL_VARIANT/);
  assert.match(registration, /lmModel === EXPECTED_LM_MODEL/);
  assert.match(registration, /lmBackend === EXPECTED_LM_BACKEND/);
  assert.match(registration, /ace_step_lm_enabled: lmEnabled/);
  assert.match(registration, /thinking_enabled: lmEnabled/);
});

test("Music provider owned-worker execution is Modal-direct and fail-closed", () => {
  assert.match(provider, /transportMode:\s*"direct-sdk"/);
  assert.match(provider, /const MODAL_APP_NAME = "avantiqo-audio-owned"/);
  assert.match(provider, /const MODAL_FUNCTION_NAME = "generate"/);
  assert.match(provider, /"ai\.music\.generate"/);
  assert.match(provider, /"ai\.audio\.remix"/);
  assert.match(provider, /"ai\.audio\.edit"/);
  assert.doesNotMatch(provider, /RUNPOD|SAFE_LEASE/);
});

test("Music separator is certifiable without becoming default-certified", () => {
  assert.match(registration, /SEPARATOR_CAPABILITIES = Object\.freeze\(\["ai\.audio\.stems"\]\)/);
  assert.match(registration, /CERTIFIABLE_CAPABILITIES/);
  assert.match(registration, /certifiable_capabilities: CERTIFIABLE_CAPABILITIES/);
  assert.match(registration, /benchmark_required_capabilities: CERTIFIABLE_CAPABILITIES\.filter/);
  assert.match(registration, /production_routing_allowed: separatorRuntimeAvailable/);
  assert.match(registration, /runtime_status: separatorRuntimeAvailable \? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED"/);
  assert.match(registration, /model: STEM_SEPARATOR_MODEL/);
  assert.match(registration, /facebookresearch\/demucs:htdemucs_ft/);
});

test("ACE-Step owned music model requires the XL plus 1.7B LM quality profile", () => {
  const model = AVANTIQO_OWNED_MODEL_CATALOG["avantiqo-audio"].models["ACE-Step/Ace-Step1.5"];
  assert.equal(model.license, "mit");
  assert.equal(model.runtime_compatible, true);
  assert.deepEqual(model.capabilities, ["ai.music.generate"]);
  assert.equal(model.runtime_variant, "acestep-v15-xl-turbo");
  assert.equal(model.quality_profile, "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1");
  assert.equal(model.ace_step_lm_enabled, true);
  assert.equal(model.ace_step_lm_model, "acestep-5Hz-lm-1.7B");
  assert.equal(model.ace_step_lm_backend, "vllm");
  assert.equal(model.thinking_enabled, true);
});

test("Demucs htdemucs_ft is the owned four-stem separator model", () => {
  const model = AVANTIQO_OWNED_MODEL_CATALOG["avantiqo-audio"].models[
    "facebookresearch/demucs:htdemucs_ft"
  ];
  assert.equal(model.license, "mit");
  assert.equal(model.license_verified, true);
  assert.equal(model.runtime_compatible, true);
  assert.equal(model.runtime_family, "DEMUCS");
  assert.equal(model.runtime_variant, "htdemucs_ft");
  assert.equal(model.quality_profile, "DEMUCS_HTDEMUCS_FT_4STEM_V1");
  assert.deepEqual(model.capabilities, ["ai.audio.stems"]);
  assert.deepEqual(model.stems, ["vocals", "drums", "bass", "other"]);
  assert.match(registration, /foundation_models:/);
  assert.match(registration, /STEM_SEPARATOR_MODEL/);
});

test("music worker uses ACE-Step LM reasoning internally without persisting raw reasoning", () => {
  assert.match(worker, /INIT_LLM = os\.getenv\("ACESTEP_INIT_LLM", "true"\)/);
  assert.match(worker, /SUPPORTED_MODEL_VARIANTS = \{"acestep-v15-xl-turbo"\}/);
  assert.match(worker, /SUPPORTED_LM_MODELS = \{"acestep-5Hz-lm-1\.7B"\}/);
  assert.match(worker, /thinking=use_lm/);
  assert.match(worker, /use_cot_metas=use_lm/);
  assert.match(worker, /use_cot_caption=use_lm/);
  assert.match(worker, /use_cot_lyrics=use_lm/);
  assert.match(worker, /use_cot_language=use_lm/);
  assert.match(worker, /"ace_step_lm_used": use_lm/);
  assert.match(worker, /"thinking_enabled": use_lm/);
  assert.match(worker, /"raw_reasoning_persisted": False/);
  assert.match(worker, /DEFAULT_CERTIFIED_CAPABILITIES = \{"ai\.music\.generate"\}/);
});

test("Audio registration exposes Modal-only execution metadata", () => {
  assert.match(registration, /modal_only_execution:\s*true/);
  assert.match(registration, /modal_gateway_required:\s*false/);
  assert.match(registration, /MODAL_DIRECT_A10G_ASYNC_V1/);
  assert.doesNotMatch(provider, /RUNPOD|SAFE_LEASE/);
});
