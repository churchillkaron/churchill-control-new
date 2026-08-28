#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_V1";
const TECHNICAL_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_CERTIFICATION_V1";
const HUMAN_REVIEW_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_HUMAN_LISTENING_REVIEW_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const STRETCH_ENGINE = "SIGNALSMITH_STRETCH_PYTHON_STRETCH_0_3_1";
const BOUNDARY_CONTRACT = "SEAM_TAPER_NO_DUPLICATED_TRAJECTORY_V2";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-elastic-audio";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const QUALITY_PROFILE = "SIGNALSMITH_REVIEWED_TRANSIENT_WARP_V1";
const APPROVAL_ENV = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_APPROVED";

const text = (value) => String(value ?? "").trim();
const yes = (value) => text(value).toUpperCase() === "YES";

function arg(prefix) {
  return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length));
}

function requiredArg(prefix, code) {
  const value = arg(prefix);
  if (!value) throw new Error(code);
  return value;
}

function check(failures, name, condition) {
  if (!condition) failures.push(name);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

if (!yes(process.env[APPROVAL_ENV])) {
  throw new Error(`${APPROVAL_ENV}_YES_REQUIRED`);
}

const technicalPath = path.resolve(requiredArg("--technical=", "AVANTIQO_MUSIC_ELASTIC_TECHNICAL_RESULT_REQUIRED"));
const humanReviewPath = path.resolve(requiredArg("--human-review=", "AVANTIQO_MUSIC_ELASTIC_HUMAN_REVIEW_REQUIRED"));
const outputPath = path.resolve(
  arg("--output=") || path.join(os.tmpdir(), `avantiqo-music-elastic-production-certification-${Date.now()}.json`),
);

const technicalBytes = await readFile(technicalPath);
const humanReviewBytes = await readFile(humanReviewPath);
const technical = JSON.parse(technicalBytes.toString("utf8"));
const review = JSON.parse(humanReviewBytes.toString("utf8"));
const failures = [];

check(failures, "technical_success", technical?.success === true);
check(failures, "technical_contract", text(technical?.contract) === TECHNICAL_CONTRACT);
check(failures, "technical_render_pass", technical?.technical_render_certification_passed === true);
check(failures, "technical_safe_lease_contract", text(technical?.safe_lease_contract) === SAFE_LEASE_CONTRACT);
check(failures, "technical_safe_lease_lane", text(technical?.safe_lease_lane) === SAFE_LEASE_LANE);
check(failures, "technical_single_controlled_job", Number(technical?.controlled_job_count) === 1);
check(failures, "technical_synthetic_fixture_rights", text(technical?.source_fixture?.rights) === "AVANTIQO_SYNTHETIC_TEST_AUDIO");
check(failures, "technical_original_source_preserved", technical?.original_source_preserved === true);
check(failures, "technical_automatic_apply_false", technical?.automatic_apply_performed === false);
check(failures, "technical_production_provider_path_false", technical?.production_provider_path_used === false);
check(failures, "technical_preproduction_state", technical?.production_certified === false);
check(failures, "technical_human_review_required", technical?.human_listening_review_required === true);
check(failures, "technical_workers_parked_min", Number(technical?.final_workers_min) === 0);
check(failures, "technical_workers_parked_max", Number(technical?.final_workers_max) === 0);
check(failures, "technical_jobs_drained", Number(technical?.final_jobs) === 0);
check(failures, "technical_engine_contract", text(technical?.worker_report?.engine_contract) === ENGINE_CONTRACT);
check(failures, "technical_stretch_engine", text(technical?.worker_report?.stretch_engine) === STRETCH_ENGINE);
check(failures, "technical_boundary_contract", text(technical?.worker_report?.render?.boundary_smoothing_contract) === BOUNDARY_CONTRACT);
check(failures, "technical_no_duplicated_trajectory", technical?.worker_report?.render?.duplicated_transition_trajectory === false);
check(failures, "technical_output_pcm24", text(technical?.output?.format) === "WAV_PCM24");
check(failures, "technical_output_checksum", /^[a-f0-9]{64}$/i.test(text(technical?.output?.checksum)));

check(failures, "human_review_success", review?.success === true);
check(failures, "human_review_contract", text(review?.contract) === HUMAN_REVIEW_CONTRACT);
check(failures, "human_review_technical_contract", text(review?.technical_contract) === TECHNICAL_CONTRACT);
check(failures, "human_review_decision_pass", text(review?.decision).toUpperCase() === "PASS");
check(failures, "human_review_complete", review?.human_listening_review_complete === true);
check(failures, "human_review_attestation", review?.human_listener_attestation === true);
check(failures, "human_review_all_checks", review?.all_listening_checks_passed === true);
check(failures, "human_review_pitch_stable", review?.listening_checks?.pitch_stable === true);
check(failures, "human_review_transients_clean", review?.listening_checks?.transients_clean === true);
check(failures, "human_review_seams_clean", review?.listening_checks?.seams_clean === true);
check(failures, "human_review_timing_musical", review?.listening_checks?.timing_musical === true);
check(failures, "human_review_certification_ready", review?.certification_ready === true);
check(failures, "human_review_preproduction_state", review?.production_certified === false);
check(failures, "human_review_no_provider_activation", review?.provider_activation_performed === false);
check(failures, "human_review_no_endpoint_mutation", review?.endpoint_mutation_performed === false);
check(failures, "human_review_no_provider_job", review?.provider_job_submitted === false);

const reviewTechnicalPath = text(review?.technical_result_path);
if (reviewTechnicalPath) {
  check(failures, "human_review_bound_to_same_technical_result", path.resolve(reviewTechnicalPath) === technicalPath);
}

if (failures.length) {
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    failures,
    production_certified: false,
    provider_activation_performed: false,
    endpoint_mutation_performed: false,
    provider_job_submitted: false,
  }, null, 2));
  process.exit(1);
}

const certification = {
  success: true,
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  capability: CAPABILITY,
  provider: PROVIDER,
  model: MODEL,
  quality_profile: QUALITY_PROFILE,
  engine_contract: ENGINE_CONTRACT,
  technical_contract: TECHNICAL_CONTRACT,
  human_review_contract: HUMAN_REVIEW_CONTRACT,
  evidence: {
    technical_result_path: technicalPath,
    technical_result_sha256: sha256(technicalBytes),
    human_review_path: humanReviewPath,
    human_review_sha256: sha256(humanReviewBytes),
    controlled_job_count: 1,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    safe_lease_lane: SAFE_LEASE_LANE,
    output_checksum: text(technical.output.checksum),
    human_review_decision: "PASS",
    all_listening_checks_passed: true,
  },
  certification_gates: {
    controlled_runtime_render: true,
    exact_engine_contract: true,
    pitch_preservation: true,
    transient_boundary_protection: true,
    original_source_preserved: true,
    human_listening_review: true,
    provider_parked_after_certification: true,
    explicit_operator_certification_approval: true,
  },
  production_certified: true,
  runtime_configuration_required: {
    AVANTIQO_MUSIC_ELASTIC_ENGINE_ENABLED: "true",
    AVANTIQO_MUSIC_ELASTIC_ENGINE_CERTIFIED: "true",
    RUNPOD_AVANTIQO_MUSIC_ELASTIC_ENDPOINT_ID: "existing-certified-endpoint-required",
  },
  production_routing_allowed_after_runtime_configuration: true,
  automatic_apply_forbidden: true,
  explicit_musician_warp_plan_required: true,
  provider_activation_performed: false,
  production_runtime_configuration_mutation_performed: false,
  endpoint_mutation_performed: false,
  provider_job_submitted: false,
  production_deploy_performed: false,
  next_action: "EXPLICIT_PRODUCTION_RUNTIME_CONFIGURATION_PROMOTION",
};

await writeFile(outputPath, `${JSON.stringify(certification, null, 2)}\n`, "utf8");

console.log(JSON.stringify(certification, null, 2));
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFIED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_ACTIVATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_RUNTIME_CONFIGURATION_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
console.log(`AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_OUTPUT=${outputPath}`);
console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=EXPLICIT_PRODUCTION_RUNTIME_CONFIGURATION_PROMOTION");
