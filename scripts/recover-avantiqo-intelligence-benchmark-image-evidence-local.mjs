import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const CONTRACT = "AVANTIQO_INTELLIGENCE_BENCHMARK_IMAGE_EVIDENCE_RECOVERY_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-intelligence-benchmark-image.json";
const REPOSITORY = "churchillkaron/churchill-control-new";

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

function currentMain() {
  run("git", ["fetch", "origin", "main"], "BENCHMARK_IMAGE_RECOVERY_GIT_FETCH_FAILED");
  const branch = run("git", ["branch", "--show-current"], "BENCHMARK_IMAGE_RECOVERY_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`BENCHMARK_IMAGE_RECOVERY_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = run("git", ["rev-parse", "HEAD"], "BENCHMARK_IMAGE_RECOVERY_GIT_HEAD_FAILED");
  const remote = run("git", ["rev-parse", "origin/main"], "BENCHMARK_IMAGE_RECOVERY_GIT_REMOTE_FAILED");
  if (head !== remote) {
    throw new Error(`BENCHMARK_IMAGE_RECOVERY_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return head;
}

const mainCommit = currentMain();
run("gh", ["auth", "status"], "BENCHMARK_IMAGE_RECOVERY_GITHUB_AUTH_REQUIRED");

const runId = Number(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_IMAGE_RECOVER_RUN_ID || 0);
if (!Number.isInteger(runId) || runId <= 0) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_IMAGE_RECOVER_RUN_ID_REQUIRED");
}

const runInfo = JSON.parse(run(
  "gh",
  [
    "run",
    "view",
    String(runId),
    "--repo",
    REPOSITORY,
    "--json",
    "databaseId,status,conclusion,displayTitle,headSha,event",
  ],
  "BENCHMARK_IMAGE_RECOVERY_RUN_VIEW_FAILED",
));

if (Number(runInfo.databaseId) !== runId) throw new Error("BENCHMARK_IMAGE_RECOVERY_RUN_ID_MISMATCH");
if (runInfo.status !== "completed" || runInfo.conclusion !== "success") {
  throw new Error(`BENCHMARK_IMAGE_RECOVERY_RUN_NOT_SUCCESSFUL:${runInfo.status}:${runInfo.conclusion || "UNKNOWN"}`);
}
if (runInfo.event !== "workflow_dispatch") throw new Error(`BENCHMARK_IMAGE_RECOVERY_EVENT_INVALID:${runInfo.event}`);

const prefix = "Avantiqo Intelligence benchmark image ";
const title = text(runInfo.displayTitle, 1000);
if (!title.startsWith(prefix)) throw new Error("BENCHMARK_IMAGE_RECOVERY_DISPLAY_TITLE_INVALID");
const nonce = title.slice(prefix.length).trim();
if (!nonce.startsWith("benchmark-")) throw new Error("BENCHMARK_IMAGE_RECOVERY_NONCE_INVALID");

const shortSha = text(runInfo.headSha, 40).slice(0, 12);
const artifactName = `avantiqo-intelligence-benchmark-image-${shortSha}`;
const tempRoot = join("/tmp", `avantiqo-intelligence-benchmark-image-recover-${runId}`);
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

run(
  "gh",
  [
    "run",
    "download",
    String(runId),
    "--repo",
    REPOSITORY,
    "--name",
    artifactName,
    "--dir",
    tempRoot,
  ],
  "BENCHMARK_IMAGE_RECOVERY_ARTIFACT_DOWNLOAD_FAILED",
);

const evidenceSource = join(tempRoot, "evidence.json");
const evidence = JSON.parse(readFileSync(evidenceSource, "utf8"));
if (
  evidence?.success !== true ||
  evidence?.contract !== "AVANTIQO_INTELLIGENCE_BENCHMARK_IMAGE_RESULT_V1" ||
  evidence?.request_nonce !== nonce ||
  evidence?.source_sha !== runInfo.headSha ||
  evidence?.source_sha_matches_trigger !== true ||
  evidence?.worker_contract !== "AVANTIQO_INTELLIGENCE_BENCHMARK_WORKER_V1" ||
  evidence?.foundation_model !== "Qwen/Qwen3-30B-A3B-Thinking-2507" ||
  evidence?.canonical_case_count !== 60 ||
  evidence?.provider_job_submitted !== false ||
  evidence?.runpod_endpoint_mutated !== false ||
  evidence?.production_model_promoted !== false ||
  evidence?.production_web_deploy !== false ||
  !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(evidence?.immutable_image_reference, 1200))
) {
  throw new Error("BENCHMARK_IMAGE_RECOVERY_EVIDENCE_INVALID");
}

mkdirSync("audits/results", { recursive: true });
writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_BENCHMARK_IMAGE_EVIDENCE_RECOVERED",
  success: true,
  main_commit: mainCommit,
  run_id: runId,
  source_sha: evidence.source_sha,
  immutable_image_reference: evidence.immutable_image_reference,
  evidence_path: EVIDENCE_PATH,
  image_rebuilt: false,
  provider_job_submitted: false,
  runpod_endpoint_mutated: false,
  production_model_promoted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_IMAGE_EVIDENCE_RECOVERY=PASS");
