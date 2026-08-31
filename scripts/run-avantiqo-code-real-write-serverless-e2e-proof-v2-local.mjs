import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_SERVERLESS_E2E_PROOF_V2_LAUNCHER";
const BASE_SCRIPT = "scripts/run-avantiqo-code-real-write-serverless-e2e-proof-v1-local.mjs";
const IN_QUEUE_NO_WORKER_TIMEOUT_MS = 120_000;
const TOTAL_GENERATION_TIMEOUT_MS = 5 * 60_000;

function text(value, maximum = 8_000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function patchOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${CONTRACT}_${label}_MARKER_REQUIRED`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${CONTRACT}_${label}_MARKER_AMBIGUOUS`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function run(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(String), {
      cwd,
      env,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(Number.isInteger(code) ? code : 1));
  });
}

if (text(process.env.NODE_ENV).toLowerCase() === "production") {
  throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
}

const repositoryRoot = path.resolve(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT || process.cwd());
const basePath = path.join(repositoryRoot, BASE_SCRIPT);
let source = await readFile(basePath, "utf8");

source = patchOnce(
  source,
  "const GENERATION_TIMEOUT_MS = 15 * 60_000;",
  `const GENERATION_TIMEOUT_MS = ${TOTAL_GENERATION_TIMEOUT_MS};\nconst IN_QUEUE_NO_WORKER_TIMEOUT_MS = ${IN_QUEUE_NO_WORKER_TIMEOUT_MS};`,
  "TIMEOUT",
);

source = patchOnce(
  source,
  "  let lastStatus = \"\";\n  while (Date.now() < deadline) {",
  "  let lastStatus = \"\";\n  let inQueueWithoutWorkerSince = 0;\n  while (Date.now() < deadline) {",
  "QUEUE_STALL_STATE",
);

source = patchOnce(
  source,
  "    if (TERMINAL.has(status)) {\n      activeJobTerminal = true;\n      if (status !== \"COMPLETED\") throw new Error(`${CONTRACT}_GENERATION_${status}:${text(body?.error || body?.output?.error, 800) || \"UNKNOWN\"}`);\n      if (!body?.output || typeof body.output !== \"object\") throw new Error(`${CONTRACT}_GENERATION_OUTPUT_REQUIRED`);\n      return body.output;\n    }\n    await sleep(POLL_MS);",
  "    if (TERMINAL.has(status)) {\n      activeJobTerminal = true;\n      if (status !== \"COMPLETED\") throw new Error(`${CONTRACT}_GENERATION_${status}:${text(body?.error || body?.output?.error, 800) || \"UNKNOWN\"}`);\n      if (!body?.output || typeof body.output !== \"object\") throw new Error(`${CONTRACT}_GENERATION_OUTPUT_REQUIRED`);\n      return body.output;\n    }\n    if (status === \"IN_QUEUE\") {\n      const capacityHealth = await queueHealth().catch(() => null);\n      if (capacityHealth && !hasWorkers(capacityHealth)) {\n        if (!inQueueWithoutWorkerSince) inQueueWithoutWorkerSince = Date.now();\n        const stalledMs = Date.now() - inQueueWithoutWorkerSince;\n        if (stalledMs >= IN_QUEUE_NO_WORKER_TIMEOUT_MS) {\n          const cancelled = await cancelActiveJob();\n          console.log(JSON.stringify({\n            event: `${CONTRACT}_PROGRESS`,\n            phase: \"SERVERLESS_CAPACITY_STALL_ABORT\",\n            status,\n            stalled_ms: stalledMs,\n            zero_workers_observed: true,\n            job_cancelled: cancelled,\n            inference_performed: false,\n            volume_mutation_performed: false,\n            production_deploy_performed: false,\n            secrets_printed: false,\n          }));\n          throw new Error(`${CONTRACT}_SERVERLESS_CAPACITY_STALLED_NO_WORKER`);\n        }\n      } else {\n        inQueueWithoutWorkerSince = 0;\n      }\n    } else {\n      inQueueWithoutWorkerSince = 0;\n    }\n    await sleep(POLL_MS);",
  "QUEUE_STALL_GUARD",
);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "avantiqo-code-serverless-proof-v2-"));
const tempScript = path.join(tempRoot, "proof.mjs");
await writeFile(tempScript, source, "utf8");

console.log(JSON.stringify({
  event: `${CONTRACT}_START`,
  base_script: BASE_SCRIPT,
  in_queue_no_worker_timeout_ms: IN_QUEUE_NO_WORKER_TIMEOUT_MS,
  total_generation_timeout_ms: TOTAL_GENERATION_TIMEOUT_MS,
  cancel_stalled_job_required: true,
  zero_idle_restore_required: true,
  same_canonical_storage_required: true,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

let exitCode = 1;
try {
  exitCode = await run(process.execPath, [tempScript], repositoryRoot, {
    ...process.env,
    NODE_ENV: "development",
  });
} finally {
  await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}

if (exitCode !== 0) process.exit(exitCode);
console.log(`${CONTRACT}=PASS`);
