#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_HUMAN_LISTENING_REVIEW_V1";
const TECHNICAL_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_CERTIFICATION_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const STRETCH_ENGINE = "SIGNALSMITH_STRETCH_PYTHON_STRETCH_0_3_1";
const BOUNDARY_CONTRACT = "SEAM_TAPER_NO_DUPLICATED_TRAJECTORY_V2";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-elastic-audio";

const text = (value) => String(value ?? "").trim();
const yes = (value) => text(value).toUpperCase() === "YES";

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

const resultPath = path.resolve(required("AVANTIQO_MUSIC_ELASTIC_HUMAN_REVIEW_RESULT_PATH"));
const decision = required("AVANTIQO_MUSIC_ELASTIC_HUMAN_REVIEW_DECISION").toUpperCase();
if (!new Set(["PASS", "FAIL"]).has(decision)) {
  throw new Error("AVANTIQO_MUSIC_ELASTIC_HUMAN_REVIEW_DECISION_MUST_BE_PASS_OR_FAIL");
}

const technical = JSON.parse(await readFile(resultPath, "utf8"));
const failures = [];
const check = (name, condition) => { if (!condition) failures.push(name); };

check("technical_success", technical?.success === true);
check("technical_contract", text(technical?.contract) === TECHNICAL_CONTRACT);
check("technical_pass", technical?.technical_render_certification_passed === true);
check("safe_lease_contract", text(technical?.safe_lease_contract) === SAFE_LEASE_CONTRACT);
check("safe_lease_lane", text(technical?.safe_lease_lane) === SAFE_LEASE_LANE);
check("single_controlled_job", Number(technical?.controlled_job_count) === 1);
check("synthetic_rights", text(technical?.source_fixture?.rights) === "AVANTIQO_SYNTHETIC_TEST_AUDIO");
check("original_source_preserved", technical?.original_source_preserved === true);
check("automatic_apply_false", technical?.automatic_apply_performed === false);
check("production_provider_path_false", technical?.production_provider_path_used === false);
check("technical_production_certified_false", technical?.production_certified === false);
check("human_review_required", technical?.human_listening_review_required === true);
check("human_review_not_already_recorded", technical?.human_listening_review == null);
check("final_workers_min_zero", Number(technical?.final_workers_min) === 0);
check("final_workers_max_zero", Number(technical?.final_workers_max) === 0);
check("final_jobs_zero", Number(technical?.final_jobs) === 0);
check("worker_report_engine", text(technical?.worker_report?.engine_contract) === ENGINE_CONTRACT);
check("worker_report_stretch", text(technical?.worker_report?.stretch_engine) === STRETCH_ENGINE);
check("worker_report_boundary", text(technical?.worker_report?.render?.boundary_smoothing_contract) === BOUNDARY_CONTRACT);
check("worker_report_no_duplicate_trajectory", technical?.worker_report?.render?.duplicated_transition_trajectory === false);
check("output_pcm24", text(technical?.output?.format) === "WAV_PCM24");
check("output_checksum", /^[a-f0-9]{64}$/i.test(text(technical?.output?.checksum)));

if (failures.length) {
  throw new Error(`${CONTRACT}_TECHNICAL_EVIDENCE_INVALID:${failures.join(",")}`);
}

const checks = {
  pitch_stable: yes(process.env.AVANTIQO_MUSIC_ELASTIC_REVIEW_PITCH_STABLE),
  transients_clean: yes(process.env.AVANTIQO_MUSIC_ELASTIC_REVIEW_TRANSIENTS_CLEAN),
  seams_clean: yes(process.env.AVANTIQO_MUSIC_ELASTIC_REVIEW_SEAMS_CLEAN),
  timing_musical: yes(process.env.AVANTIQO_MUSIC_ELASTIC_REVIEW_TIMING_MUSICAL),
};
const allChecksPass = Object.values(checks).every(Boolean);
if (decision === "PASS" && !allChecksPass) {
  throw new Error(`${CONTRACT}_PASS_REQUIRES_ALL_LISTENING_CHECKS_YES`);
}

const note = text(process.env.AVANTIQO_MUSIC_ELASTIC_HUMAN_REVIEW_NOTE) || null;
const review = {
  success: true,
  contract: CONTRACT,
  technical_contract: TECHNICAL_CONTRACT,
  technical_result_path: resultPath,
  decision,
  listening_checks: checks,
  all_listening_checks_passed: allChecksPass,
  note,
  human_listener_attestation: true,
  human_listening_review_complete: true,
  certification_ready: decision === "PASS" && allChecksPass,
  production_certified: false,
  provider_activation_performed: false,
  endpoint_mutation_performed: false,
  provider_job_submitted: false,
  generated_at: new Date().toISOString(),
};

const outputPath = path.resolve(
  text(process.env.AVANTIQO_MUSIC_ELASTIC_HUMAN_REVIEW_OUTPUT) ||
    path.join(os.tmpdir(), `avantiqo-music-elastic-human-review-${Date.now()}.json`),
);
await writeFile(outputPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");

console.log(JSON.stringify(review, null, 2));
console.log(`AVANTIQO_MUSIC_ELASTIC_HUMAN_LISTENING_REVIEW=${decision}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_CERTIFICATION_READY=${review.certification_ready ? "true" : "false"}`);
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFIED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_ACTIVATION_PERFORMED=false");
console.log(`AVANTIQO_MUSIC_ELASTIC_HUMAN_REVIEW_OUTPUT=${outputPath}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_NEXT=${review.certification_ready ? "FINAL_PROVIDER_CERTIFICATION_ACTIVATION" : "ENGINE_REMAINS_BLOCKED_REVIEW_FAILURE"}`);
