#!/usr/bin/env node
import fs from "node:fs";

const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_READINESS_V2";
const read = (p) => fs.readFileSync(p, "utf8");
const image = JSON.parse(read("audits/results/avantiqo-music-separator-worker-image.json"));
const registration = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js");
const provider = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorModalProvider.js");
const modal = read("services/avantiqo-music-separator-engine/modal_app.py");
const worker = read("services/avantiqo-music-separator-engine/handler.py");
const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

check("REGISTRATION_STEMS_CAPABILITY", registration.includes('"ai.audio.stems"'));
check("REGISTRATION_DYNAMIC_CERTIFICATION_GATE", registration.includes("separatorRuntimeAvailable"));
check("PROVIDER_MODAL_DIRECT", provider.includes("MODAL_DIRECT_ASYNC_V1"));
check("PROVIDER_CERTIFICATION_GATE", provider.includes("AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED"));
check("PROVIDER_RIGHTS_GATE", provider.includes("AVANTIQO_MUSIC_SEPARATOR_SOURCE_RIGHTS_CONFIRMATION_REQUIRED"));
check("PROVIDER_PRIVATE_OUTPUTS", provider.includes('OUTPUT_BUCKET = "creative-assets"'));
check("PROVIDER_MODAL_APP", provider.includes('APP_NAME = "avantiqo-music-separator-owned"'));
check("PROVIDER_MODAL_FUNCTION", provider.includes('FUNCTION_NAME = "separate"'));
check("MODAL_SCALE_TO_ZERO", modal.includes("min_containers=0") && modal.includes("max_containers=1"));
check("MODAL_IMMUTABLE_IMAGE", modal.includes("sha256:d12b10a5242e99a516653dfb2f9015d338f6b3c1701f8b415779898b8fc9a5ea"));
check("WORKER_DEMUCS_MODEL", worker.includes('DEMUCS_MODEL = "htdemucs_ft"'));
check("WORKER_FOUR_STEMS", worker.includes('STEMS = ("vocals", "drums", "bass", "other")'));
check("IMAGE_BUILD_PASS", image.success === true);
check("IMAGE_PRECERTIFICATION", image.production_certified === false);
check("IMAGE_MODEL", image.demucs_model === "htdemucs_ft");
check("IMAGE_PROFILE", image.quality_profile === "DEMUCS_HTDEMUCS_FT_4STEM_V1");

const report = {
  success: failures.length === 0,
  contract: CONTRACT,
  capability: "ai.audio.stems",
  runtime: "MODAL_DIRECT_A10G_ASYNC_V1",
  model: "demucs-htdemucs-ft",
  quality_profile: "DEMUCS_HTDEMUCS_FT_4STEM_V1",
  immutable_image_reference: image.immutable_image_reference || null,
  implementation_ready: failures.length === 0,
  benchmark_required: true,
  human_quality_review_required: true,
  production_certified: false,
  production_routing_allowed: false,
  next_gate: "CONTROLLED_SEPARATOR_BENCHMARK_AND_HUMAN_REVIEW_REQUIRED",
  failures,
  provider_job_submitted: false,
  gpu_inference_performed: false,
  production_deploy_performed: false,
  mutation_performed: false,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
