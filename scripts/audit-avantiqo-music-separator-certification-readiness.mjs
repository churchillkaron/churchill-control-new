#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_READINESS_V1";
const CAPABILITY = "ai.audio.stems";
const CATALOG_MODEL = "facebookresearch/demucs:htdemucs_ft";
const RUNTIME_MODEL = "demucs-htdemucs-ft";
const DEMUCS_MODEL = "htdemucs_ft";
const QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";
const IMAGE_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_WORKER_IMAGE_RESULT_V1";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function requireMatch(source, pattern, code, failures) {
  if (!pattern.test(source)) failures.push(code);
}

const registration = read(
  "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js",
);
const catalog = read(
  "lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js",
);
const provider = read(
  "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorProvider.js",
);
const worker = read("services/avantiqo-music-separator-engine/handler.py");
const dockerfile = read("services/avantiqo-music-separator-engine/Dockerfile");
const preflight = read("scripts/preflight-avantiqo-music-separator-runpod-local.mjs");
const provisioner = read("scripts/provision-avantiqo-music-separator-runpod-local.mjs");
const backingContract = read("tests/music-backing-track-contract.test.mjs");
const image = json("audits/results/avantiqo-music-separator-worker-image.json");

const failures = [];

requireMatch(
  registration,
  /DEFAULT_CERTIFIED_CAPABILITIES = Object\.freeze\(\["ai\.music\.generate"\]\)/,
  "DEFAULT_CERTIFICATION_MUST_REMAIN_MUSIC_GENERATION_ONLY",
  failures,
);
requireMatch(registration, /CERTIFIABLE_CAPABILITIES/, "CERTIFIABLE_CAPABILITY_SET_REQUIRED", failures);
requireMatch(registration, /"ai\.audio\.stems"/, "STEMS_CERTIFIABLE_CAPABILITY_REQUIRED", failures);
requireMatch(registration, /production_routing_allowed:\s*false/, "SEPARATOR_PRODUCTION_ROUTING_MUST_REMAIN_DISABLED", failures);
requireMatch(registration, /IMPLEMENTED_BENCHMARK_AND_CERTIFICATION_REQUIRED/, "SEPARATOR_CERTIFICATION_GATE_REQUIRED", failures);
requireMatch(registration, /facebookresearch\/demucs:htdemucs_ft/, "SEPARATOR_CATALOG_MODEL_BINDING_REQUIRED", failures);
requireMatch(registration, /foundation_models:/, "SEPARATOR_FOUNDATION_MODEL_DISCOVERY_REQUIRED", failures);

requireMatch(catalog, /"facebookresearch\/demucs:htdemucs_ft"/, "OWNED_DEMUCS_CATALOG_ENTRY_REQUIRED", failures);
requireMatch(catalog, /runtime_variant:\s*"htdemucs_ft"/, "OWNED_DEMUCS_VARIANT_REQUIRED", failures);
requireMatch(catalog, /quality_profile:\s*"DEMUCS_HTDEMUCS_FT_4STEM_V1"/, "OWNED_DEMUCS_PROFILE_REQUIRED", failures);
requireMatch(catalog, /capabilities:\s*Object\.freeze\(\["ai\.audio\.stems"\]\)/, "OWNED_DEMUCS_STEMS_CAPABILITY_REQUIRED", failures);

requireMatch(provider, /CAPABILITY = "ai\.audio\.stems"/, "SEPARATOR_PROVIDER_CAPABILITY_REQUIRED", failures);
requireMatch(provider, /MODEL = "demucs-htdemucs-ft"/, "SEPARATOR_PROVIDER_MODEL_REQUIRED", failures);
requireMatch(provider, /QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1"/, "SEPARATOR_PROVIDER_PROFILE_REQUIRED", failures);
requireMatch(provider, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_ENABLED/, "SEPARATOR_ENGINE_ENABLE_GATE_REQUIRED", failures);
requireMatch(provider, /AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1/, "SEPARATOR_RIGHTS_GATE_REQUIRED", failures);
requireMatch(provider, /output_uploads/, "SEPARATOR_PRIVATE_OUTPUT_UPLOADS_REQUIRED", failures);

requireMatch(worker, /DEMUCS_MODEL = "htdemucs_ft"/, "SEPARATOR_WORKER_MODEL_REQUIRED", failures);
requireMatch(worker, /STEMS = \("vocals", "drums", "bass", "other"\)/, "SEPARATOR_FOUR_STEM_CONTRACT_REQUIRED", failures);
requireMatch(worker, /BACKING_STEMS = \("drums", "bass", "other"\)/, "SEPARATOR_BACKING_MIX_CONTRACT_REQUIRED", failures);
requireMatch(worker, /MAX_SOURCE_DURATION_SECONDS/, "SEPARATOR_DURATION_BOUND_REQUIRED", failures);
requireMatch(worker, /AVANTIQO_MUSIC_SEPARATOR_SOURCE_RIGHTS_CONFIRMATION_REQUIRED/, "SEPARATOR_WORKER_RIGHTS_ENFORCEMENT_REQUIRED", failures);
requireMatch(dockerfile, /get_model\("htdemucs_ft"\)/, "SEPARATOR_MODEL_MUST_BE_BAKED_INTO_IMAGE", failures);

requireMatch(preflight, /AVANTIQO_MUSIC_SEPARATOR_RUNPOD_PREFLIGHT_V1/, "SEPARATOR_PREFLIGHT_CONTRACT_REQUIRED", failures);
requireMatch(preflight, /provider_job_submitted:\s*false/, "SEPARATOR_PREFLIGHT_MUST_NOT_SUBMIT_JOB", failures);
requireMatch(preflight, /pricing_activation_performed:\s*false/, "SEPARATOR_PREFLIGHT_MUST_NOT_ACTIVATE_PRICING", failures);
requireMatch(provisioner, /AVANTIQO_MUSIC_SEPARATOR_RUNPOD_PROVISION_V1/, "SEPARATOR_PROVISION_CONTRACT_REQUIRED", failures);
requireMatch(backingContract, /executable, false/, "BACKING_TRACK_MUST_REMAIN_EXECUTION_GATED", failures);

if (image?.success !== true) failures.push("SEPARATOR_IMAGE_BUILD_MUST_PASS");
if (image?.contract !== IMAGE_CONTRACT) failures.push("SEPARATOR_IMAGE_CONTRACT_INVALID");
if (image?.capability !== CAPABILITY) failures.push("SEPARATOR_IMAGE_CAPABILITY_INVALID");
if (image?.model !== RUNTIME_MODEL) failures.push("SEPARATOR_IMAGE_RUNTIME_MODEL_INVALID");
if (image?.demucs_model !== DEMUCS_MODEL) failures.push("SEPARATOR_IMAGE_DEMUCS_MODEL_INVALID");
if (image?.quality_profile !== QUALITY_PROFILE) failures.push("SEPARATOR_IMAGE_QUALITY_PROFILE_INVALID");
if (image?.model_baked_into_image !== true) failures.push("SEPARATOR_IMAGE_MODEL_NOT_BAKED");
if (image?.production_certified !== false) failures.push("SEPARATOR_IMAGE_MUST_REMAIN_PRE_CERTIFICATION");
if (image?.provider_job_submitted !== false) failures.push("SEPARATOR_IMAGE_BUILD_MUST_NOT_SUBMIT_JOB");
if (image?.pricing_activation_performed !== false) failures.push("SEPARATOR_IMAGE_BUILD_MUST_NOT_ACTIVATE_PRICING");

if (failures.length) {
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    capability: CAPABILITY,
    catalog_model: CATALOG_MODEL,
    runtime_model: RUNTIME_MODEL,
    failures,
    production_certified: false,
    production_routing_allowed: false,
    mutation_performed: false,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  capability: CAPABILITY,
  catalog_model: CATALOG_MODEL,
  runtime_model: RUNTIME_MODEL,
  demucs_model: DEMUCS_MODEL,
  quality_profile: QUALITY_PROFILE,
  immutable_image_reference: image.immutable_image_reference || null,
  gates: {
    implementation_present: true,
    owned_model_cataloged: true,
    immutable_image_verified: true,
    provider_transport_present: true,
    rights_enforcement_present: true,
    private_output_transport_present: true,
    read_only_runpod_preflight_present: true,
    controlled_provisioner_present: true,
    benchmark_required: true,
    economics_required: true,
    human_quality_review_required: true,
  },
  next_gate: "CONTROLLED_SEPARATOR_BENCHMARK_EVIDENCE_REQUIRED",
  production_certified: false,
  production_routing_allowed: false,
  pricing_activation_performed: false,
  provider_job_submitted: false,
  production_deploy_performed: false,
  mutation_performed: false,
}, null, 2));
