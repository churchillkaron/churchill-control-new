import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_SERVERLESS_E2E_PROOF_V3_LAUNCHER";
const BASE_SCRIPT = "scripts/run-avantiqo-code-real-write-serverless-e2e-proof-v1-local.mjs";
const IN_QUEUE_NO_WORKER_TIMEOUT_MS = 60_000;
const TOTAL_GENERATION_TIMEOUT_MS = 3 * 60_000;

function text(value, maximum = 8_000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function patchOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${CONTRACT}_${label}_MARKER_REQUIRED`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${CONTRACT}_${label}_MARKER_AMBIGUOUS`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function run(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(String), { cwd, env, stdio: "inherit", shell: false });
    let interruptedSignal = "";
    const keepParentAliveForCleanup = (signal) => {
      interruptedSignal = signal;
      console.log(JSON.stringify({ event: `${CONTRACT}_SIGNAL_FORWARDED`, signal, child_cleanup_required: true, secrets_printed: false }));
    };
    process.once("SIGINT", keepParentAliveForCleanup);
    process.once("SIGTERM", keepParentAliveForCleanup);
    child.on("error", (error) => {
      process.removeListener("SIGINT", keepParentAliveForCleanup);
      process.removeListener("SIGTERM", keepParentAliveForCleanup);
      reject(error);
    });
    child.on("close", (code, signal) => {
      process.removeListener("SIGINT", keepParentAliveForCleanup);
      process.removeListener("SIGTERM", keepParentAliveForCleanup);
      if (interruptedSignal || signal) return resolve(interruptedSignal === "SIGTERM" || signal === "SIGTERM" ? 143 : 130);
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

if (text(process.env.NODE_ENV).toLowerCase() === "production") throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
const repositoryRoot = path.resolve(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT || process.cwd());
let source = await readFile(path.join(repositoryRoot, BASE_SCRIPT), "utf8");

source = patchOnce(source, "const GENERATION_TIMEOUT_MS = 15 * 60_000;", `const GENERATION_TIMEOUT_MS = ${TOTAL_GENERATION_TIMEOUT_MS};\nconst IN_QUEUE_NO_WORKER_TIMEOUT_MS = ${IN_QUEUE_NO_WORKER_TIMEOUT_MS};`, "TIMEOUT");
source = patchOnce(source, "  let lastStatus = \"\";\n  while (Date.now() < deadline) {", "  let lastStatus = \"\";\n  let inQueueWithoutWorkerSince = 0;\n  while (Date.now() < deadline) {", "QUEUE_STALL_STATE");
source = patchOnce(
  source,
  "    if (TERMINAL.has(status)) {\n      activeJobTerminal = true;\n      if (status !== \"COMPLETED\") throw new Error(`${CONTRACT}_GENERATION_${status}:${text(body?.error || body?.output?.error, 800) || \"UNKNOWN\"}`);\n      if (!body?.output || typeof body.output !== \"object\") throw new Error(`${CONTRACT}_GENERATION_OUTPUT_REQUIRED`);\n      return body.output;\n    }\n    await sleep(POLL_MS);",
  "    if (TERMINAL.has(status)) {\n      activeJobTerminal = true;\n      if (status !== \"COMPLETED\") throw new Error(`${CONTRACT}_GENERATION_${status}:${text(body?.error || body?.output?.error, 800) || \"UNKNOWN\"}`);\n      if (!body?.output || typeof body.output !== \"object\") throw new Error(`${CONTRACT}_GENERATION_OUTPUT_REQUIRED`);\n      return body.output;\n    }\n    if (status === \"IN_QUEUE\") {\n      const capacityHealth = await queueHealth().catch(() => null);\n      if (capacityHealth && !hasWorkers(capacityHealth)) {\n        if (!inQueueWithoutWorkerSince) inQueueWithoutWorkerSince = Date.now();\n        const stalledMs = Date.now() - inQueueWithoutWorkerSince;\n        if (stalledMs >= IN_QUEUE_NO_WORKER_TIMEOUT_MS) {\n          const cancelled = await cancelActiveJob();\n          console.log(JSON.stringify({ event: `${CONTRACT}_PROGRESS`, phase: \"SERVERLESS_CAPACITY_STALL_ABORT\", stalled_ms: stalledMs, zero_workers_observed: true, job_cancelled: cancelled, inference_performed: false, secrets_printed: false }));\n          throw new Error(`${CONTRACT}_SERVERLESS_CAPACITY_STALLED_NO_WORKER`);\n        }\n      } else {\n        inQueueWithoutWorkerSince = 0;\n      }\n    } else {\n      inQueueWithoutWorkerSince = 0;\n    }\n    await sleep(POLL_MS);",
  "QUEUE_STALL_GUARD",
);

source = patchOnce(
  source,
  "  if (after.volume_ids.length !== 1 || after.volume_ids[0] !== canonicalVolumeId) {\n    throw new Error(`${CONTRACT}_${phase}_STORAGE_BINDING_CHANGED`);\n  }",
  "  if (after.volume_ids.length !== 0) {\n    throw new Error(`${CONTRACT}_${phase}_GLOBAL_SCHEDULING_VOLUME_REATTACHED`);\n  }",
  "DETACHED_STORAGE_CAPACITY_GUARD",
);

source = patchOnce(
  source,
  "  const volumeIds = endpointVolumeIds(matches[0]);\n  if (volumeIds.length !== 1) throw new Error(`${CONTRACT}_CODE_ENDPOINT_SINGLE_STORAGE_REQUIRED:${volumeIds.length}`);\n  canonicalVolumeId = volumeIds[0];\n  const volumeMatches = rows(volumesRaw, [\"networkVolumes\"]).filter((entry) => text(entry?.id, 240) === canonicalVolumeId);\n  if (volumeMatches.length !== 1) throw new Error(`${CONTRACT}_CANONICAL_VOLUME_RESOLUTION:${volumeMatches.length}`);\n  canonicalVolumeName = text(volumeMatches[0]?.name, 240);\n  canonicalDataCenterId = text(volumeMatches[0]?.dataCenterId ?? volumeMatches[0]?.data_center_id, 240);\n  if (!/avantiqo.*code.*cache/i.test(canonicalVolumeName)) throw new Error(`${CONTRACT}_CANONICAL_VOLUME_NAME_INVALID:${canonicalVolumeName}`);\n  if (!canonicalDataCenterId) throw new Error(`${CONTRACT}_CANONICAL_VOLUME_DATACENTER_REQUIRED`);",
  "  const attachedVolumeIds = endpointVolumeIds(matches[0]);\n  if (attachedVolumeIds.length !== 0) throw new Error(`${CONTRACT}_GLOBAL_SCHEDULING_ENDPOINT_VOLUME_MUST_BE_DETACHED:${attachedVolumeIds.length}`);\n  const codeVolumes = rows(volumesRaw, [\"networkVolumes\"]).filter((entry) => /avantiqo.*code.*cache/i.test(text(entry?.name, 240)));\n  if (codeVolumes.length !== 1) throw new Error(`${CONTRACT}_ONE_CANONICAL_CODE_STORAGE_REQUIRED:${codeVolumes.length}`);\n  canonicalVolumeId = text(codeVolumes[0]?.id, 240);\n  canonicalVolumeName = text(codeVolumes[0]?.name, 240);\n  canonicalDataCenterId = text(codeVolumes[0]?.dataCenterId ?? codeVolumes[0]?.data_center_id, 240);\n  if (!canonicalVolumeId || !canonicalDataCenterId) throw new Error(`${CONTRACT}_CANONICAL_CODE_STORAGE_METADATA_REQUIRED`);",
  "GLOBAL_STORAGE_DISCOVERY",
);

source = patchOnce(
  source,
  "  if (endpointBefore.volume_ids.length !== 1 || endpointBefore.volume_ids[0] !== canonicalVolumeId) throw new Error(`${CONTRACT}_ENDPOINT_STORAGE_VERIFY_FAILED`);",
  "  if (endpointBefore.volume_ids.length !== 0) throw new Error(`${CONTRACT}_GLOBAL_SCHEDULING_ENDPOINT_STORAGE_VERIFY_FAILED`);",
  "GLOBAL_ENDPOINT_VERIFY",
);

source = source
  .replace("canonical_endpoint_storage_required: true,", "canonical_endpoint_storage_required: false,\n  global_cached_model_scheduling_required: true,")
  .replace("one_storage_only_required: true,", "one_storage_only_required: true,\n  endpoint_volume_detached_required: true,")
  .replace("endpoint_single_storage_verified: true,", "endpoint_single_storage_verified: false,\n    endpoint_volume_detached_verified: true,\n    canonical_standalone_storage_verified: true,");

source = patchOnce(
  source,
  "console.log(JSON.stringify({\n  event: `${CONTRACT}_START`,",
  "let signalCleanupInProgress = false;\nasync function handleTerminationSignal(signal) {\n  if (signalCleanupInProgress) return;\n  signalCleanupInProgress = true;\n  console.log(JSON.stringify({ event: `${CONTRACT}_PROGRESS`, phase: \"TERMINATION_SIGNAL_CLEANUP_START\", signal, active_job_present: Boolean(activeJobId && !activeJobTerminal), secrets_printed: false }));\n  try {\n    const zeroIdle = endpointId ? await restoreZeroIdle() : { restored: true, reason: null };\n    serverlessZeroIdleRestored = zeroIdle.restored === true;\n    console.log(JSON.stringify({ event: `${CONTRACT}_PROGRESS`, phase: \"TERMINATION_SIGNAL_CLEANUP_DONE\", signal, serverless_zero_idle_restored: serverlessZeroIdleRestored, reason: zeroIdle.reason || null, secrets_printed: false }));\n  } catch (error) {\n    console.error(JSON.stringify({ event: `${CONTRACT}_PROGRESS`, phase: \"TERMINATION_SIGNAL_CLEANUP_FAILED\", signal, error: text(error?.message || error, 1200), secrets_printed: false }));\n  } finally {\n    if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => {});\n    process.exit(signal === \"SIGTERM\" ? 143 : 130);\n  }\n}\nprocess.once(\"SIGINT\", () => { void handleTerminationSignal(\"SIGINT\"); });\nprocess.once(\"SIGTERM\", () => { void handleTerminationSignal(\"SIGTERM\"); });\n\nconsole.log(JSON.stringify({\n  event: `${CONTRACT}_START`,",
  "SIGNAL_CLEANUP",
);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "avantiqo-code-serverless-proof-v3-"));
const tempScript = path.join(tempRoot, "proof.mjs");
await writeFile(tempScript, source, "utf8");

console.log(JSON.stringify({
  event: `${CONTRACT}_START`,
  base_script: BASE_SCRIPT,
  scheduling_scope: "GLOBAL_RUNPOD_CACHED_MODEL",
  endpoint_volume_detached_required: true,
  one_canonical_standalone_code_storage_required: true,
  in_queue_no_worker_timeout_ms: IN_QUEUE_NO_WORKER_TIMEOUT_MS,
  total_generation_timeout_ms: TOTAL_GENERATION_TIMEOUT_MS,
  cancel_stalled_job_required: true,
  signal_cleanup_required: true,
  zero_idle_restore_required: true,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

let exitCode = 1;
try {
  exitCode = await run(process.execPath, [tempScript], repositoryRoot, { ...process.env, NODE_ENV: "development" });
} finally {
  await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}
if (exitCode !== 0) process.exit(exitCode);
console.log(`${CONTRACT}=PASS`);
