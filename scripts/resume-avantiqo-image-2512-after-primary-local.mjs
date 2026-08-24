import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const IMAGE_SOURCE_PATH = "services/avantiqo-image-engine";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const IMAGE_EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V1";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const CACHE_COMPLETION_CONTRACT = "AVANTIQO_IMAGE_CACHE_COMPLETION_V1";
const PRIMARY_VOLUME_NAME = "avantiqo-image-model-cache";
const SECONDARY_VOLUME_PREFIX = "avantiqo-image-model-cache-ha-";
const MIN_VOLUME_GB = 64;
const CACHE_EXECUTION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const GENERATION_EXECUTION_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_MS = 10_000;
const JOB_WAIT_MS = Math.max(
  POLL_MS,
  Number(process.env.AVANTIQO_IMAGE_CACHE_TIMEOUT_MS || 110 * 60 * 1000),
);
const DRAIN_WAIT_MS = Math.max(
  30_000,
  Number(process.env.AVANTIQO_IMAGE_ORPHAN_DRAIN_WAIT_MS || 10 * 60 * 1000),
);

const GENERATION_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];
const CACHE_GPU_NAME_PATTERN = /(RTX\s*(?:PRO\s*)?6000|RTX\s*4090|RTX\s*3090|A5000|A6000|6000\s*Ada|\bA40\b|\bL4\b|\bL40S?\b|\bA100\b|\bH100\b|\bH200\b|\bB200\b)/i;

function text(value) {
  return String(value ?? "").trim();
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function approved(value) {
  return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase());
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((entry) => entry.startsWith(prefix));
  return text(value ? value.slice(prefix.length) : "");
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function command(commandName, args, errorCode) {
  const result = spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 1200);
    throw new Error(`${errorCode}:${detail || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}
function commandStatus(commandName, args) {
  return spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function endpointDataCenterIds(endpoint = {}) {
  return Array.isArray(endpoint.dataCenterIds)
    ? unique(endpoint.dataCenterIds)
    : unique(text(endpoint.dataCenterIds).split(","));
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
function jobCount(counters) {
  return counters.jobs.in_queue + counters.jobs.in_progress;
}
function workerCount(counters) {
  return Object.values(counters.workers).reduce((sum, value) => sum + finite(value, 0), 0);
}
function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status);
}
function stockScore(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}
function economicalGpuPreference(value) {
  const label = text(value);
  if (/\bL4\b/i.test(label)) return 100;
  if (/A5000/i.test(label)) return 95;
  if (/RTX\s*3090/i.test(label)) return 90;
  if (/RTX\s*4090/i.test(label)) return 85;
  if (/\bA40\b/i.test(label)) return 80;
  if (/A6000/i.test(label)) return 75;
  if (/6000\s*Ada/i.test(label)) return 70;
  if (/\bL40S?\b/i.test(label)) return 65;
  if (/RTX\s*(?:PRO\s*)?6000/i.test(label)) return 60;
  if (/\bA100\b/i.test(label)) return 40;
  if (/\bH100\b/i.test(label)) return 30;
  if (/\bH200\b/i.test(label)) return 20;
  if (/\bB200\b/i.test(label)) return 10;
  return 0;
}
function strictCacheValid(job = {}) {
  const output = object(job.output);
  const integrity = object(output.cache_integrity);
  return (
    text(output.target_model) === TARGET_MODEL &&
    output.cache_ready === true &&
    output.inference_performed === false &&
    text(output.foundation_model_source) === "runpod-cache" &&
    text(integrity.contract) === CACHE_COMPLETION_CONTRACT &&
    integrity.completion_marker_valid === true &&
    Array.isArray(integrity.missing_required_files) &&
    integrity.missing_required_files.length === 0
  );
}
function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}
function templateBody(template, imageName) {
  const body = {
    containerDiskInGb: finite(template.containerDiskInGb, 30),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName,
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
  };
  if (!body.name) throw new Error("AVANTIQO_IMAGE_RESUME_TEMPLATE_NAME_REQUIRED");
  if (text(template.containerRegistryAuthId)) {
    body.containerRegistryAuthId = text(template.containerRegistryAuthId);
  }
  return body;
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}
async function queueRequest(endpointId, path, credential, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.error || body?.message || raw).slice(0, 1200);
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}
async function endpointBoundTemplates(managementKey) {
  const templates = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
  return templates;
}
function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_RESUME_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_RESUME_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`);
  }
  return matches[0];
}
function immutableEvidenceFromOriginMain() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_RESUME_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_IMAGE_RESUME_BRANCH_READ_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_IMAGE_RESUME_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_RESUME_HEAD_READ_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_RESUME_ORIGIN_MAIN_READ_FAILED");
  const localChanges = command(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", IMAGE_SOURCE_PATH],
    "AVANTIQO_IMAGE_RESUME_SOURCE_STATUS_FAILED",
  );
  if (localChanges) throw new Error("AVANTIQO_IMAGE_RESUME_IMAGE_SOURCE_HAS_LOCAL_CHANGES");

  let evidence = null;
  try {
    evidence = JSON.parse(
      command(
        "git",
        ["show", `origin/main:${IMAGE_EVIDENCE_PATH}`],
        "AVANTIQO_IMAGE_RESUME_EVIDENCE_READ_FAILED",
      ),
    );
  } catch (error) {
    if (text(error?.message).startsWith("AVANTIQO_IMAGE_RESUME_EVIDENCE_READ_FAILED")) throw error;
    throw new Error("AVANTIQO_IMAGE_RESUME_EVIDENCE_JSON_INVALID");
  }
  if (evidence?.success !== true || evidence?.contract !== IMAGE_EVIDENCE_CONTRACT) {
    throw new Error("AVANTIQO_IMAGE_RESUME_EVIDENCE_INVALID");
  }
  const sourceSha = text(evidence.source_sha);
  const image = text(evidence.immutable_image_reference);
  if (
    evidence.source_sha_matches_trigger !== true ||
    sourceSha !== text(evidence.trigger_sha) ||
    !/^[a-f0-9]{40}$/i.test(sourceSha) ||
    !/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(image) ||
    text(evidence.entrypoint) !== "handler_v3.py" ||
    evidence.provider_job_submitted !== false ||
    evidence.image_generation_submitted !== false ||
    evidence.production_web_deploy !== false
  ) {
    throw new Error("AVANTIQO_IMAGE_RESUME_EVIDENCE_SAFETY_INVALID");
  }
  const sourceExists = commandStatus("git", ["cat-file", "-e", `${sourceSha}^{commit}`]);
  if (sourceExists.status !== 0) {
    throw new Error(`AVANTIQO_IMAGE_RESUME_SOURCE_COMMIT_MISSING:${sourceSha}`);
  }
  for (const ref of [head, originMain]) {
    const diff = commandStatus("git", ["diff", "--quiet", sourceSha, ref, "--", IMAGE_SOURCE_PATH]);
    if (diff.status === 1) {
      throw new Error(`AVANTIQO_IMAGE_RESUME_SOURCE_CHANGED:source=${sourceSha}:ref=${ref}`);
    }
    if (diff.status !== 0) throw new Error("AVANTIQO_IMAGE_RESUME_SOURCE_EQUIVALENCE_CHECK_FAILED");
  }
  return { head, originMain, sourceSha, image };
}

async function discoverCacheGpuPool(managementKey, dataCenterId) {
  const query = `
    query AvantiqoImageResumeCacheGpuPool($input: GpuAvailabilityInput) {
      dataCenters {
        id
        gpuAvailability(input: $input) {
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 16, secureCloud: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1200);
    throw new Error(`AVANTIQO_IMAGE_RESUME_GPU_DISCOVERY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  const dataCenter = body.data.dataCenters.find((entry) => text(entry?.id) === dataCenterId);
  if (!dataCenter) throw new Error(`AVANTIQO_IMAGE_RESUME_DATACENTER_NOT_FOUND:${dataCenterId}`);
  const candidates = list(dataCenter.gpuAvailability)
    .map((gpu) => {
      const id = text(gpu?.gpuTypeId);
      const name = text(gpu?.gpuTypeDisplayName || gpu?.displayName || id);
      return {
        id,
        name,
        stock: text(gpu?.stockStatus) || "UNKNOWN",
        stockScore: stockScore(gpu?.stockStatus),
        economicScore: economicalGpuPreference(`${id} ${name}`),
      };
    })
    .filter((gpu) => gpu.id && gpu.stockScore > 0 && gpu.economicScore > 0 && CACHE_GPU_NAME_PATTERN.test(`${gpu.id} ${gpu.name}`))
    .sort((a, b) => b.stockScore - a.stockScore || b.economicScore - a.economicScore || a.id.localeCompare(b.id));
  if (!candidates.length) {
    throw new Error(`AVANTIQO_IMAGE_RESUME_NO_CACHE_GPU_STOCK:${dataCenterId}`);
  }
  return candidates.slice(0, 3);
}
async function waitForJobsZero(endpointId, inferenceKey, label) {
  const deadline = Date.now() + DRAIN_WAIT_MS;
  while (Date.now() <= deadline) {
    const counters = healthCounters(await queueRequest(endpointId, "/health", inferenceKey));
    if (jobCount(counters) === 0) return counters;
    await sleep(3_000);
  }
  throw new Error(`AVANTIQO_IMAGE_RESUME_JOBS_DID_NOT_DRAIN:${label}`);
}
async function waitForWorkersZero(endpointId, inferenceKey, label) {
  const deadline = Date.now() + DRAIN_WAIT_MS;
  let lastPrinted = 0;
  while (Date.now() <= deadline) {
    const counters = healthCounters(await queueRequest(endpointId, "/health", inferenceKey));
    if (jobCount(counters) !== 0) {
      throw new Error(`AVANTIQO_IMAGE_RESUME_UNEXPECTED_JOB_DURING_DRAIN:${label}`);
    }
    if (workerCount(counters) === 0) return counters;
    if (Date.now() - lastPrinted >= 15_000) {
      console.log(`AVANTIQO_IMAGE_RESUME_DRAIN_WAIT label=${label} workers=${workerCount(counters)}`);
      lastPrinted = Date.now();
    }
    await sleep(3_000);
  }
  throw new Error(`AVANTIQO_IMAGE_RESUME_WORKERS_DID_NOT_DRAIN:${label}`);
}
async function waitForJob(endpointId, jobId, inferenceKey) {
  const deadline = Date.now() + JOB_WAIT_MS;
  let lastStatus = null;
  let lastPrinted = 0;
  while (Date.now() <= deadline) {
    const body = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey);
    const status = text(body?.status).toUpperCase();
    if (status === "COMPLETED") return body;
    if (terminalFailure(status)) {
      throw new Error(`AVANTIQO_IMAGE_RESUME_CACHE_${status}:${text(body?.error || body?.output?.error)}`);
    }
    if (status !== lastStatus || Date.now() - lastPrinted >= 30_000) {
      console.log(`AVANTIQO_IMAGE_RESUME_CACHE_PROGRESS status=${status || "UNKNOWN"}`);
      lastStatus = status;
      lastPrinted = Date.now();
    }
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_IMAGE_RESUME_CACHE_WAIT_TIMEOUT:${jobId}`);
}

const apply = process.argv.includes("--apply");
if (!apply) throw new Error("AVANTIQO_IMAGE_RESUME_APPLY_REQUIRED");
if (!approved(process.env.AVANTIQO_IMAGE_MULTI_REGION_CACHE_SPEND_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_RESUME_CACHE_SPEND_APPROVAL_REQUIRED");
}
const completedJobId = arg("completed-job-id") || text(process.env.AVANTIQO_IMAGE_PRIMARY_CACHE_JOB_ID);
const completedDataCenter = arg("completed-dc") || text(process.env.AVANTIQO_IMAGE_PRIMARY_CACHE_DATACENTER);
if (!completedJobId) throw new Error("AVANTIQO_IMAGE_RESUME_COMPLETED_JOB_ID_REQUIRED");
if (!completedDataCenter) throw new Error("AVANTIQO_IMAGE_RESUME_COMPLETED_DATACENTER_REQUIRED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const evidence = immutableEvidenceFromOriginMain();

console.log("AVANTIQO_IMAGE_RESUME_MODE=APPLY");
console.log("AVANTIQO_IMAGE_RESUME_STRATEGY=TRUST_STRICT_PRIMARY_JOB_THEN_CACHE_SECONDARY_ONLY");
console.log("AVANTIQO_IMAGE_RESUME_REPEATS_PRIMARY_CACHE=false");
console.log("AVANTIQO_IMAGE_RESUME_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_RESUME_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_RESUME_SECRETS_PRINTED=false");

const [endpoints, volumes, templates] = await Promise.all([
  rest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey),
  rest("/networkvolumes", managementKey),
  endpointBoundTemplates(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const endpointMatches = configuredEndpointId
  ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredEndpointId && text(endpoint?.name) === IMAGE_ENDPOINT_NAME)
  : endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (endpointMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_RESUME_ENDPOINT_RESOLUTION_FAILED:matches=${endpointMatches.length}`);
}
const endpointId = text(endpointMatches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_RESUME_ENDPOINT_ID_REQUIRED");
const completedJob = await queueRequest(
  endpointId,
  `/status/${encodeURIComponent(completedJobId)}`,
  inferenceKey,
);

if (!strictCacheValid(completedJob) || text(completedJob?.status).toUpperCase() !== "COMPLETED") {
  throw new Error("AVANTIQO_IMAGE_RESUME_PRIMARY_JOB_NOT_STRICT_COMPLETE");
}

const primaryMatches = volumes.filter((volume) => text(volume?.name) === PRIMARY_VOLUME_NAME);
const secondaryMatches = volumes.filter(
  (volume) => text(volume?.name).startsWith(SECONDARY_VOLUME_PREFIX),
);
if (primaryMatches.length !== 1 || secondaryMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_RESUME_VOLUME_RESOLUTION_FAILED:primary=${primaryMatches.length}:secondary=${secondaryMatches.length}`);
}
const primary = primaryMatches[0];
const secondary = secondaryMatches[0];
const primaryId = text(primary?.id);
const secondaryId = text(secondary?.id);
const primaryDc = text(primary?.dataCenterId);
const secondaryDc = text(secondary?.dataCenterId);
if (!primaryId || !secondaryId || !primaryDc || !secondaryDc || primaryDc === secondaryDc) {
  throw new Error("AVANTIQO_IMAGE_RESUME_VOLUME_DATACENTER_INVALID");
}
if (finite(primary?.size, 0) < MIN_VOLUME_GB || finite(secondary?.size, 0) < MIN_VOLUME_GB) {
  throw new Error("AVANTIQO_IMAGE_RESUME_VOLUME_TOO_SMALL");
}
if (completedDataCenter !== primaryDc) {
  throw new Error(`AVANTIQO_IMAGE_RESUME_COMPLETED_DC_NOT_PRIMARY:completed=${completedDataCenter}:primary=${primaryDc}`);
}

let endpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) throw new Error("AVANTIQO_IMAGE_RESUME_ENDPOINT_NAME_MISMATCH");
const templateId = text(endpoint?.templateId || endpoint?.template?.id);
if (!templateId) throw new Error("AVANTIQO_IMAGE_RESUME_TEMPLATE_ID_REQUIRED");
const currentVolumeIds = endpointVolumeIds(endpoint);
if (!currentVolumeIds.length || currentVolumeIds.some((id) => ![primaryId, secondaryId].includes(id))) {
  throw new Error(`AVANTIQO_IMAGE_RESUME_UNEXPECTED_VOLUME_BINDING:${currentVolumeIds.join("|") || "NONE"}`);
}
if (finite(endpoint?.workersMin) !== 0 || ![0, 1].includes(finite(endpoint?.workersMax))) {
  throw new Error(`AVANTIQO_IMAGE_RESUME_WORKER_SCALING_UNEXPECTED:min=${finite(endpoint?.workersMin)}:max=${finite(endpoint?.workersMax)}`);
}

const templateConsumers = endpoints.filter((candidate) => text(candidate?.templateId || candidate?.template?.id) === templateId);
if (templateConsumers.length !== 1 || text(templateConsumers[0]?.id) !== endpointId) {
  throw new Error(`AVANTIQO_IMAGE_RESUME_SHARED_TEMPLATE_BLOCKED:consumers=${templateConsumers.length}`);
}

async function bindEvidenceImage(label) {
  const latestEvidence = immutableEvidenceFromOriginMain();
  if (latestEvidence.sourceSha !== evidence.sourceSha || latestEvidence.image !== evidence.image) {
    throw new Error(`AVANTIQO_IMAGE_RESUME_EVIDENCE_CHANGED_REPLAN_REQUIRED:${label}`);
  }
  const [freshEndpoint, freshTemplates] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    endpointBoundTemplates(managementKey),
  ]);
  if (text(freshEndpoint?.templateId || freshEndpoint?.template?.id) !== templateId) {
    throw new Error(`AVANTIQO_IMAGE_RESUME_TEMPLATE_CHANGED_REPLAN_REQUIRED:${label}`);
  }
  const freshTemplate = resolveTemplate(freshEndpoint, freshTemplates);
  if (text(freshTemplate.imageName) === evidence.image) return false;
  const counters = healthCounters(await queueRequest(endpointId, "/health", inferenceKey));
  if (jobCount(counters) !== 0 || workerCount(counters) !== 0) {
    throw new Error(`AVANTIQO_IMAGE_RESUME_BIND_REQUIRES_ZERO_ACTIVITY:${label}:jobs=${jobCount(counters)}:workers=${workerCount(counters)}`);
  }
  await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
    method: "POST",
    body: templateBody(freshTemplate, evidence.image),
  });
  const verifiedTemplates = await endpointBoundTemplates(managementKey);
  const verifiedEndpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=false`,
    managementKey,
  );
  const verifiedTemplate = resolveTemplate(verifiedEndpoint, verifiedTemplates);
  if (text(verifiedTemplate.imageName) !== evidence.image) {
    throw new Error(`AVANTIQO_IMAGE_RESUME_IMMUTABLE_BIND_VERIFY_FAILED:${label}`);
  }
  console.log(`AVANTIQO_IMAGE_RESUME_IMMUTABLE_BIND_REPAIRED=true label=${label}`);
  return true;
}

async function freezeAndDrain(label) {
  await waitForJobsZero(endpointId, inferenceKey, label);
  const fresh = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (text(fresh?.templateId || fresh?.template?.id) !== templateId) {
    throw new Error(`AVANTIQO_IMAGE_RESUME_TEMPLATE_CHANGED_BEFORE_DRAIN:${label}`);
  }
  if (finite(fresh?.workersMin) !== 0) throw new Error(`AVANTIQO_IMAGE_RESUME_WORKERS_MIN_CHANGED:${label}`);
  if (finite(fresh?.workersMax) !== 0) {
    await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { workersMax: 0 },
    });
  }
  await waitForWorkersZero(endpointId, inferenceKey, label);
}

let activeJobId = null;
let finalRestored = false;
try {
  await freezeAndDrain("START");
  await bindEvidenceImage("START");

  const cachePool = await discoverCacheGpuPool(managementKey, secondaryDc);
  const cacheGpuTypeIds = unique(cachePool.map((candidate) => candidate.id));
  console.log(`AVANTIQO_IMAGE_RESUME_SECONDARY_DC=${secondaryDc}`);
  console.log(`AVANTIQO_IMAGE_RESUME_CACHE_GPU_CANDIDATES=${cachePool.length}`);

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: secondaryId,
      networkVolumeIds: [secondaryId],
      dataCenterIds: [secondaryDc],
      gpuTypeIds: cacheGpuTypeIds,
      executionTimeoutMs: CACHE_EXECUTION_TIMEOUT_MS,
      workersMin: 0,
      workersMax: 0,
    },
  });

  endpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (
    !sameSet(endpointVolumeIds(endpoint), [secondaryId]) ||
    !sameSet(endpointDataCenterIds(endpoint), [secondaryDc]) ||
    !sameSet(list(endpoint?.gpuTypeIds), cacheGpuTypeIds) ||
    finite(endpoint?.executionTimeoutMs) !== CACHE_EXECUTION_TIMEOUT_MS ||
    finite(endpoint?.workersMin) !== 0 ||
    finite(endpoint?.workersMax) !== 0
  ) {
    throw new Error("AVANTIQO_IMAGE_RESUME_SECONDARY_BIND_VERIFY_FAILED");
  }
  await bindEvidenceImage("AFTER_SECONDARY_REBIND");

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMax: 1 },
  });
  console.log("AVANTIQO_IMAGE_RESUME_SECONDARY_CACHE_JOB=SUBMITTING");
  const submitted = await queueRequest(endpointId, "/run", inferenceKey, {
    method: "POST",
    body: {
      input: {
        contract: ENGINE_CONTRACT,
        operation: "cache_foundation_model",
        target_model: TARGET_MODEL,
      },
    },
  });
  activeJobId = text(submitted?.id);
  if (!activeJobId) throw new Error("AVANTIQO_IMAGE_RESUME_SECONDARY_CACHE_JOB_ID_MISSING");
  console.log(`AVANTIQO_IMAGE_RESUME_SECONDARY_CACHE_JOB=${activeJobId}`);
  const completed = await waitForJob(endpointId, activeJobId, inferenceKey);
  if (!strictCacheValid(completed)) {
    throw new Error("AVANTIQO_IMAGE_RESUME_SECONDARY_CACHE_STRICT_VALIDATION_FAILED");
  }
  console.log("AVANTIQO_IMAGE_RESUME_SECONDARY_CACHE_READY=YES");
  activeJobId = null;

  await freezeAndDrain("AFTER_SECONDARY_CACHE");
  await bindEvidenceImage("AFTER_SECONDARY_CACHE");

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: primaryId,
      networkVolumeIds: [primaryId, secondaryId],
      dataCenterIds: [primaryDc, secondaryDc],
      gpuTypeIds: GENERATION_GPU_TYPES,
      executionTimeoutMs: GENERATION_EXECUTION_TIMEOUT_MS,
      workersMin: 0,
      workersMax: 0,
    },
  });
  await bindEvidenceImage("FINAL_BASELINE");
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMax: 1 },
  });

  const [finalEndpoint, finalTemplates, finalHealth] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    endpointBoundTemplates(managementKey),
    queueRequest(endpointId, "/health", inferenceKey),
  ]);
  const finalTemplate = resolveTemplate(finalEndpoint, finalTemplates);
  if (
    !sameSet(endpointVolumeIds(finalEndpoint), [primaryId, secondaryId]) ||
    !sameSet(endpointDataCenterIds(finalEndpoint), [primaryDc, secondaryDc]) ||
    !sameSet(list(finalEndpoint?.gpuTypeIds), GENERATION_GPU_TYPES) ||
    finite(finalEndpoint?.executionTimeoutMs) !== GENERATION_EXECUTION_TIMEOUT_MS ||
    finite(finalEndpoint?.workersMin) !== 0 ||
    finite(finalEndpoint?.workersMax) !== 1 ||
    text(finalTemplate.imageName) !== evidence.image ||
    jobCount(healthCounters(finalHealth)) !== 0
  ) {
    throw new Error("AVANTIQO_IMAGE_RESUME_FINAL_VERIFY_FAILED");
  }
  finalRestored = true;

  console.log("AVANTIQO_IMAGE_RESUME=COMPLETE");
  console.log(JSON.stringify({
    success: true,
    contract: "AVANTIQO_IMAGE_2512_PRIMARY_COMPLETE_RESUME_V1",
    completed_primary_job_verified: true,
    completed_primary_data_center: primaryDc,
    primary_cache_repeated: false,
    secondary_data_center: secondaryDc,
    secondary_cache_job_id: text(completed?.id) || null,
    secondary_cache_ready: true,
    immutable_image_source_sha: evidence.sourceSha,
    image_source_tree_matches_local_and_origin_main: true,
    immutable_image_bound_after_restore: true,
    final_volume_count: endpointVolumeIds(finalEndpoint).length,
    final_generation_gpu_count: list(finalEndpoint?.gpuTypeIds).length,
    image_generation: false,
    inference_performed: false,
    production_deploy: false,
    next_action: "IMAGE_2512_CACHE_COMPLETE_ZERO_GENERATION_STOP_POINT",
  }, null, 2));
} catch (error) {
  if (activeJobId) {
    try {
      await queueRequest(endpointId, `/cancel/${encodeURIComponent(activeJobId)}`, inferenceKey, { method: "POST" });
      console.error("AVANTIQO_IMAGE_RESUME_ACTIVE_JOB_CANCEL_REQUESTED=true");
    } catch (cancelError) {
      console.error(`AVANTIQO_IMAGE_RESUME_ACTIVE_JOB_CANCEL_FAILED=${text(cancelError?.message || cancelError)}`);
    }
  }
  if (!finalRestored) {
    try {
      await freezeAndDrain("FAILURE_RESTORE");
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: {
          networkVolumeId: primaryId,
          networkVolumeIds: [primaryId, secondaryId],
          dataCenterIds: [primaryDc, secondaryDc],
          gpuTypeIds: GENERATION_GPU_TYPES,
          executionTimeoutMs: GENERATION_EXECUTION_TIMEOUT_MS,
          workersMin: 0,
          workersMax: 0,
        },
      });
      await bindEvidenceImage("FAILURE_RESTORE");
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { workersMax: 1 },
      });
      console.error("AVANTIQO_IMAGE_RESUME_FAILURE_BASELINE_RESTORED=true");
    } catch (restoreError) {
      console.error(`AVANTIQO_IMAGE_RESUME_FAILURE_RESTORE_FAILED=${text(restoreError?.message || restoreError)}`);
    }
  }
  throw error;
}
