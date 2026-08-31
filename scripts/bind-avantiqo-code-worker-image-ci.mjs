import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_WORKER_IMAGE_BIND_V1";
const REQUEST_CONTRACT = "AVANTIQO_CODE_WORKER_IMAGE_BIND_REQUEST_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const REQUIRED_NETWORK_VOLUME_ID = "qcg1rbzc3g";
const IMAGE_REPOSITORY = "ghcr.io/churchillkaron/avantiqo-code-worker";
const REQUEST_PATH = process.env.AVANTIQO_CODE_WORKER_IMAGE_BIND_REQUEST || "audits/avantiqo-code-worker-image-bind-request.json";
const REPORT_PATH = process.env.AVANTIQO_CODE_WORKER_IMAGE_BIND_REPORT || "/tmp/avantiqo-code-worker-image-bind.json";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const SOURCE_INPUTS = Object.freeze([
  "services/avantiqo-code-engine/Dockerfile.runpod",
  "services/avantiqo-code-engine/handler.py",
  "services/avantiqo-code-engine/serverless_boot.py",
  "services/avantiqo-code-engine/requirements.txt",
]);

const text = (value, maximum = 4000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const upper = (value) => text(value).toUpperCase();

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 1200) || `exit=${result.status}`}`);
  }
  return text(result.stdout, 100000);
}

function commandStatus(name, args) {
  return spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function request() {
  const parsed = JSON.parse(await readFile(REQUEST_PATH, "utf8"));
  if (text(parsed.contract) !== REQUEST_CONTRACT) throw new Error(`${CONTRACT}_REQUEST_CONTRACT_INVALID`);
  if (parsed.approved !== true) throw new Error(`${CONTRACT}_REQUEST_NOT_APPROVED`);
  const sourceSha = text(parsed.source_sha).toLowerCase();
  const imageDigest = text(parsed.image_digest).toLowerCase();
  const repository = text(parsed.image_repository).toLowerCase();
  const buildRunId = text(parsed.build_run_id);
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error(`${CONTRACT}_SOURCE_SHA_INVALID`);
  if (!/^sha256:[a-f0-9]{64}$/.test(imageDigest)) throw new Error(`${CONTRACT}_IMAGE_DIGEST_INVALID`);
  if (repository !== IMAGE_REPOSITORY) throw new Error(`${CONTRACT}_IMAGE_REPOSITORY_INVALID:${repository}`);
  if (!/^\d+$/.test(buildRunId)) throw new Error(`${CONTRACT}_BUILD_RUN_ID_INVALID`);
  return {
    source_sha: sourceSha,
    image_digest: imageDigest,
    image_repository: repository,
    build_run_id: buildRunId,
    immutable_image: `${repository}@${imageDigest}`,
  };
}

function sourceGate(sourceSha) {
  command("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const originMain = command("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_MAIN_FAILED`).toLowerCase();
  const ancestor = commandStatus("git", ["merge-base", "--is-ancestor", sourceSha, originMain]);
  if (ancestor.status !== 0) throw new Error(`${CONTRACT}_SOURCE_NOT_ANCESTOR_OF_MAIN`);
  const moved = command(
    "git",
    ["diff", "--name-only", `${sourceSha}..${originMain}`, "--", ...SOURCE_INPUTS],
    `${CONTRACT}_SOURCE_DIFF_FAILED`,
  ).split("\n").map((value) => value.trim()).filter(Boolean);
  if (moved.length) throw new Error(`${CONTRACT}_CODE_IMAGE_SOURCE_MOVED:${moved.join(",")}`);
  return originMain;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error || body?.message || raw, 1200) || "UNKNOWN"}`);
  }
  return body;
}

async function rest(pathname, credential, { method = "GET", body = null } = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_REST`);
}

async function queueHealth(credential) {
  const response = await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}/health`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_HEALTH`);
}

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const rows = normalizeRows(value[key], keys, depth + 1);
    if (rows.length || Array.isArray(value[key])) return rows;
  }
  return [];
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value
      .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
      .filter(([key]) => key));
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}

function healthSummary(body = {}) {
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

function assertIdle(summary, label) {
  if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0) {
    throw new Error(`${label}_LIVE_JOBS:${JSON.stringify(summary.jobs)}`);
  }
  if (Object.values(summary.workers).some((value) => finite(value, 0) !== 0)) {
    throw new Error(`${label}_LIVE_WORKERS:${JSON.stringify(summary.workers)}`);
  }
}

function endpointSnapshot(endpoint = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    workers_min: finite(endpoint.workersMin, -1),
    workers_max: finite(endpoint.workersMax, -1),
    idle_timeout_seconds: finite(endpoint.idleTimeout, -1),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || upper(endpoint.flashBootType) === "FLASHBOOT",
    scaler_type: upper(endpoint.scalerType),
    scaler_value: finite(endpoint.scalerValue, null),
    network_volume_id: text(endpoint.networkVolumeId || endpoint.network_volume_id) || null,
    network_volume_ids: list(endpoint.networkVolumeIds).map((entry) => text(entry?.networkVolumeId || entry)).filter(Boolean),
    gpu_type_ids: list(endpoint.gpuTypeIds),
    gpu_count: finite(endpoint.gpuCount, 1),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    allowed_cuda_versions: list(endpoint.allowedCudaVersions),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs, null),
    data_center_ids: Array.isArray(endpoint.dataCenterIds)
      ? endpoint.dataCenterIds
      : text(endpoint.dataCenterIds).split(",").map((item) => item.trim()).filter(Boolean),
  };
}

function assertEndpointBaseline(summary, label) {
  if (summary.id !== ENDPOINT_ID || summary.name !== ENDPOINT_NAME) throw new Error(`${label}_IDENTITY_MISMATCH`);
  if (summary.workers_min !== 0) throw new Error(`${label}_WORKERS_MIN_NOT_ZERO:${summary.workers_min}`);
  if (![0, 1].includes(summary.workers_max)) throw new Error(`${label}_WORKERS_MAX_UNEXPECTED:${summary.workers_max}`);
  if (!summary.flashboot) throw new Error(`${label}_FLASHBOOT_REQUIRED`);
  if (summary.network_volume_id !== REQUIRED_NETWORK_VOLUME_ID && !summary.network_volume_ids.includes(REQUIRED_NETWORK_VOLUME_ID)) {
    throw new Error(`${label}_NETWORK_VOLUME_REQUIRED`);
  }
  if (!summary.template_id) throw new Error(`${label}_TEMPLATE_REQUIRED`);
  if (!summary.gpu_type_ids.length) throw new Error(`${label}_GPU_POOL_REQUIRED`);
}

function templateUpdateBody(template, imageName) {
  const body = {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 5)),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName,
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme, 50000),
    volumeInGb: Math.max(0, finite(template.volumeInGb, 0)),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
  };
  const authId = text(template.containerRegistryAuthId);
  if (authId) body.containerRegistryAuthId = authId;
  if (!body.name) throw new Error(`${CONTRACT}_TEMPLATE_NAME_REQUIRED`);
  return body;
}

async function snapshot(managementKey, runtimeKey) {
  const [endpoint, healthRaw, templatesRaw, endpointsRaw] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueHealth(runtimeKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  ]);
  const summary = endpointSnapshot(endpoint);
  assertEndpointBaseline(summary, `${CONTRACT}_SNAPSHOT`);
  const templates = normalizeRows(templatesRaw, ["templates"]);
  const matches = templates.filter((row) => text(row?.id) === summary.template_id);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const consumers = endpoints.filter((row) => text(row?.templateId || row?.template?.id) === summary.template_id);
  const health = healthSummary(healthRaw);
  return { endpoint, endpoint_summary: summary, template: matches[0], consumers, health };
}

function sameStableEndpoint(before, after) {
  return JSON.stringify(before) === JSON.stringify(after);
}

const apply = process.argv.includes("--apply");
if (!apply || upper(process.env.AVANTIQO_CODE_WORKER_IMAGE_BIND_APPROVED) !== "YES") {
  throw new Error("AVANTIQO_CODE_WORKER_IMAGE_BIND_APPROVED=YES_AND_--apply_REQUIRED");
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey, 2000);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
if (!runtimeKey) throw new Error("RUNPOD_CODE_RUNTIME_KEY_REQUIRED");

const target = await request();
const originMain = sourceGate(target.source_sha);
let before = await snapshot(managementKey, runtimeKey);
assertIdle(before.health, `${CONTRACT}_BEFORE`);
if (before.consumers.length !== 1 || text(before.consumers[0]?.id) !== ENDPOINT_ID) {
  throw new Error(`${CONTRACT}_SHARED_TEMPLATE_BLOCKED:${before.consumers.length}`);
}

const beforeStable = before.endpoint_summary;
const beforeImage = text(before.template.imageName);
const mutationRequired = beforeImage !== target.immutable_image;

if (mutationRequired) {
  sourceGate(target.source_sha);
  const fresh = await snapshot(managementKey, runtimeKey);
  assertIdle(fresh.health, `${CONTRACT}_PRE_MUTATION`);
  if (!sameStableEndpoint(beforeStable, fresh.endpoint_summary)) throw new Error(`${CONTRACT}_ENDPOINT_CHANGED_REPLAN_REQUIRED`);
  if (text(fresh.template.imageName) !== beforeImage) throw new Error(`${CONTRACT}_TEMPLATE_IMAGE_CHANGED_REPLAN_REQUIRED`);
  if (fresh.consumers.length !== 1 || text(fresh.consumers[0]?.id) !== ENDPOINT_ID) throw new Error(`${CONTRACT}_TEMPLATE_CONSUMERS_CHANGED_REPLAN_REQUIRED`);

  await rest(`/templates/${encodeURIComponent(beforeStable.template_id)}/update`, managementKey, {
    method: "POST",
    body: templateUpdateBody(fresh.template, target.immutable_image),
  });
}

const after = await snapshot(managementKey, runtimeKey);
assertIdle(after.health, `${CONTRACT}_AFTER`);
if (!sameStableEndpoint(beforeStable, after.endpoint_summary)) {
  throw new Error(`${CONTRACT}_ENDPOINT_CONFIGURATION_CHANGED`);
}
if (text(after.template.imageName) !== target.immutable_image) {
  throw new Error(`${CONTRACT}_IMMUTABLE_IMAGE_VERIFY_FAILED:${text(after.template.imageName)}`);
}
if (after.consumers.length !== 1 || text(after.consumers[0]?.id) !== ENDPOINT_ID) {
  throw new Error(`${CONTRACT}_TEMPLATE_EXCLUSIVITY_CHANGED`);
}

const report = {
  success: true,
  contract: CONTRACT,
  validated_origin_main: originMain,
  endpoint_id: ENDPOINT_ID,
  source_sha: target.source_sha,
  build_run_id: target.build_run_id,
  image_digest: target.image_digest,
  immutable_image_reference: target.immutable_image,
  image_before: beforeImage,
  image_after: text(after.template.imageName),
  mutation_performed: mutationRequired,
  template_exclusive_to_code: true,
  endpoint_configuration_preserved: true,
  endpoint_before: beforeStable,
  endpoint_after: after.endpoint_summary,
  health_before: before.health,
  health_after: after.health,
  workers_min_preserved_zero: after.endpoint_summary.workers_min === 0,
  workers_max_preserved: after.endpoint_summary.workers_max === beforeStable.workers_max,
  flashboot_preserved: after.endpoint_summary.flashboot === true,
  network_volume_preserved: true,
  gpu_pool_preserved: true,
  generation_submitted: false,
  provider_inference_performed: false,
  wallet_mutation_performed: false,
  gpu_worker_started_by_bind: false,
  production_web_deploy_performed: false,
  secrets_printed: false,
};

await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
