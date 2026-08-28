import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_POD_VIABILITY_PLAN_V1";
const REST = "https://rest.runpod.io/v1";
const GRAPHQL = "https://api.runpod.io/graphql";
const SERVERLESS = "https://api.runpod.ai/v2";
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
const APPROVED_GPU_IDS = Object.freeze([
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 NVL",
  "NVIDIA H200",
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
const ALLOWED_CUDA_VERSIONS = Object.freeze(["12.8", "12.9", "13.0"]);
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value).toUpperCase()] || 0);
}
function unique(values) { return [...new Set(list(values).map(text).filter(Boolean))]; }
function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function command(name, args, code) {
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
function commandStatus(name, args) {
  return spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
async function readJson(response, code) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${code}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 900)}`);
  }
  return body ?? {};
}
async function rest(pathname, key) {
  return readJson(await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_REST`);
}
async function serverlessHealth(key) {
  return readJson(await fetch(`${SERVERLESS}/${encodeURIComponent(ENDPOINT_ID)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_SERVERLESS_HEALTH`);
}
async function graphql(query, variables, key) {
  const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, `${CONTRACT}_GRAPHQL`);
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (errors.length) throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${errors.join(" | ").slice(0, 1000)}`);
  return body?.data || {};
}
function activeWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    if (desired && !TERMINAL.has(desired)) return true;
    if (status && !TERMINAL.has(status)) return true;
    return !desired && !status;
  });
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function podVolumeId(pod = {}) {
  return text(pod?.networkVolume?.id || pod?.networkVolumeId);
}
function podIsActive(pod = {}) {
  return text(pod?.desiredStatus).toUpperCase() === "RUNNING";
}
function sourceGate() {
  command("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const originMain = command("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_MAIN_FAILED`);
  const ancestor = commandStatus("git", ["merge-base", "--is-ancestor", IMAGE_SOURCE_SHA, originMain]);
  if (ancestor.status !== 0) throw new Error(`${CONTRACT}_IMAGE_SOURCE_NOT_ANCESTOR_OF_ORIGIN_MAIN`);
  const changed = command(
    "git",
    ["diff", "--name-only", `${IMAGE_SOURCE_SHA}..${originMain}`, "--", ...IMAGE_INPUTS],
    `${CONTRACT}_IMAGE_SOURCE_DIFF_FAILED`,
  ).split("\n").map((entry) => entry.trim()).filter(Boolean);
  if (changed.length) throw new Error(`${CONTRACT}_POD_IMAGE_INPUT_MOVED:${changed.join(",")}`);
  return originMain;
}
async function verifyGhcr() {
  const tokenUrl = new URL("https://ghcr.io/token");
  tokenUrl.searchParams.set("service", "ghcr.io");
  tokenUrl.searchParams.set("scope", "repository:churchillkaron/avantiqo-code-pod:pull");
  const tokenBody = await readJson(await fetch(tokenUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_GHCR_TOKEN`);
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

console.log("AVANTIQO_CODE_POD_VIABILITY_MODE=READ_ONLY");
console.log("AVANTIQO_CODE_POD_VIABILITY_POD_CREATE=false");
console.log("AVANTIQO_CODE_POD_VIABILITY_POD_START=false");
console.log("AVANTIQO_CODE_POD_VIABILITY_POD_DELETE=false");
console.log("AVANTIQO_CODE_POD_VIABILITY_SERVERLESS_MUTATION=false");
console.log("AVANTIQO_CODE_POD_VIABILITY_VOLUME_MUTATION=false");
console.log("AVANTIQO_CODE_POD_VIABILITY_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_CODE_POD_VIABILITY_INFERENCE=false");
console.log("AVANTIQO_CODE_POD_VIABILITY_SECRETS_PRINTED=false");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const originMain = sourceGate();
await verifyGhcr();

const availabilityQuery = `
query AvantiqoCodePodViability($input: GpuAvailabilityInput) {
  myself {
    endpoints {
      id
      name
      repo { repoName repoId branch dockerFilePath buildContext }
    }
  }
  dataCenters {
    id
    name
    location
    storageSupport
    gpuAvailability(input: $input) {
      available
      stockStatus
      gpuTypeId
      gpuTypeDisplayName
      displayName
    }
  }
}`;

const [endpoint, endpointsRaw, volumesRaw, podsRaw, liveHealth, graph] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  rest("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey),
  serverlessHealth(runtimeKey),
  graphql(availabilityQuery, {
    input: {
      gpuCount: 1,
      minDisk: 5,
      minMemoryInGb: 80,
      secureCloud: true,
    },
  }, managementKey),
]);

if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
  throw new Error(`${CONTRACT}_CODE_ENDPOINT_IDENTITY_MISMATCH`);
}
const counters = healthCounters(liveHealth);
if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
  throw new Error(`${CONTRACT}_CODE_SERVERLESS_RESTING_0_0_REQUIRED:${endpoint?.workersMin}:${endpoint?.workersMax}`);
}
if (counters.jobs.in_queue !== 0 || counters.jobs.in_progress !== 0 || activeWorkers(endpoint).length !== 0) {
  throw new Error(`${CONTRACT}_CODE_SERVERLESS_MUST_BE_IDLE`);
}
if (Object.values(counters.workers).some((value) => Number(value) !== 0)) {
  throw new Error(`${CONTRACT}_CODE_SERVERLESS_HEALTH_WORKERS_PRESENT`);
}

const graphEndpoint = list(graph?.myself?.endpoints).find((row) => text(row?.id) === ENDPOINT_ID) || null;
if (!graphEndpoint) throw new Error(`${CONTRACT}_GRAPHQL_CODE_ENDPOINT_REQUIRED`);
if (graphEndpoint.repo !== null && Object.keys(object(graphEndpoint.repo)).length) {
  throw new Error(`${CONTRACT}_CODE_GITHUB_SOURCE_MUST_REMAIN_DETACHED`);
}

const volumes = Array.isArray(volumesRaw) ? volumesRaw : list(volumesRaw?.data || volumesRaw?.items || volumesRaw?.results);
const volume = volumes.find((row) => text(row?.id) === NETWORK_VOLUME_ID) || null;
if (!volume) throw new Error(`${CONTRACT}_NETWORK_VOLUME_REQUIRED:${NETWORK_VOLUME_ID}`);
if (text(volume?.name) !== NETWORK_VOLUME_NAME) throw new Error(`${CONTRACT}_NETWORK_VOLUME_NAME_MISMATCH:${text(volume?.name)}`);
if (text(volume?.dataCenterId ?? volume?.data_center_id) !== DATA_CENTER_ID) {
  throw new Error(`${CONTRACT}_NETWORK_VOLUME_DATACENTER_MISMATCH:${text(volume?.dataCenterId ?? volume?.data_center_id)}`);
}

const endpoints = Array.isArray(endpointsRaw) ? endpointsRaw : list(endpointsRaw?.data || endpointsRaw?.items || endpointsRaw?.results || endpointsRaw?.endpoints);
const volumeEndpoints = endpoints
  .filter((row) => endpointVolumeIds(row).includes(NETWORK_VOLUME_ID))
  .map((row) => ({
    id: text(row?.id),
    name: text(row?.name) || null,
    workers_min: finite(row?.workersMin),
    workers_max: finite(row?.workersMax),
    active_workers: activeWorkers(row).length,
  }));
const activeVolumeEndpoints = volumeEndpoints.filter((row) => row.active_workers > 0);

const pods = Array.isArray(podsRaw) ? podsRaw : list(podsRaw?.data || podsRaw?.items || podsRaw?.results || podsRaw?.pods);
const dedicatedVolumePods = pods
  .filter((pod) => !text(pod?.endpointId) && podVolumeId(pod) === NETWORK_VOLUME_ID)
  .map((pod) => ({
    id: text(pod?.id),
    name: text(pod?.name) || null,
    desired_status: text(pod?.desiredStatus).toUpperCase() || null,
    gpu_id: text(pod?.gpu?.id || pod?.gpuId || pod?.gpuTypeId) || null,
    data_center_id: text(pod?.machine?.dataCenterId || pod?.networkVolume?.dataCenterId) || null,
    adjusted_cost_per_hr: finite(pod?.adjustedCostPerHr ?? pod?.costPerHr),
  }));
const activeDedicatedVolumePods = dedicatedVolumePods.filter((pod) => podIsActive({ desiredStatus: pod.desired_status }));
const sharedVolumeIdle = activeVolumeEndpoints.length === 0 && activeDedicatedVolumePods.length === 0;

const dc = list(graph?.dataCenters).find((row) => text(row?.id) === DATA_CENTER_ID) || null;
if (!dc) throw new Error(`${CONTRACT}_DATACENTER_REQUIRED:${DATA_CENTER_ID}`);
if (dc?.storageSupport === false) throw new Error(`${CONTRACT}_DATACENTER_STORAGE_SUPPORT_REQUIRED`);
const approved = new Set(APPROVED_GPU_IDS);
const candidates = list(dc?.gpuAvailability)
  .filter((row) => approved.has(text(row?.gpuTypeId)))
  .map((row) => ({
    gpu_type_id: text(row?.gpuTypeId),
    display_name: text(row?.gpuTypeDisplayName || row?.displayName) || null,
    available: row?.available === true,
    stock: text(row?.stockStatus).toUpperCase() || "NONE",
    stock_rank: stockRank(row?.stockStatus),
    approved_native_fp8: true,
    a100: false,
  }))
  .sort((left, right) =>
    Number(right.available) - Number(left.available) ||
    right.stock_rank - left.stock_rank ||
    APPROVED_GPU_IDS.indexOf(left.gpu_type_id) - APPROVED_GPU_IDS.indexOf(right.gpu_type_id)
  );
const viableCandidates = candidates.filter((row) => row.available && row.stock_rank > 0);
const bestStockRank = Math.max(0, ...viableCandidates.map((row) => row.stock_rank));
const bestStock = ({ 4: "HIGH", 3: "MEDIUM", 2: "LOW" })[bestStockRank] || "NONE";

let diagnosis = "POD_NOT_VIABLE";
let nextAction = "DO_NOT_CREATE_CODE_POD";
if (!sharedVolumeIdle) {
  diagnosis = "SHARED_VOLUME_ACTIVE";
  nextAction = "DO_NOT_CREATE_CODE_POD_UNTIL_SHARED_VOLUME_IS_IDLE";
} else if (!viableCandidates.length) {
  diagnosis = "NO_APPROVED_CODE_POD_GPU_AVAILABLE_IN_US_CA_2";
  nextAction = "DO_NOT_CREATE_CODE_POD;RECHECK_CAPACITY_LATER";
} else if (bestStockRank <= 2) {
  diagnosis = "CODE_POD_CREATE_ATTEMPT_VIABLE_LOW_STOCK";
  nextAction = "ONE_OWNERSHIP_SAFE_EPHEMERAL_POD_CREATE_ATTEMPT_ALLOWED";
} else {
  diagnosis = "CODE_POD_CREATE_ATTEMPT_VIABLE";
  nextAction = "ONE_OWNERSHIP_SAFE_EPHEMERAL_POD_CREATE_ATTEMPT_ALLOWED";
}

const plannedCreateShape = {
  cloudType: "SECURE",
  computeType: "GPU",
  containerDiskInGb: 50,
  dataCenterIds: [DATA_CENTER_ID],
  dataCenterPriority: "custom",
  gpuCount: 1,
  gpuTypeIds: viableCandidates.map((row) => row.gpu_type_id).slice(0, 5),
  gpuTypePriority: "availability",
  allowedCudaVersions: ALLOWED_CUDA_VERSIONS,
  imageName: IMMUTABLE_IMAGE,
  interruptible: false,
  locked: false,
  name: "avantiqo-code-certification-ephemeral",
  networkVolumeId: NETWORK_VOLUME_ID,
  volumeMountPath: "/workspace",
  ports: ["8000/http"],
  env_keys_only: [
    "AVANTIQO_CODE_POD_SHARED_SECRET",
    "AVANTIQO_CODE_FOUNDATION_MODEL",
    "AVANTIQO_CODE_RUNTIME_MODEL",
    "AVANTIQO_CODE_QUANTIZATION",
    "AVANTIQO_CODE_HF_CACHE_ROOT",
    "VLLM_WORKER_MULTIPROC_METHOD",
    "VLLM_USE_FLASHINFER_SAMPLER",
  ],
};

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  diagnosis,
  next_action: nextAction,
  validated_origin_main: originMain,
  immutable_pod_image: {
    source_sha: IMAGE_SOURCE_SHA,
    image_inputs_unchanged: true,
    repository: IMAGE_REPOSITORY,
    digest: IMAGE_DIGEST,
    reference: IMMUTABLE_IMAGE,
    ghcr_manifest_verified: true,
  },
  serverless_code: {
    id: ENDPOINT_ID,
    name: ENDPOINT_NAME,
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    repo_detached: true,
    health: counters,
  },
  shared_network_volume: {
    id: NETWORK_VOLUME_ID,
    name: NETWORK_VOLUME_NAME,
    data_center_id: DATA_CENTER_ID,
    size_gb: finite(volume?.size ?? volume?.sizeGb),
    active_endpoint_users: activeVolumeEndpoints,
    dedicated_pods: dedicatedVolumePods,
    active_dedicated_pods: activeDedicatedVolumePods,
    idle_for_ephemeral_code_pod: sharedVolumeIdle,
  },
  pod_capacity: {
    secure_cloud_required: true,
    data_center_id: DATA_CENTER_ID,
    minimum_vram_gb: 80,
    a100_allowed: false,
    approved_gpu_ids: APPROVED_GPU_IDS,
    candidates,
    viable_candidates: viableCandidates,
    best_stock: bestStock,
  },
  planned_create_shape: plannedCreateShape,
  safeguards: {
    pod_create_performed: false,
    pod_start_performed: false,
    pod_delete_performed: false,
    serverless_mutation_performed: false,
    volume_mutation_performed: false,
    provider_job_submitted: false,
    inference_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
