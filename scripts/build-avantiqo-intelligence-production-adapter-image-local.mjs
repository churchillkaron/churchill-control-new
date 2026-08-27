import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const CONTRACT = "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_LOCAL_BUILD_V1";
const WORKFLOW = "avantiqo-intelligence-production-adapter-image.yml";
const EVIDENCE_PATH = "audits/results/avantiqo-intelligence-production-adapter-image.json";
const REPOSITORY = "churchillkaron/churchill-control-new";
const POLL_MS = 5000;
const MAX_POLLS = 720;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label}:exit=${result.status}:${text(result.stderr || result.stdout, 1200)}`);
  }
  return text(result.stdout, 120000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentMain() {
  run("git", ["fetch", "origin", "main"], "PRODUCTION_ADAPTER_IMAGE_GIT_FETCH_FAILED");
  const branch = run("git", ["branch", "--show-current"], "PRODUCTION_ADAPTER_IMAGE_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`PRODUCTION_ADAPTER_IMAGE_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }
  const head = run("git", ["rev-parse", "HEAD"], "PRODUCTION_ADAPTER_IMAGE_GIT_HEAD_FAILED");
  const remote = run("git", ["rev-parse", "origin/main"], "PRODUCTION_ADAPTER_IMAGE_GIT_REMOTE_FAILED");
  if (head !== remote) {
    throw new Error(`PRODUCTION_ADAPTER_IMAGE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return head;
}

function validateEvidence(evidence, { nonce, headSha }) {
  if (
    evidence?.success !== true ||
    evidence?.contract !== "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_RESULT_V1" ||
    evidence?.request_nonce !== nonce ||
    evidence?.source_sha !== headSha ||
    evidence?.source_sha_matches_trigger !== true ||
    evidence?.startup_contract !== "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_STARTUP_V2" ||
    evidence?.foundation_model !== "Qwen/Qwen3-30B-A3B-Thinking-2507" ||
    evidence?.adapter_layout !== "MOE_3D_FUSED_PEFT" ||
    evidence?.adapter_serialization !== "PEFT_FUSED_EXPERT_FACTORS_2D" ||
    evidence?.exact_candidate_adapter_inspector_reused !== true ||
    evidence?.adapter_artifact_embedded !== false ||
    evidence?.production_adapter_enabled_by_default !== false ||
    evidence?.explicit_release_binder_required !== true ||
    evidence?.fast_lane_effect !== "NONE" ||
    evidence?.provider_job_submitted !== false ||
    evidence?.inference_performed !== false ||
    evidence?.training_started !== false ||
    evidence?.runpod_endpoint_mutated !== false ||
    evidence?.production_model_promoted !== false ||
    evidence?.automatic_production_promotion !== false ||
    evidence?.production_web_deploy !== false ||
    !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(evidence?.immutable_image_reference, 1200))
  ) {
    throw new Error("PRODUCTION_ADAPTER_IMAGE_EVIDENCE_INVALID");
  }
}

const mainCommit = currentMain();
run("gh", ["auth", "status"], "PRODUCTION_ADAPTER_IMAGE_GITHUB_AUTH_REQUIRED");

const nonce = `production-adapter-${Date.now()}-${randomUUID().slice(0, 8)}`;
run(
  "gh",
  [
    "workflow",
    "run",
    WORKFLOW,
    "--repo",
    REPOSITORY,
    "--ref",
    "main",
    "-f",
    `request_nonce=${nonce}`,
  ],
  "PRODUCTION_ADAPTER_IMAGE_WORKFLOW_DISPATCH_FAILED",
);

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_DISPATCHED",
  main_commit: mainCommit,
  request_nonce: nonce,
  provider_job_submitted: false,
  inference_performed: false,
  runpod_endpoint_mutated: false,
  production_model_promoted: false,
  fast_lane_effect: "NONE",
  secrets_printed: false,
}, null, 2));

let runInfo = null;
for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
  const raw = run(
    "gh",
    [
      "run",
      "list",
      "--repo",
      REPOSITORY,
      "--workflow",
      WORKFLOW,
      "--event",
      "workflow_dispatch",
      "--limit",
      "30",
      "--json",
      "databaseId,status,conclusion,displayTitle,headSha,createdAt",
    ],
    "PRODUCTION_ADAPTER_IMAGE_WORKFLOW_LIST_FAILED",
  );
  const rows = JSON.parse(raw || "[]");
  runInfo = rows.find((row) => text(row.displayTitle, 500).includes(nonce)) || null;
  if (runInfo) {
    if (poll === 1 || poll % 6 === 0 || runInfo.status === "completed") {
      console.log(JSON.stringify({
        contract: CONTRACT,
        event: "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_PROGRESS",
        poll,
        run_id: runInfo.databaseId,
        status: runInfo.status,
        conclusion: runInfo.conclusion || null,
        head_sha: runInfo.headSha,
        provider_job_submitted: false,
        inference_performed: false,
        runpod_endpoint_mutated: false,
        production_model_promoted: false,
        secrets_printed: false,
      }, null, 2));
    }
    if (runInfo.status === "completed") break;
  }
  if (poll < MAX_POLLS) await sleep(POLL_MS);
}

if (!runInfo || runInfo.status !== "completed") {
  throw new Error("PRODUCTION_ADAPTER_IMAGE_WORKFLOW_TIMEOUT");
}
if (runInfo.conclusion !== "success") {
  throw new Error(
    `PRODUCTION_ADAPTER_IMAGE_WORKFLOW_FAILED:${runInfo.conclusion || "UNKNOWN"}:run=${runInfo.databaseId}`,
  );
}

const shortSha = text(runInfo.headSha, 40).slice(0, 12);
const artifactName = `avantiqo-intelligence-production-adapter-image-${shortSha}`;
const tempRoot = join("/tmp", `avantiqo-intelligence-production-adapter-image-${nonce}`);
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });
run(
  "gh",
  [
    "run",
    "download",
    String(runInfo.databaseId),
    "--repo",
    REPOSITORY,
    "--name",
    artifactName,
    "--dir",
    tempRoot,
  ],
  "PRODUCTION_ADAPTER_IMAGE_ARTIFACT_DOWNLOAD_FAILED",
);

const evidenceSource = join(tempRoot, "evidence.json");
const evidence = JSON.parse(readFileSync(evidenceSource, "utf8"));
validateEvidence(evidence, { nonce, headSha: runInfo.headSha });

mkdirSync("audits/results", { recursive: true });
writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_READY",
  success: true,
  run_id: runInfo.databaseId,
  source_sha: evidence.source_sha,
  immutable_image_reference: evidence.immutable_image_reference,
  evidence_path: EVIDENCE_PATH,
  provider_job_submitted: false,
  inference_performed: false,
  runpod_endpoint_mutated: false,
  production_model_promoted: false,
  fast_lane_effect: "NONE",
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_LOCAL_BUILD=PASS");
