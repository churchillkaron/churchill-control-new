import { spawnSync } from "node:child_process";

const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EXPECTED_REVISION = "AVANTIQO_IMAGE_WORKER_IMAGE_V7_REALISM_COMPILER_V1";
const EXPECTED_ENTRYPOINT = "handler_v7.py";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V2";
const POLL_MS = Math.max(10_000, Number(process.env.AVANTIQO_IMAGE_V7_BUILD_WAIT_POLL_MS || 20_000));
const MAX_WAIT_MS = Math.max(POLL_MS, Number(process.env.AVANTIQO_IMAGE_V7_BUILD_WAIT_TIMEOUT_MS || 20 * 60 * 1000));

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
    throw new Error(`${label}:${text(result.stderr || result.stdout).slice(0, 800) || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}
function readOriginEvidence() {
  const raw = command("git", ["show", `origin/main:${EVIDENCE_PATH}`], "AVANTIQO_IMAGE_V7_BUILD_WAIT_EVIDENCE_READ_FAILED");
  const evidence = JSON.parse(raw);
  return evidence;
}
function isReady(evidence) {
  return (
    evidence?.success === true &&
    text(evidence?.contract) === "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4" &&
    text(evidence?.evidence_revision) === EXPECTED_REVISION &&
    evidence?.source_sha_matches_trigger === true &&
    text(evidence?.entrypoint) === EXPECTED_ENTRYPOINT &&
    text(evidence?.runtime_revision) === EXPECTED_RUNTIME &&
    /^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(text(evidence?.immutable_image_reference)) &&
    evidence?.provider_job_submitted === false &&
    evidence?.image_generation_submitted === false &&
    evidence?.model_download_submitted === false &&
    evidence?.production_web_deploy === false
  );
}

console.log("AVANTIQO_IMAGE_V7_BUILD_WAIT_MODE=READ_ONLY");
console.log("AVANTIQO_IMAGE_V7_BUILD_WAIT_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_V7_BUILD_WAIT_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_V7_BUILD_WAIT_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_V7_BUILD_WAIT_SECRETS_PRINTED=false");

const startedAt = Date.now();
let readyEvidence = null;
while (Date.now() - startedAt < MAX_WAIT_MS) {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_V7_BUILD_WAIT_FETCH_FAILED");
  const evidence = readOriginEvidence();
  const ready = isReady(evidence);
  console.log(JSON.stringify({
    event: "AVANTIQO_IMAGE_V7_BUILD_WAIT_PROGRESS",
    elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
    evidence_ready: ready,
    evidence_revision: text(evidence?.evidence_revision) || null,
    entrypoint: text(evidence?.entrypoint) || null,
    source_sha: text(evidence?.source_sha) || null,
    github_run_id: text(evidence?.github_run_id) || null,
  }));
  if (ready) {
    readyEvidence = evidence;
    break;
  }
  await sleep(POLL_MS);
}

if (!readyEvidence) throw new Error(`AVANTIQO_IMAGE_V7_BUILD_WAIT_TIMEOUT:${MAX_WAIT_MS}`);

console.log(`AVANTIQO_IMAGE_V7_BUILD_WAIT_SOURCE_SHA=${text(readyEvidence.source_sha)}`);
console.log(`AVANTIQO_IMAGE_V7_BUILD_WAIT_GITHUB_RUN_ID=${text(readyEvidence.github_run_id)}`);
console.log(`AVANTIQO_IMAGE_V7_BUILD_WAIT_IMMUTABLE_IMAGE=${text(readyEvidence.immutable_image_reference)}`);
console.log("AVANTIQO_IMAGE_V7_BUILD_WAIT_READY=true");
console.log("AVANTIQO_IMAGE_V7_BUILD_WAIT_NEXT_ACTION=SYNC_MAIN_AND_RUN_REBIND_PLAN");
