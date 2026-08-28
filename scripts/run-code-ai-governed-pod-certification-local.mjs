import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import {
  acquireCodeRunpodDistributedLease,
  releaseCodeRunpodDistributedLease,
} from "./avantiqo-code-runpod-distributed-lease.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_GOVERNED_POD_CERTIFICATION_LEASE_V1";
const POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V3";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const NETWORK_VOLUME_ID = "7obluigbr0";
const NETWORK_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const DATA_CENTER_ID = "US-CA-2";
const IMAGE = "ghcr.io/churchillkaron/avantiqo-code-pod@sha256:1b6ac20925085104ac00c09dde3073e32e5934543bd16b9a346b2dca3fa7bb27";
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const GPU_TYPE_IDS = Object.freeze([
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H200",
  "NVIDIA B200",
]);
const ALLOWED_CUDA_VERSIONS = Object.freeze(["12.8", "12.9", "13.0"]);
const START_TIMEOUT_MS = 15 * 60_000;
const HEALTH_TIMEOUT_MS = 10 * 60_000;
const CLEANUP_TIMEOUT_MS = 3 * 60_000;
const POLL_MS = 5_000;
const TERMINAL_POD = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function readJson(response, label, allow404 = false) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (allow404 && response.status === 404) return { __not_found: true };
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 900)}`);
  }
  return body ?? {};
}

async function restGet(pathname, key, { allow404 = false } = {}) {
  const response = await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_REST_GET`, allow404);
}

async function restDelete(pathname, key) {
  const response = await fetch(`${REST}${pathname}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404 || response.status === 204) return;
  await readJson(response, `${CONTRACT}_REST_DELETE`);
}

async function serverlessHealth(key) {
  const response = await fetch(`${SERVERLESS}/${encodeURIComponent(ENDPOINT_ID)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_SERVERLESS_HEALTH`);
}

function podList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.data || raw?.items || raw?.results || raw?.pods);
}

function endpointList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.data || raw?.items || raw?.results || raw?.endpoints);
}

function activeWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    return !TERMINAL_POD.has(desired || status);
  });
}

function endpointVolumeIds(endpoint = {}) {
  return [endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)].map(text).filter(Boolean);
}

function podVolumeId(pod = {}) {
  return text(pod?.networkVolume?.id || pod?.networkVolumeId);
}

async function assertSafeBaseline(managementKey, runtimeKey, ownedPodName) {
  const [endpoint, endpointsRaw, volumesRaw, podsRaw, health] = await Promise.all([
    restGet(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey),
    restGet("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
    restGet("/networkvolumes", managementKey),
    restGet("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey),
    serverlessHealth(runtimeKey),
  ]);

  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error(`${CONTRACT}_ENDPOINT_IDENTITY_MISMATCH`);
  }
  if (Number(endpoint?.workersMin) !== 0 || Number(endpoint?.workersMax) !== 0) {
    throw new Error(`${CONTRACT}_SERVERLESS_MUST_REMAIN_0_0`);
  }
  if (activeWorkers(endpoint).length) throw new Error(`${CONTRACT}_SERVERLESS_ACTIVE_WORKER_PRESENT`);
  const jobs = health?.jobs || {};
  if (Number(jobs.inQueue ?? jobs.in_queue ?? 0) !== 0 || Number(jobs.inProgress ?? jobs.in_progress ?? 0) !== 0) {
    throw new Error(`${CONTRACT}_SERVERLESS_QUEUE_NOT_IDLE`);
  }

  const volumes = Array.isArray(volumesRaw) ? volumesRaw : list(volumesRaw?.data || volumesRaw?.items || volumesRaw?.results);
  const volume = volumes.find((row) => text(row?.id) === NETWORK_VOLUME_ID);
  if (!volume || text(volume?.name) !== NETWORK_VOLUME_NAME) {
    throw new Error(`${CONTRACT}_NETWORK_VOLUME_IDENTITY_MISMATCH`);
  }
  if (text(volume?.dataCenterId ?? volume?.data_center_id) !== DATA_CENTER_ID) {
    throw new Error(`${CONTRACT}_NETWORK_VOLUME_DATACENTER_MISMATCH`);
  }

  const activeVolumeEndpoints = endpointList(endpointsRaw).filter((row) =>
    endpointVolumeIds(row).includes(NETWORK_VOLUME_ID) && activeWorkers(row).length > 0
  );
  if (activeVolumeEndpoints.length) {
    throw new Error(`${CONTRACT}_SHARED_VOLUME_ENDPOINT_ACTIVE`);
  }

  const foreignPods = podList(podsRaw).filter((pod) =>
    text(pod?.name) !== ownedPodName &&
    podVolumeId(pod) === NETWORK_VOLUME_ID &&
    !TERMINAL_POD.has(text(pod?.desiredStatus).toUpperCase())
  );
  if (foreignPods.length) throw new Error(`${CONTRACT}_SHARED_VOLUME_FOREIGN_POD_ACTIVE`);
}

async function createPod(managementKey, ownedPodName, token) {
  const response = await fetch(`${REST}/pods`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      allowedCudaVersions: ALLOWED_CUDA_VERSIONS,
      cloudType: "SECURE",
      computeType: "GPU",
      containerDiskInGb: 50,
      dataCenterIds: [DATA_CENTER_ID],
      dataCenterPriority: "availability",
      env: { AVANTIQO_CODE_POD_TOKEN: token },
      gpuCount: 1,
      gpuTypeIds: GPU_TYPE_IDS,
      gpuTypePriority: "availability",
      imageName: IMAGE,
      interruptible: false,
      locked: false,
      name: ownedPodName,
      networkVolumeId: NETWORK_VOLUME_ID,
      ports: ["8000/http"],
      supportPublicIp: true,
      volumeMountPath: "/workspace",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  return readJson(response, `${CONTRACT}_POD_CREATE`);
}

async function waitForPod(managementKey, podId) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const pod = await restGet(
      `/pods/${encodeURIComponent(podId)}?includeMachine=true&includeNetworkVolume=true`,
      managementKey,
      { allow404: true },
    );
    if (pod?.__not_found) throw new Error(`${CONTRACT}_POD_DISAPPEARED`);
    const status = text(pod?.desiredStatus).toUpperCase();
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_GOVERNED_POD_PROGRESS",
      phase: "POD_START",
      desired_status: status || null,
      machine_assigned: Boolean(text(pod?.machineId || pod?.machine?.id)),
      secrets_printed: false,
    }));
    if (TERMINAL_POD.has(status)) throw new Error(`${CONTRACT}_POD_TERMINAL:${status}`);
    if (status === "RUNNING" && text(pod?.machineId || pod?.machine?.id)) return pod;
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_POD_START_TIMEOUT`);
}

async function waitForHealth(podId) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let last = "";
  const baseUrl = `https://${podId}-8000.proxy.runpod.net`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const raw = await response.text();
      last = `http=${response.status}:${raw.slice(0, 300)}`;
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      if (
        response.ok &&
        body?.success === true &&
        body?.contract === POD_HTTP_CONTRACT &&
        body?.transport === "pod-http" &&
        body?.async_submit_path === "/v3/generations" &&
        body?.async_status_path_template === "/v3/generations/{job_id}" &&
        body?.cached_model_found === true &&
        body?.raw_reasoning_persisted === false
      ) {
        return { baseUrl, health: body };
      }
    } catch (error) {
      last = text(error?.message || error);
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_GOVERNED_POD_PROGRESS",
      phase: "HEALTH_WAIT",
      health_ready: false,
      secrets_printed: false,
    }));
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_HEALTH_TIMEOUT:${last}`);
}

async function transportProbe(baseUrl, token) {
  const response = await fetch(`${baseUrl}/v3/transport-probe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, `${CONTRACT}_TRANSPORT_PROBE`);
  if (
    body?.contract !== POD_HTTP_CONTRACT ||
    body?.transport !== "pod-http" ||
    body?.proxy_timeout_safe !== true ||
    body?.inference_performed !== false ||
    body?.raw_reasoning_persisted !== false
  ) {
    throw new Error(`${CONTRACT}_TRANSPORT_PROBE_INVALID`);
  }
}

async function cleanupOwnedPod(managementKey, ownedPodName) {
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const raw = await restGet(
      "/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true",
      managementKey,
    ).catch(() => []);
    const matches = podList(raw).filter((pod) => text(pod?.name) === ownedPodName);
    if (!matches.length) return;
    for (const pod of matches) {
      const id = text(pod?.id);
      if (id) await restDelete(`/pods/${encodeURIComponent(id)}`, managementKey).catch(() => null);
    }
    await sleep(3_000);
  }
  throw new Error(`${CONTRACT}_CLEANUP_TIMEOUT`);
}

const split = process.argv.indexOf("--");
if (split < 0 || process.argv.length <= split + 1) {
  throw new Error(`${CONTRACT}_COMMAND_REQUIRED_AFTER_DOUBLE_DASH`);
}
const command = process.argv.slice(split + 1);
const lane = text(process.argv.slice(2, split).find((arg) => arg.startsWith("--lane="))?.slice(7));
if (lane && lane !== "code") throw new Error(`${CONTRACT}_LANE_MUST_BE_CODE`);
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED).toUpperCase() !== "YES") {
  throw new Error(`${CONTRACT}_APPROVAL_REQUIRED`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const runtimeKey = required("RUNPOD_AVANTIQO_CODE_API_KEY", process.env.RUNPOD_API_KEY);
const token = randomBytes(32).toString("hex");
const ownerRequestId = randomUUID();
const ownedPodName = `avantiqo-code-planner-${ownerRequestId.slice(0, 8)}`;
let leaseAcquired = false;
let podCreated = false;
let child = null;
let exitCode = 1;
let failure = null;

async function terminateChild(signal = "SIGTERM") {
  if (!child || child.exitCode !== null || child.signalCode) return;
  try { child.kill(signal); } catch {}
}

async function cleanup(state, reason) {
  await terminateChild("SIGTERM");
  if (podCreated) {
    await cleanupOwnedPod(managementKey, ownedPodName).catch((error) => {
      console.error(`${CONTRACT}_POD_CLEANUP_ERROR=${text(error?.message || error)}`);
    });
  }
  if (leaseAcquired) {
    await releaseCodeRunpodDistributedLease({
      ownerRequestId,
      state,
      reason,
    }).catch((error) => {
      console.error(`${CONTRACT}_LEASE_RELEASE_ERROR=${text(error?.message || error)}`);
    });
  }
}

let signalHandling = false;
async function onSignal(signal) {
  if (signalHandling) return;
  signalHandling = true;
  await cleanup("FAILED", signal);
  process.exit(signal === "SIGINT" ? 130 : 143);
}
process.on("SIGINT", () => { void onSignal("SIGINT"); });
process.on("SIGTERM", () => { void onSignal("SIGTERM"); });

try {
  await assertSafeBaseline(managementKey, runtimeKey, ownedPodName);
  const lease = await acquireCodeRunpodDistributedLease({
    lane: "code",
    endpointId: ENDPOINT_ID,
    endpointName: ENDPOINT_NAME,
    ttlMs: 3_600_000,
    ownerRequestId,
  });
  leaseAcquired = true;

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_GOVERNED_POD_LEASE_ACQUIRED",
    contract: CONTRACT,
    distributed_contract: lease.distributed_contract,
    serverless_rest_state: "0/0",
    immutable_image_digest: IMAGE.split("@")[1],
    one_pod_for_entire_planner_mission: true,
    provider_execution_submitted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));

  const created = await createPod(managementKey, ownedPodName, token);
  const podId = text(created?.id);
  if (!podId) throw new Error(`${CONTRACT}_POD_ID_REQUIRED`);
  podCreated = true;
  await waitForPod(managementKey, podId);
  const { baseUrl } = await waitForHealth(podId);
  await transportProbe(baseUrl, token);

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_GOVERNED_POD_READY",
    contract: CONTRACT,
    pod_http_contract: POD_HTTP_CONTRACT,
    external_transport_probe: "PASS",
    inference_performed_before_planner: false,
    serverless_mutation_performed: false,
    secrets_printed: false,
  }));

  const [executable, ...args] = command;
  child = spawn(executable, [
    "--import",
    "./scripts/code-ai-governed-pod-fetch-shim-local.mjs",
    ...args,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_CODE_POD_BASE_URL: baseUrl,
      AVANTIQO_CODE_POD_TOKEN: token,
      AVANTIQO_CODE_GOVERNED_POD_TRANSPORT: "V3",
      AVANTIQO_CODE_GOVERNED_POD_IMAGE_DIGEST: IMAGE.split("@")[1],
    },
    stdio: "inherit",
  });

  exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(Number.isInteger(code) ? code : 1));
  });
  if (exitCode !== 0) throw new Error(`${CONTRACT}_CHILD_FAILED:${exitCode}`);
} catch (error) {
  failure = text(error?.message || error);
  console.error(`${CONTRACT}_ERROR=${failure}`);
} finally {
  await cleanup(failure ? "FAILED" : "RELEASED", failure || "planner certification complete");
}

const finalHealth = await serverlessHealth(runtimeKey).catch(() => ({}));
const finalJobs = finalHealth?.jobs || {};
console.log(JSON.stringify({
  success: !failure && exitCode === 0,
  contract: CONTRACT,
  child_exit_code: exitCode,
  immutable_image_digest: IMAGE.split("@")[1],
  pod_http_contract: POD_HTTP_CONTRACT,
  external_transport_probe_passed: true,
  serverless_final_jobs_in_queue: Number(finalJobs.inQueue ?? finalJobs.in_queue ?? 0),
  serverless_final_jobs_in_progress: Number(finalJobs.inProgress ?? finalJobs.in_progress ?? 0),
  serverless_mutation_performed: false,
  pod_cleanup_attempted: podCreated,
  distributed_lease_released: leaseAcquired,
  production_deploy_performed: false,
  secrets_printed: false,
  failure,
}, null, 2));
console.log(`${CONTRACT}=${!failure && exitCode === 0 ? "PASS" : "FAIL"}`);
process.exit(!failure && exitCode === 0 ? 0 : 1);
