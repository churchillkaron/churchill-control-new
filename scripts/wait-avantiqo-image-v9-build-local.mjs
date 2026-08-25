import { spawnSync } from "node:child_process";

const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EXPECTED_REVISION = "AVANTIQO_IMAGE_WORKER_IMAGE_V9_Z_IMAGE_DEFAULT_ROUTING_V1";
const EXPECTED_ENTRYPOINT = "handler_v9.py";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V4";
const EXPECTED_FOUNDATION = "Tongyi-MAI/Z-Image";
const EXPECTED_ROUTING = "AVANTIQO_IMAGE_Z_IMAGE_DEFAULT_GENERATION_ROUTING_V1";
const POLL_MS = Math.max(10_000, Number(process.env.AVANTIQO_IMAGE_V9_BUILD_WAIT_POLL_MS || 20_000));
const MAX_WAIT_MS = Math.max(POLL_MS, Number(process.env.AVANTIQO_IMAGE_V9_BUILD_WAIT_TIMEOUT_MS || 20 * 60 * 1000));

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
  return JSON.parse(command("git", ["show", `origin/main:${EVIDENCE_PATH}`], "AVANTIQO_IMAGE_V9_BUILD_WAIT_EVIDENCE_READ_FAILED"));
}
function ready(evidence) {
  return evidence?.success === true &&
    text(evidence?.contract) === "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4" &&
    text(evidence?.evidence_revision) === EXPECTED_REVISION &&
    evidence?.source_sha_matches_trigger === true &&
    text(evidence?.entrypoint) === EXPECTED_ENTRYPOINT &&
    text(evidence?.runtime_revision) === EXPECTED_RUNTIME &&
    text(evidence?.configured_generation_foundation) === EXPECTED_FOUNDATION &&
    text(evidence?.default_generation_routing_contract) === EXPECTED_ROUTING &&
    evidence?.default_generation_routing_enabled === true &&
    text(evidence?.photoreal_candidate_foundation) === EXPECTED_FOUNDATION &&
    evidence?.photoreal_antitext_policy_applied === true &&
    /^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(text(evidence?.immutable_image_reference)) &&
    evidence?.provider_job_submitted === false &&
    evidence?.image_generation_submitted === false &&
    evidence?.model_download_submitted === false &&
    evidence?.production_web_deploy === false;
}

console.log("AVANTIQO_IMAGE_V9_BUILD_WAIT_MODE=READ_ONLY");
console.log("AVANTIQO_IMAGE_V9_BUILD_WAIT_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_V9_BUILD_WAIT_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_V9_BUILD_WAIT_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_V9_BUILD_WAIT_SECRETS_PRINTED=false");

const startedAt = Date.now();
let evidence = null;
while (Date.now() - startedAt < MAX_WAIT_MS) {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_V9_BUILD_WAIT_FETCH_FAILED");
  const current = readOriginEvidence();
  const isReady = ready(current);
  console.log(JSON.stringify({
    event: "AVANTIQO_IMAGE_V9_BUILD_WAIT_PROGRESS",
    elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
    evidence_ready: isReady,
    evidence_revision: text(current?.evidence_revision) || null,
    entrypoint: text(current?.entrypoint) || null,
    source_sha: text(current?.source_sha) || null,
    github_run_id: text(current?.github_run_id) || null,
  }));
  if (isReady) {
    evidence = current;
    break;
  }
  await sleep(POLL_MS);
}
if (!evidence) throw new Error(`AVANTIQO_IMAGE_V9_BUILD_WAIT_TIMEOUT:${MAX_WAIT_MS}`);

console.log(`AVANTIQO_IMAGE_V9_BUILD_WAIT_SOURCE_SHA=${text(evidence.source_sha)}`);
console.log(`AVANTIQO_IMAGE_V9_BUILD_WAIT_GITHUB_RUN_ID=${text(evidence.github_run_id)}`);
console.log(`AVANTIQO_IMAGE_V9_BUILD_WAIT_IMMUTABLE_IMAGE=${text(evidence.immutable_image_reference)}`);
console.log("AVANTIQO_IMAGE_V9_BUILD_WAIT_READY=true");
console.log("AVANTIQO_IMAGE_V9_BUILD_WAIT_NEXT_ACTION=SYNC_MAIN_AND_RUN_V9_REBIND_PLAN");
