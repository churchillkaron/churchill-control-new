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
const ghcrAuthProvisioner = fs.readFileSync(
  new URL("../scripts/provision-avantiqo-runpod-ghcr-auth-local.mjs", import.meta.url),
  "utf8",
);

test("owned audio registration keeps generation certified while advanced transforms stay gated", () => {
  assert.match(
    registration,
    /DEFAULT_CERTIFIED_CAPABILITIES = Object\.freeze\(\["ai\.music\.generate"\]\)/,
  );
  assert.match(registration, /"ai\.audio\.remix"/);
  assert.match(registration, /"ai\.audio\.edit"/);
  assert.match(registration, /modelVariant === "acestep-v15-xl-turbo"/);
  assert.match(registration, /lmModel === "acestep-5Hz-lm-1\.7B"/);
  assert.match(registration, /lmBackend === "vllm"/);
  assert.match(registration, /ace_step_lm_enabled: true/);
  assert.match(registration, /thinking_enabled: true/);
});

test("Music provider owned-worker execution is protected by exact Safe Lease V2 audio lane", () => {
  assert.match(provider, /const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2"/);
  assert.match(provider, /const SAFE_LEASE_LANE = "audio"/);
  assert.match(provider, /"ai\.music\.generate"/);
  assert.match(provider, /"ai\.audio\.remix"/);
  assert.match(provider, /"ai\.audio\.edit"/);
  assert.match(provider, /"ai\.audio\.extend"/);
  assert.match(provider, /"ai\.audio\.mix"/);
  assert.match(provider, /"ai\.audio\.master"/);
  assert.match(provider, /AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE/);
  assert.match(provider, /AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT/);
  assert.match(provider, /AVANTIQO_RUNPOD_SAFE_LEASE_LANE/);
  assert.match(provider, /AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID/);
  assert.match(provider, /RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID/);
  assert.match(provider, /AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT/);
  assert.match(provider, /AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_ENDPOINT_MISMATCH/);
  assert.match(provider, /safe_lease: lease/);
});

test("Music separator is certifiable without becoming default-certified", () => {
  assert.match(registration, /SEPARATOR_CAPABILITIES = Object\.freeze\(\["ai\.audio\.stems"\]\)/);
  assert.match(registration, /CERTIFIABLE_CAPABILITIES/);
  assert.match(registration, /certifiable_capabilities: CERTIFIABLE_CAPABILITIES/);
  assert.match(registration, /benchmark_required_capabilities: CERTIFIABLE_CAPABILITIES\.filter/);
  assert.match(registration, /production_routing_allowed: false/);
  assert.match(registration, /runtime_status: "IMPLEMENTED_BENCHMARK_AND_CERTIFICATION_REQUIRED"/);
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

test("RunPod GHCR auth helper requires V3 XL plus LM immutable image evidence", () => {
  assert.match(ghcrAuthProvisioner, /AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V3/);
  assert.doesNotMatch(ghcrAuthProvisioner, /AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V2/);
  assert.match(ghcrAuthProvisioner, /runtime_variant\) !== "acestep-v15-xl-turbo"/);
  assert.match(ghcrAuthProvisioner, /quality_profile\) !== EXPECTED_QUALITY_PROFILE/);
  assert.match(ghcrAuthProvisioner, /ace_step_lm_required !== true/);
  assert.match(ghcrAuthProvisioner, /lm_model\) !== EXPECTED_LM_MODEL/);
  assert.match(ghcrAuthProvisioner, /lm_backend\) !== EXPECTED_LM_BACKEND/);
  assert.match(ghcrAuthProvisioner, /xl_model_contract_passed_by_docker_build !== true/);
  assert.match(ghcrAuthProvisioner, /lm_contract_passed_by_docker_build !== true/);
});
