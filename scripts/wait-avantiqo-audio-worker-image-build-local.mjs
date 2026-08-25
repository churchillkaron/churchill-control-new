import { spawnSync } from "node:child_process";

const REQUEST_PATH = "audits/avantiqo-audio-worker-image-request.json";
const EVIDENCE_PATH = "audits/results/avantiqo-audio-worker-image.json";
const DOCKERFILE_PATH = "services/avantiqo-audio-engine/Dockerfile";
const ENTRYPOINT_PATH = "services/avantiqo-audio-engine/entrypoint.py";
const EXPECTED_CONTRACT = "AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V3";
const EXPECTED_VARIANT = "acestep-v15-xl-turbo";
const EXPECTED_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const EXPECTED_LM_MODEL = "acestep-5Hz-lm-1.7B";
const EXPECTED_LM_BACKEND = "vllm";
const POLL_MS = Math.max(
  10_000,
  Number(process.env.AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_POLL_MS || 20_000),
);
const MAX_WAIT_MS = Math.max(
  POLL_MS,
  Number(process.env.AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_TIMEOUT_MS || 20 * 60 * 1000),
);

const text = (value) => String(value ?? "").trim();
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function command(name, args, label) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${label}:${text(result.stderr || result.stdout).slice(0, 800) || `exit=${result.status}`}`,
    );
  }
  return text(result.stdout);
}

function latestRequestSha() {
  const sha = command(
    "git",
    ["log", "-1", "--format=%H", "origin/main", "--", REQUEST_PATH],
    "AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_REQUEST_SHA_FAILED",
  );
  if (!/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_REQUEST_SHA_INVALID");
  }
  return sha;
}

function readOriginJson(path) {
  return JSON.parse(
    command(
      "git",
      ["show", `origin/main:${path}`],
      "AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_EVIDENCE_READ_FAILED",
    ),
  );
}

function assertRequestedSourceContainsCacheRepair(requestSha) {
  const dockerfile = command(
    "git",
    ["show", `${requestSha}:${DOCKERFILE_PATH}`],
    "AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_DOCKERFILE_READ_FAILED",
  );
  const entrypoint = command(
    "git",
    ["show", `${requestSha}:${ENTRYPOINT_PATH}`],
    "AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_ENTRYPOINT_READ_FAILED",
  );
  if (!dockerfile.includes("AVANTIQO_AUDIO_CACHE_INTEGRITY_SMOKE=PASS")) {
    throw new Error("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_CACHE_SMOKE_NOT_IN_REQUEST_SOURCE");
  }
  if (!dockerfile.includes('/app/entrypoint.py')) {
    throw new Error("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_GUARDED_ENTRYPOINT_NOT_IN_REQUEST_SOURCE");
  }
  if (!entrypoint.includes("repair_incomplete_sharded_checkpoint")) {
    throw new Error("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_CACHE_REPAIR_NOT_IN_REQUEST_SOURCE");
  }
  if (!entrypoint.includes("force=True")) {
    throw new Error("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_FORCE_RESUME_NOT_IN_REQUEST_SOURCE");
  }
}

function ready(evidence, requestSha) {
  return evidence?.success === true &&
    text(evidence?.contract) === EXPECTED_CONTRACT &&
    text(evidence?.build_job_result) === "success" &&
    text(evidence?.preflight_outcome) === "success" &&
    text(evidence?.build_outcome) === "success" &&
    evidence?.source_sha_matches_trigger === true &&
    text(evidence?.source_sha) === requestSha &&
    text(evidence?.trigger_sha) === requestSha &&
    text(evidence?.runtime_variant) === EXPECTED_VARIANT &&
    text(evidence?.quality_profile) === EXPECTED_PROFILE &&
    text(evidence?.lm_model) === EXPECTED_LM_MODEL &&
    text(evidence?.lm_backend) === EXPECTED_LM_BACKEND &&
    evidence?.ace_step_lm_required === true &&
    evidence?.xl_model_contract_passed_by_docker_build === true &&
    evidence?.lm_contract_passed_by_docker_build === true &&
    evidence?.cuda_import_smoke_passed_by_docker_build === true &&
    evidence?.native_audio_import_smoke_passed_by_docker_build === true &&
    /^ghcr\.io\/churchillkaron\/avantiqo-audio-worker:sha-[a-f0-9]{12}$/i.test(text(evidence?.image_tag)) &&
    /^ghcr\.io\/churchillkaron\/avantiqo-audio-worker@sha256:[a-f0-9]{64}$/i.test(text(evidence?.immutable_image_reference)) &&
    evidence?.provider_job_submitted === false &&
    evidence?.production_web_deploy === false &&
    evidence?.pricing_activation_performed === false;
}

console.log("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_MODE=READ_ONLY");
console.log("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_SECRETS_PRINTED=false");

const startedAt = Date.now();
let evidence = null;
let requestSha = null;
while (Date.now() - startedAt < MAX_WAIT_MS) {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_FETCH_FAILED");
  requestSha = latestRequestSha();
  assertRequestedSourceContainsCacheRepair(requestSha);
  const current = readOriginJson(EVIDENCE_PATH);
  const isReady = ready(current, requestSha);
  console.log(JSON.stringify({
    event: "AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_PROGRESS",
    elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
    evidence_ready: isReady,
    request_sha: requestSha,
    evidence_source_sha: text(current?.source_sha) || null,
    github_run_id: text(current?.github_run_id) || null,
    build_job_result: text(current?.build_job_result) || null,
  }));
  if (isReady) {
    evidence = current;
    break;
  }
  await sleep(POLL_MS);
}

if (!evidence) {
  throw new Error(`AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_TIMEOUT:${MAX_WAIT_MS}`);
}

console.log(`AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_SOURCE_SHA=${text(evidence.source_sha)}`);
console.log(`AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_GITHUB_RUN_ID=${text(evidence.github_run_id)}`);
console.log(`AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_IMAGE_TAG=${text(evidence.image_tag)}`);
console.log(`AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_IMMUTABLE_IMAGE=${text(evidence.immutable_image_reference)}`);
console.log("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_CACHE_REPAIR_SOURCE=VERIFIED");
console.log("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_READY=true");
console.log("AVANTIQO_AUDIO_IMAGE_BUILD_WAIT_NEXT_ACTION=SYNC_MAIN_AND_RUN_AUDIO_REBIND_PLAN");
