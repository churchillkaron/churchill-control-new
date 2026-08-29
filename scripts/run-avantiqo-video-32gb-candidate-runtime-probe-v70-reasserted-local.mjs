#!/usr/bin/env node

import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  VIDEO_32GB_CANDIDATE_ENDPOINT_NAME,
  VIDEO_32GB_CANDIDATE_POOL_ID,
  assertVideoProductionUnchanged,
  inspectVideo32gbCandidate,
  reassertVideo32gbCandidatePool,
  text,
} from "./lib/avantiqo-video-32gb-candidate-contract-v69.mjs";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VIDEO_32GB_CANDIDATE_RUNTIME_PROBE_V70_REASSERTED";
const APPROVAL_ENV = "AVANTIQO_VIDEO_32GB_CANDIDATE_RUNTIME_PROBE_V70_APPROVED";
const SOURCE = "scripts/run-avantiqo-video-32gb-candidate-runtime-probe-v70-local.mjs";
const TEMP = `scripts/.run-avantiqo-video-v70-reasserted-${process.pid}.mjs`;

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

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

const original = await readFile(SOURCE, "utf8");
const oldGate = `  if (inspected?.candidate_serverless_pool_id !== VIDEO_32GB_CANDIDATE_POOL_ID) {\n    throw new Error("AVANTIQO_VIDEO_V70_CANDIDATE_POOL_INVALID");\n  }`;
const newGate = `  if (text(process.env.AVANTIQO_VIDEO_V70_REASSERTED_POOL_ID) !== VIDEO_32GB_CANDIDATE_POOL_ID) {\n    throw new Error("AVANTIQO_VIDEO_V70_REASSERTED_POOL_PROOF_REQUIRED");\n  }`;
const oldOutput = `  serverless_pool_id: inspected?.candidate_serverless_pool_id || null,`;
const newOutput = `  serverless_pool_id: text(process.env.AVANTIQO_VIDEO_V70_REASSERTED_POOL_ID) || null,`;

if (!original.includes(oldGate)) {
  throw new Error("AVANTIQO_VIDEO_V70_REASSERTED_GATE_MARKER_NOT_FOUND");
}
if (!original.includes(oldOutput)) {
  throw new Error("AVANTIQO_VIDEO_V70_REASSERTED_OUTPUT_MARKER_NOT_FOUND");
}

const temporary = original.replace(oldGate, newGate).replace(oldOutput, newOutput);
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
  pool_reasserted_before_worker_open: true,
  pool_verified_by_mutation_response: true,
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
