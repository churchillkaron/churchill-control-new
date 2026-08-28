import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_EPHEMERAL_POD_HEALTH_PROOF_V1";
const APPROVAL_ENV = "AVANTIQO_CODE_EPHEMERAL_POD_HEALTH_PROOF_APPROVED";
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const GRAPHQL = "https://api.runpod.io/graphql";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const NETWORK_VOLUME_ID = "7obluigbr0";
const NETWORK_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const DATA_CENTER_ID = "US-CA-2";
const IMAGE_SOURCE_SHA = "875627667bc055c78ed79d3b837c1e9566503ad9";
const IMAGE_DIGEST = "sha256:22d34b892d2718c8381557bc45e092063d66a47b8278dccd31b29eb360c2f4dc";
const IMAGE_REPOSITORY = "ghcr.io/churchillkaron/avantiqo-code-pod";
const IMMUTABLE_IMAGE = `${IMAGE_REPOSITORY}@${IMAGE_DIGEST}`;
const IMAGE_INPUTS = Object.freeze([
  "services/avantiqo-code-engine/Dockerfile.pod",
  "services/avantiqo-code-engine/pod_server.py",
  "services/avantiqo-code-engine/handler.py",
  "services/avantiqo-code-engine/requirements.txt",
]);
const GPU_TYPE_IDS = Object.freeze([
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H200",
  "NVIDIA B200",
]);
const ALLOWED_CUDA_VERSIONS = Object.freeze(["12.8", "12.9", "13.0"]);
const TERMINAL_WORKER = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
const TERMINAL_POD = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
const START_TIMEOUT_MS = 15 * 60_000;
const HEALTH_TIMEOUT_MS = 8 * 60_000;
const CLEANUP_TIMEOUT_MS = 3 * 60_000;
const POLL_MS = 5_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const unique = (values) => [...new Set(list(values).map(text).filter(Boolean))];

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function run(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 900) || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}
function runStatus(name, args) {
  return spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function sourceGate() {
  run("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const originMain = run("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_MAIN_FAILED`);
  const ancestor = runStatus("git", ["merge-base", "--is-ancestor", IMAGE_SOURCE_SHA, originMain]);
  if (ancestor.status !== 0) throw new Error(`${CONTRACT}_IMAGE_SOURCE_NOT_ANCESTOR_OF_ORIGIN_MAIN`);
  const changed = run(
    "git",
    ["diff", "--name-only", `${IMAGE_SOURCE_SHA}..${originMain}`, "--", ...IMAGE_INPUTS],
    `${CONTRACT}_IMAGE_SOURCE_DIFF_FAILED`,
  ).split("\n").map((entry) => entry.trim()).filter(Boolean);
  if (changed.length) throw new Error(`${CONTRACT}_POD_IMAGE_INPUT_MOVED:${changed.join(",")}`);
  return originMain;
}
async function readJsonResponse(response, code, allow404 = false) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (allow404 && response.status === 404) return { __not_found: true };
  if (!response.ok) {
    throw new Error(`${code}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 900)}`);
  }
  return body ?? {};
}
async function restGet(pathname, key, { allow404 = false, timeout = 30_000 } = {}) {
  const response = await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeout),
  });
  return readJsonResponse(response, `${CONTRACT}_REST_GET`, allow404);
}
async function restDelete(pathname, key) {
  const response = await fetch(`${REST}${pathname}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404 || response.status === 204) return { success: true, status: response.status };
  const raw = await response.text();
  if (!response.ok) throw new Error(`${CONTRACT}_REST_DELETE_HTTP_${response.status}:${text(raw).slice(0, 900)}`);
  return { success: true, status: response.status };
}
async function graphql(query, variables, key) {
  const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJsonResponse(response, `${CONTRACT}_GRAPHQL`);
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (errors.length) throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${errors.join(" | ").slice(0, 1000)}`);
  return body?.data || {};
}
async function serverlessHealth(key) {
  const response = await fetch(`${SERVERLESS}/${encodeURIComponent(ENDPOINT_ID)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJsonResponse(response, `${CONTRACT}_SERVERLESS_HEALTH`);
}
function activeWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    if (desired && !TERMINAL_WORKER.has(desired)) return true;
    if (status && !TERMINAL_WORKER.has(status)) return true;
    return !desired && !status;
  });
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function podVolumeId(pod = {}) {
  return text(pod?.networkVolume?.id || pod?.networkVolumeId);
}
function podList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.data || raw?.items || raw?.results || raw?.pods);
}
function endpointList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.data || raw?.items || raw?.results || raw?.endpoints);
}
function volumeList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.data || raw?.items || raw?.results);
}
function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}
async function verifyGhcr() {
  const tokenUrl = new URL("https://ghcr.io/token");
  tokenUrl.searchParams.set("service", "ghcr.io");
  tokenUrl.searchParams.set("scope", "repository:churchillkaron/avantiqo-code-pod:pull");
  const tokenResponse = await fetch(tokenUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const tokenBody = await readJsonResponse(tokenResponse, `${CONTRACT}_GHCR_TOKEN`);
  const token = text(tokenBody?.token || tokenBody?.access_token);
  if (!token) throw new Error(`${CONTRACT}_GHCR_TOKEN_MISSING`);
  const response = await fetch(`https://ghcr.io/v2/churchillkaron/avantiqo-code-pod/manifests/${IMAGE_DIGEST}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${CONTRACT}_GHCR_MANIFEST_HTTP_${response.status}`);
  const digest = text(response.headers.get("docker-content-digest")).toLowerCase();
  await response.arrayBuffer();
  if (digest && digest !== IMAGE_DIGEST.toLowerCase()) {
    throw new Error(`${CONTRACT}_GHCR_DIGEST_MISMATCH:${digest}`);
  }
}

let managementKey = "";
let runtimeKey = "";
let ownedPodName = "";
let createdPodId = "";
let podCreatePerformed = false;
let cleanupPerformed = false;
let signalExit = false;

async function ownedPods() {
  if (!managementKey || !ownedPodName) return [];
  const raw = await restGet("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey);
  return podList(raw).filter((pod) => text(pod?.name) === ownedPodName);
}
async function cleanupOwnedPods() {
  if (cleanupPerformed || !managementKey || !ownedPodName) return;
  cleanupPerformed = true;
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    let pods = [];
    try {
      pods = await ownedPods();
    } catch (error) {
      lastError = error;
      await sleep(2_000);
      continue;
    }
    if (!pods.length) return;
    for (const pod of pods) {
      const id = text(pod?.id);
      if (!id) continue;
      try {
        await restDelete(`/pods/${encodeURIComponent(id)}`, managementKey);
      } catch (error) {
        lastError = error;
      }
    }
    await sleep(3_000);
  }
  const remaining = await ownedPods().catch(() => []);
  if (remaining.length) {
    throw new Error(`${CONTRACT}_CLEANUP_TIMEOUT:${remaining.map((pod) => text(pod?.id)).filter(Boolean).join(",")}:${text(lastError?.message)}`);
  }
}
async function signalCleanup(signal) {
  if (signalExit) return;
  signalExit = true;
  console.error(`${CONTRACT}_SIGNAL=${signal}`);
  try { await cleanupOwnedPods(); } catch (error) { console.error(`${CONTRACT}_SIGNAL_CLEANUP_ERROR=${text(error?.message)}`); }
  process.exit(signal === "SIGINT" ? 130 : 143);
}
process.on("SIGINT", () => { void signalCleanup("SIGINT"); });
process.on("SIGTERM", () => { void signalCleanup("SIGTERM"); });

async function assertSafeBaseline(stage) {
  const graphQuery = `
query AvantiqoCodeEphemeralPodBaseline {
  myself {
    endpoints {
      id
      name
      repo { repoName repoId branch dockerFilePath buildContext }
    }
  }
}`;
  const [endpoint, endpointsRaw, volumesRaw, podsRaw, liveHealth, graph] = await Promise.all([
    restGet(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey),
    restGet("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
    restGet("/networkvolumes", managementKey),
    restGet("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey),
    serverlessHealth(runtimeKey),
    graphql(graphQuery, {}, managementKey),
  ]);
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error(`${CONTRACT}_${stage}_CODE_ENDPOINT_IDENTITY_MISMATCH`);
  }
  const counters = healthCounters(liveHealth);
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
    throw new Error(`${CONTRACT}_${stage}_SERVERLESS_NOT_0_0`);
  }
  if (counters.jobs.in_queue !== 0 || counters.jobs.in_progress !== 0 || activeWorkers(endpoint).length !== 0) {
    throw new Error(`${CONTRACT}_${stage}_SERVERLESS_NOT_IDLE`);
  }
  if (Object.values(counters.workers).some((value) => Number(value) !== 0)) {
    throw new Error(`${CONTRACT}_${stage}_SERVERLESS_HEALTH_WORKERS_PRESENT`);
  }
  const graphEndpoint = list(graph?.myself?.endpoints).find((row) => text(row?.id) === ENDPOINT_ID) || null;
  if (!graphEndpoint) throw new Error(`${CONTRACT}_${stage}_GRAPHQL_CODE_ENDPOINT_REQUIRED`);
  if (graphEndpoint.repo !== null && Object.keys(object(graphEndpoint.repo)).length) {
    throw new Error(`${CONTRACT}_${stage}_CODE_GITHUB_SOURCE_REATTACHED`);
  }
  const volumes = volumeList(volumesRaw);
  const volume = volumes.find((row) => text(row?.id) === NETWORK_VOLUME_ID) || null;
  if (!volume) throw new Error(`${CONTRACT}_${stage}_NETWORK_VOLUME_REQUIRED`);
  if (text(volume?.name) !== NETWORK_VOLUME_NAME) throw new Error(`${CONTRACT}_${stage}_NETWORK_VOLUME_NAME_MISMATCH`);
  if (text(volume?.dataCenterId ?? volume?.data_center_id) !== DATA_CENTER_ID) {
    throw new Error(`${CONTRACT}_${stage}_NETWORK_VOLUME_DATACENTER_MISMATCH`);
  }
  const endpoints = endpointList(endpointsRaw);
  const activeVolumeEndpoints = endpoints.filter((row) =>
    endpointVolumeIds(row).includes(NETWORK_VOLUME_ID) && activeWorkers(row).length > 0
  );
  if (activeVolumeEndpoints.length) {
    throw new Error(`${CONTRACT}_${stage}_SHARED_VOLUME_ENDPOINT_ACTIVE:${activeVolumeEndpoints.map((row) => text(row?.name || row?.id)).join(",")}`);
  }
  const pods = podList(podsRaw);
  const activeForeignPods = pods.filter((pod) => {
    if (text(pod?.name) === ownedPodName) return false;
    if (podVolumeId(pod) !== NETWORK_VOLUME_ID) return false;
    return !TERMINAL_POD.has(text(pod?.desiredStatus).toUpperCase());
  });
  if (activeForeignPods.length) {
    throw new Error(`${CONTRACT}_${stage}_SHARED_VOLUME_FOREIGN_POD_ACTIVE:${activeForeignPods.map((pod) => text(pod?.name || pod?.id)).join(",")}`);
  }
  return {
    origin_main: sourceGate(),
    serverless_health: counters,
    network_volume_size_gb: finite(volume?.size ?? volume?.sizeGb),
  };
}

async function discoverOwnedPodAfterUncertainCreate() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const matches = await ownedPods().catch(() => []);
    if (matches.length > 1) throw new Error(`${CONTRACT}_DUPLICATE_OWNED_PODS_AFTER_SINGLE_CREATE`);
    if (matches.length === 1) return matches[0];
    await sleep(2_000);
  }
  return null;
}
async function createOnePod(token) {
  const body = {
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
    imageName: IMMUTABLE_IMAGE,
    interruptible: false,
    locked: false,
    name: ownedPodName,
    networkVolumeId: NETWORK_VOLUME_ID,
    ports: ["8000/http"],
    supportPublicIp: true,
    volumeMountPath: "/workspace",
  };
  let response = null;
  try {
    response = await fetch(`${REST}/pods`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    const discovered = await discoverOwnedPodAfterUncertainCreate();
    if (discovered) return discovered;
    throw new Error(`${CONTRACT}_CREATE_TRANSPORT_UNCERTAIN_NO_POD_FOUND:${text(error?.message)}`);
  }
  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  if (!response.ok) {
    const discovered = await discoverOwnedPodAfterUncertainCreate();
    if (discovered) return discovered;
    throw new Error(`${CONTRACT}_CREATE_HTTP_${response.status}:${text(parsed?.message || parsed?.error || raw).slice(0, 900)}`);
  }
  podCreatePerformed = true;
  return parsed || {};
}
async function waitForPod(podId) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    const pod = await restGet(`/pods/${encodeURIComponent(podId)}?includeMachine=true&includeNetworkVolume=true`, managementKey, { allow404: true });
    if (pod?.__not_found) throw new Error(`${CONTRACT}_POD_DISAPPEARED_BEFORE_HEALTH`);
    last = pod;
    const status = text(pod?.desiredStatus).toUpperCase();
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_EPHEMERAL_POD_PROGRESS",
      phase: "POD_START",
      pod_id_present: Boolean(text(pod?.id)),
      desired_status: status || null,
      machine_assigned: Boolean(text(pod?.machineId || pod?.machine?.id)),
      public_ip_assigned: Boolean(text(pod?.publicIp)),
      secrets_printed: false,
    }));
    if (TERMINAL_POD.has(status)) throw new Error(`${CONTRACT}_POD_TERMINAL_BEFORE_HEALTH:${status}`);
    if (status === "RUNNING" && text(pod?.machineId || pod?.machine?.id)) return pod;
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_POD_START_TIMEOUT:${text(last?.desiredStatus)}`);
}
async function waitForHealth(podId) {
  const url = `https://${podId}-8000.proxy.runpod.net/health`;
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const raw = await response.text();
      last = `http=${response.status}:${raw.slice(0, 300)}`;
      if (response.ok) {
        let body = null;
        try { body = JSON.parse(raw); } catch { body = null; }
        if (body?.success === true) return body;
      }
    } catch (error) {
      last = text(error?.message);
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_EPHEMERAL_POD_PROGRESS",
      phase: "HEALTH_WAIT",
      health_ready: false,
      secrets_printed: false,
    }));
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_HEALTH_TIMEOUT:${last}`);
}
function assertHealth(body) {
  if (body?.contract !== "AVANTIQO_CODE_POD_HTTP_V1") throw new Error(`${CONTRACT}_HEALTH_CONTRACT_MISMATCH`);
  if (body?.provider !== "avantiqo-code") throw new Error(`${CONTRACT}_HEALTH_PROVIDER_MISMATCH`);
  if (body?.transport !== "pod-http") throw new Error(`${CONTRACT}_HEALTH_TRANSPORT_MISMATCH`);
  if (body?.runtime_model !== "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8") throw new Error(`${CONTRACT}_HEALTH_RUNTIME_MODEL_MISMATCH`);
  if (body?.foundation_model !== "Qwen/Qwen3-Coder-30B-A3B-Instruct") throw new Error(`${CONTRACT}_HEALTH_FOUNDATION_MODEL_MISMATCH`);
  if (body?.quantization !== "fp8") throw new Error(`${CONTRACT}_HEALTH_QUANTIZATION_MISMATCH`);
  if (body?.cached_model_found !== true) throw new Error(`${CONTRACT}_HEALTH_CACHED_MODEL_REQUIRED`);
  if (body?.engine_loaded !== false) throw new Error(`${CONTRACT}_HEALTH_ENGINE_MUST_REMAIN_UNLOADED`);
  if (Number(body?.max_concurrency) !== 1) throw new Error(`${CONTRACT}_HEALTH_MAX_CONCURRENCY_MISMATCH`);
  if (body?.raw_reasoning_persisted !== false) throw new Error(`${CONTRACT}_HEALTH_RAW_REASONING_BOUNDARY_MISMATCH`);
}

console.log(`${CONTRACT}_MODE=APPLY_ONLY`);
console.log(`${CONTRACT}_SINGLE_CREATE_POST=true`);
console.log(`${CONTRACT}_GENERATION_SUBMITTED=false`);
console.log(`${CONTRACT}_INFERENCE_PERFORMED=false`);
console.log(`${CONTRACT}_SERVERLESS_MUTATION_PERFORMED=false`);
console.log(`${CONTRACT}_VOLUME_MUTATION_PERFORMED=false`);
console.log(`${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=false`);
console.log(`${CONTRACT}_SECRETS_PRINTED=false`);

managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
if (text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${CONTRACT}_APPROVAL_REQUIRED:set_${APPROVAL_ENV}=YES`);
}
ownedPodName = `avantiqo-code-cert-ephemeral-${Date.now()}-${randomBytes(4).toString("hex")}`;
const podToken = randomBytes(48).toString("base64url");
if (podToken.length < 32) throw new Error(`${CONTRACT}_TOKEN_GENERATION_FAILED`);

let proof = null;
let startSnapshot = null;
let createdSnapshot = null;
let failure = null;
try {
  startSnapshot = await assertSafeBaseline("PREFLIGHT");
  await verifyGhcr();
  await assertSafeBaseline("IMMEDIATE_PRE_CREATE");
  const created = await createOnePod(podToken);
  createdPodId = text(created?.id);
  if (!createdPodId) {
    const discovered = await discoverOwnedPodAfterUncertainCreate();
    createdPodId = text(discovered?.id);
  }
  if (!createdPodId) throw new Error(`${CONTRACT}_CREATED_POD_ID_REQUIRED`);
  podCreatePerformed = true;
  createdSnapshot = await waitForPod(createdPodId);
  const health = await waitForHealth(createdPodId);
  assertHealth(health);
  proof = {
    pod_id: createdPodId,
    pod_name: ownedPodName,
    desired_status: text(createdSnapshot?.desiredStatus).toUpperCase(),
    gpu_type_id: text(createdSnapshot?.gpuTypeId || createdSnapshot?.gpu?.id || createdSnapshot?.machine?.gpuTypeId) || null,
    machine_id_present: Boolean(text(createdSnapshot?.machineId || createdSnapshot?.machine?.id)),
    public_ip_present: Boolean(text(createdSnapshot?.publicIp)),
    adjusted_cost_per_hr: finite(createdSnapshot?.adjustedCostPerHr ?? createdSnapshot?.costPerHr),
    health: {
      success: health.success === true,
      contract: health.contract,
      provider: health.provider,
      engine_contract: health.engine_contract,
      transport: health.transport,
      runtime_model: health.runtime_model,
      foundation_model: health.foundation_model,
      quantization: health.quantization,
      cached_model_found: health.cached_model_found,
      engine_loaded: health.engine_loaded,
      max_concurrency: health.max_concurrency,
      raw_reasoning_persisted: health.raw_reasoning_persisted,
    },
  };
} catch (error) {
  failure = error;
} finally {
  try {
    cleanupPerformed = false;
    await cleanupOwnedPods();
  } catch (cleanupError) {
    failure = failure || cleanupError;
    if (failure !== cleanupError) {
      failure = new Error(`${text(failure?.message)} | CLEANUP_ERROR:${text(cleanupError?.message)}`);
    }
  }
}

const remainingOwned = await ownedPods().catch(() => []);
const finalEndpoint = await restGet(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey).catch(() => null);
const finalHealth = await serverlessHealth(runtimeKey).catch(() => null);
const finalCounters = finalHealth ? healthCounters(finalHealth) : null;
const finalServerlessResting = finalEndpoint && finite(finalEndpoint?.workersMin, -1) === 0 && finite(finalEndpoint?.workersMax, -1) === 0;
const finalServerlessIdle = finalCounters && finalCounters.jobs.in_queue === 0 && finalCounters.jobs.in_progress === 0 && !Object.values(finalCounters.workers).some((value) => Number(value) !== 0);

const result = {
  success: !failure && Boolean(proof) && remainingOwned.length === 0 && finalServerlessResting && finalServerlessIdle,
  contract: CONTRACT,
  immutable_image: {
    source_sha: IMAGE_SOURCE_SHA,
    digest: IMAGE_DIGEST,
    reference: IMMUTABLE_IMAGE,
    image_inputs_unchanged_at_start: Boolean(startSnapshot?.origin_main),
  },
  proof,
  cleanup: {
    owned_pod_remaining_count: remainingOwned.length,
    pod_deleted: remainingOwned.length === 0,
    serverless_workers_min: finite(finalEndpoint?.workersMin),
    serverless_workers_max: finite(finalEndpoint?.workersMax),
    serverless_health: finalCounters,
  },
  safeguards: {
    create_post_count_max: 1,
    pod_create_performed: podCreatePerformed,
    pod_delete_performed: remainingOwned.length === 0 && podCreatePerformed,
    provider_job_submitted: false,
    inference_performed: false,
    run_route_called: false,
    serverless_mutation_performed: false,
    volume_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
    pod_token_env_key: "AVANTIQO_CODE_POD_TOKEN",
  },
  failure: failure ? text(failure?.message).slice(0, 1600) : null,
  next_action: !failure && proof ? "CODE_POD_HEALTH_PROVEN;BUILD_ONE_GENERATION_CERTIFICATION_LIFECYCLE" : "STOP_AND_DIAGNOSE_EXACT_FAILURE;DO_NOT_BLIND_RETRY_CREATE",
};
console.log(JSON.stringify(result, null, 2));
if (!result.success) {
  throw failure || new Error(`${CONTRACT}_FINAL_STATE_INVALID`);
}
console.log(`${CONTRACT}=PASS`);
