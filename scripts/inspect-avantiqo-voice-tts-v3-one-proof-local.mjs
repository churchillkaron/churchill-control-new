import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_TTS_V3_ONE_PROOF_INSPECTION_V1";
const REPORT_PATH = resolve(
  process.env.AVANTIQO_VOICE_TTS_V3_ONE_PROOF_REPORT_OUTPUT ||
  "/tmp/avantiqo-voice-tts-v3-one-proof.json",
);
const FAILED_JOB_INSPECTOR = resolve("scripts/inspect-avantiqo-voice-tts-failed-job-local.mjs");

function text(value) { return String(value ?? "").trim(); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }

if (!existsSync(REPORT_PATH)) {
  throw new Error(`AVANTIQO_VOICE_TTS_V3_ONE_PROOF_REPORT_NOT_FOUND:${REPORT_PATH}`);
}

const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const jobId = text(report?.job_id);
const submissionOutcome = text(report?.generation_submission_outcome) || "UNKNOWN";
const generationSubmitted = report?.generation_submitted === true;
const ambiguousSubmission = submissionOutcome === "AMBIGUOUS_FAIL_CLOSED";
const acceptedJobExists = generationSubmitted && Boolean(jobId);
const approvalConsumedOrAmbiguous = acceptedJobExists || ambiguousSubmission;
const approvalStillUnused = !generationSubmitted && !ambiguousSubmission && !jobId;

const summary = {
  success: true,
  contract: CONTRACT,
  read_only: true,
  mutation_performed: false,
  generation_submitted_by_inspector: false,
  job_cancel_requested: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  source_report: REPORT_PATH,
  smoke: {
    success: report?.success === true,
    contract: text(report?.contract) || null,
    error_code: text(report?.error_code) || null,
    generation_submitted: generationSubmitted,
    generation_submission_outcome: submissionOutcome,
    job_id: jobId || null,
    health_before: report?.health_before || null,
    authorization: report?.authorization || null,
    tts: report?.tts || null,
  },
  approval_state: {
    accepted_job_exists: acceptedJobExists,
    ambiguous_submission: ambiguousSubmission,
    approval_consumed_or_ambiguous: approvalConsumedOrAmbiguous,
    approval_still_unused: approvalStillUnused,
    safe_to_submit_another_without_new_approval: approvalStillUnused,
  },
};

console.log(JSON.stringify(summary, null, 2));

if (jobId) {
  if (!existsSync(FAILED_JOB_INSPECTOR)) {
    throw new Error("AVANTIQO_VOICE_TTS_FAILED_JOB_INSPECTOR_REQUIRED");
  }
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_V3_ONE_PROOF_INSPECT_EXISTING_JOB",
    job_id: jobId,
    read_only: true,
    generation_submitted: false,
    job_cancel_requested: false,
    secrets_printed: false,
  }));
  const child = spawnSync(process.execPath, [FAILED_JOB_INSPECTOR], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_VOICE_TTS_FAILED_JOB_ID: jobId,
      RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID: endpointId,
    },
    stdio: "inherit",
    encoding: "utf8",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`AVANTIQO_VOICE_TTS_V3_ONE_PROOF_JOB_INSPECTION_FAILED:exit=${child.status}`);
  }
} else {
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_V3_ONE_PROOF_NO_ACCEPTED_JOB_ID",
    generation_submission_outcome: submissionOutcome,
    approval_still_unused: approvalStillUnused,
    read_only: true,
    generation_submitted: false,
    secrets_printed: false,
  }));
}
