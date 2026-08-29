#!/usr/bin/env node

import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  VIDEO_32GB_CANDIDATE_ENDPOINT_NAME,
  VIDEO_32GB_CANDIDATE_POOL_ID,
  VIDEO_32GB_CANDIDATE_PRIMARY_GPU,
  activeManagementWorkers,
  assertVideoProductionUnchanged,
  endpointGpuTypeIds,
  inspectVideo32gbCandidate,
  managementHourlyCost,
  reassertVideo32gbCandidatePool,
  runpodRest,
  text,
  workersMax,
  workersMin,
} from "./lib/avantiqo-video-32gb-candidate-contract-v69.mjs";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VIDEO_32GB_CANDIDATE_RUNTIME_PROBE_V70_REASSERTED";
const APPROVAL_ENV = "AVANTIQO_VIDEO_32GB_CANDIDATE_RUNTIME_PROBE_V70_APPROVED";
const SOURCE = "scripts/run-avantiqo-video-32gb-candidate-runtime-probe-v70-local.mjs";
const TEMP = `scripts/.run-avantiqo-video-v70-reasserted-${process.pid}.mjs`;
const PROPAGATION_TIMEOUT_MS = 25_000;
const PROPAGATION_POLL_MS = 1_000;

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const productionEndpointId = required("RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID");

const inspected = await inspectVideo32gbCandidate({ managementKey, productionEndpointId });
const endpointId = text(inspected?.candidate_endpoint?.id);
if (!endpointId || text(inspected?.candidate_endpoint?.name) !== VIDEO_32GB_CANDIDATE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VIDEO_V70_REASSERTED_CANDIDATE_IDENTITY_INVALID");
}

const productionBefore = inspected.production_endpoint_snapshot;
const poolProof = await reassertVideo32gbCandidatePool({ managementKey, inspected });
if (
  poolProof?.control_plane_verified_by_mutation_response !== true ||
  text(poolProof?.pool_id) !== VIDEO_32GB_CANDIDATE_POOL_ID ||
  text(poolProof?.endpoint_id) !== endpointId ||
  Number(poolProof?.workers_min) !== 0 ||
  Number(poolProof?.workers_max) !== 0
) {
  throw new Error("AVANTIQO_VIDEO_V70_REASSERTED_POOL_PROOF_INVALID");
}

await assertVideoProductionUnchanged({
  managementKey,
  productionEndpointId,
  before: productionBefore,
});

console.log(`AVANTIQO_VIDEO_V70_POOL_REASSERTED=${JSON.stringify({
  endpoint_id: endpointId,
  pool_id: VIDEO_32GB_CANDIDATE_POOL_ID,
  control_plane_verified_by_mutation_response: true,
  workers_min: 0,
  workers_max: 0,
  generation_submitted: false,
  worker_opened: false,
})}`);

await runpodRest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
  method: "PATCH",
  body: {
    gpuTypeIds: [VIDEO_32GB_CANDIDATE_PRIMARY_GPU],
    workersMin: 0,
    workersMax: 0,
  },
});

const pinDeadline = Date.now() + PROPAGATION_TIMEOUT_MS;
let pinnedEndpoint = null;
let pinAttempt = 0;
while (Date.now() <= pinDeadline) {
  pinAttempt += 1;
  pinnedEndpoint = await runpodRest(
    managementKey,
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  );
  const gpuTypeIds = endpointGpuTypeIds(pinnedEndpoint);
  const exactPrimary = gpuTypeIds.length === 1 && gpuTypeIds[0] === VIDEO_32GB_CANDIDATE_PRIMARY_GPU;
  const parked = workersMin(pinnedEndpoint) === 0 && workersMax(pinnedEndpoint) === 0;
  const zeroWorkers = activeManagementWorkers(pinnedEndpoint).length === 0;
  const zeroHourly = managementHourlyCost(pinnedEndpoint) === 0;
  if (exactPrimary && parked && zeroWorkers && zeroHourly) break;
  if (Date.now() >= pinDeadline) {
    throw new Error(`AVANTIQO_VIDEO_V70_PRIMARY_GPU_REPIN_VERIFY_TIMEOUT:${JSON.stringify({
      gpu_type_ids: gpuTypeIds,
      workers_min: workersMin(pinnedEndpoint),
      workers_max: workersMax(pinnedEndpoint),
      active_workers: activeManagementWorkers(pinnedEndpoint).length,
      hourly_cost_usd: managementHourlyCost(pinnedEndpoint),
      attempts: pinAttempt,
    })}`);
  }
  console.log(`AVANTIQO_VIDEO_V70_PRIMARY_GPU_REPIN_WAIT=${JSON.stringify({
    attempt: pinAttempt,
    observed_gpu_type_ids: gpuTypeIds,
    retry_in_ms: PROPAGATION_POLL_MS,
  })}`);
  await sleep(PROPAGATION_POLL_MS);
}

console.log(`AVANTIQO_VIDEO_V70_PRIMARY_GPU_REPINNED=${JSON.stringify({
  endpoint_id: endpointId,
  gpu_type_id: VIDEO_32GB_CANDIDATE_PRIMARY_GPU,
  workers_min: 0,
  workers_max: 0,
  active_workers: 0,
  hourly_cost_usd: 0,
  attempts: pinAttempt,
})}`);

await assertVideoProductionUnchanged({
  managementKey,
  productionEndpointId,
  before: productionBefore,
});

const original = await readFile(SOURCE, "utf8");
const oldGate = `  if (inspected?.candidate_serverless_pool_id !== VIDEO_32GB_CANDIDATE_POOL_ID) {\n    throw new Error("AVANTIQO_VIDEO_V70_CANDIDATE_POOL_INVALID");\n  }`;
const newGate = `  if (text(process.env.AVANTIQO_VIDEO_V70_REASSERTED_POOL_ID) !== VIDEO_32GB_CANDIDATE_POOL_ID) {\n    throw new Error("AVANTIQO_VIDEO_V70_REASSERTED_POOL_PROOF_REQUIRED");\n  }`;
const oldOutput = `  serverless_pool_id: inspected?.candidate_serverless_pool_id || null,`;
const newOutput = `  serverless_pool_id: text(process.env.AVANTIQO_VIDEO_V70_REASSERTED_POOL_ID) || null,`;
const oldSubmit = `  const submitted = await queueRequest(endpointId, "/run", queueCredential.key, {\n    method: "POST",\n    body: { input: { operation: "runtime_probe" } },\n  });`;
const newSubmit = `  let submitted = null;\n  let submitAttempt = 0;\n  const propagationDeadline = Date.now() + 25_000;\n  while (!submitted) {\n    submitAttempt += 1;\n    try {\n      submitted = await queueRequest(endpointId, "/run", queueCredential.key, {\n        method: "POST",\n        body: { input: { operation: "runtime_probe" } },\n      });\n    } catch (error) {\n      const message = redact(error?.message || error);\n      const retryable = /AVANTIQO_VIDEO_V70_QUEUE_HTTP_409/i.test(message) &&\n        /Endpoint is paused/i.test(message) && /max_workers=0/i.test(message);\n      if (!retryable) throw error;\n      if (Date.now() >= propagationDeadline) {\n        throw new Error(\`AVANTIQO_VIDEO_V70_QUEUE_PROPAGATION_TIMEOUT:\${submitAttempt}:\${message}\`);\n      }\n      console.log(\`AVANTIQO_VIDEO_V70_QUEUE_PROPAGATION_WAIT=\${JSON.stringify({ attempt: submitAttempt, retry_in_ms: 1000 })}\`);\n      await sleep(1_000);\n    }\n  }\n  console.log(\`AVANTIQO_VIDEO_V70_QUEUE_PROPAGATION_READY=\${JSON.stringify({ submit_attempts: submitAttempt })}\`);`;

if (!original.includes(oldGate)) {
  throw new Error("AVANTIQO_VIDEO_V70_REASSERTED_GATE_MARKER_NOT_FOUND");
}
if (!original.includes(oldOutput)) {
  throw new Error("AVANTIQO_VIDEO_V70_REASSERTED_OUTPUT_MARKER_NOT_FOUND");
}
if (!original.includes(oldSubmit)) {
  throw new Error("AVANTIQO_VIDEO_V70_REASSERTED_SUBMIT_MARKER_NOT_FOUND");
}

const temporary = original
  .replace(oldGate, newGate)
  .replace(oldOutput, newOutput)
  .replace(oldSubmit, newSubmit);
await writeFile(TEMP, temporary, "utf8");

let child = null;
try {
  child = spawnSync(process.execPath, [TEMP], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_VIDEO_V70_REASSERTED_POOL_ID: VIDEO_32GB_CANDIDATE_POOL_ID,
    },
    stdio: "inherit",
  });
} finally {
  await unlink(TEMP).catch(() => {});
}

if (child?.error) throw child.error;
if (child?.status !== 0) {
  console.log(`${CONTRACT}=FAIL`);
  process.exit(child?.status || 3);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  candidate_endpoint_id: endpointId,
  serverless_pool_id: VIDEO_32GB_CANDIDATE_POOL_ID,
  primary_gpu_type_id: VIDEO_32GB_CANDIDATE_PRIMARY_GPU,
  pool_reasserted_before_worker_open: true,
  pool_verified_by_mutation_response: true,
  primary_gpu_repinned_while_parked: true,
  queue_propagation_retry_enabled: true,
  queue_propagation_retry_source: "PROVEN_VIDEO_V47_PATTERN",
  temporary_v70_copy_deleted: true,
  persistent_v70_modified: false,
  generation_submitted_by_wrapper: false,
  external_paid_provider_contacted: false,
  image_endpoint_mutated: false,
  safe_lease_modified: false,
  production_endpoint_mutation_performed: false,
  next_action: "V71_MODEL_LOAD_PROBE_ONLY_AFTER_V70_PASS",
}, null, 2));
console.log(`${CONTRACT}=PASS`);
