import { readFileSync, writeFileSync } from "node:fs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_TO_BENCHMARK_REBIND_V1";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const EVIDENCE_PATH = "audits/results/avantiqo-intelligence-benchmark-image.json";
const ENV_PATH = ".env.local";
const MIN_CONTAINER_DISK_GB = 30;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}

function parseEnvFile() {
  let source = "";
  try {
    source = readFileSync(ENV_PATH, "utf8");
  } catch {
    return { source: "", values: {} };
  }
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return { source, values };
}

const localEnv = parseEnvFile();
const runtimeEnv = (name) => text(process.env[name], 4000) || text(localEnv.values[name], 4000);
const managementKey = runtimeEnv("RUNPOD_MANAGEMENT_API_KEY") || runtimeEnv("RUNPOD_API_KEY");
const apiKey = runtimeEnv("RUNPOD_API_KEY") || managementKey;
const trainerEndpointId = runtimeEnv("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID");
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED");
if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
if (!trainerEndpointId) throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID_REQUIRED");

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw, 1000) || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(path, options = {}) {
  return readJson(
    await fetch(`${REST_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    }),
    "AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_REST",
  );
}

async function health() {
  return readJson(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(trainerEndpointId)}/health`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }),
    "AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_HEALTH",
  );
}

function evidence() {
  const body = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
  if (
    body?.success !== true ||
    body?.contract !== "AVANTIQO_INTELLIGENCE_BENCHMARK_IMAGE_RESULT_V1" ||
    body?.worker_contract !== "AVANTIQO_INTELLIGENCE_BENCHMARK_WORKER_V1" ||
    body?.foundation_model !== "Qwen/Qwen3-30B-A3B-Thinking-2507" ||
    body?.canonical_case_count !== 60 ||
    body?.provider_job_submitted !== false ||
    body?.runpod_endpoint_mutated !== false ||
    body?.production_model_promoted !== false ||
    body?.production_web_deploy !== false ||
    !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(body?.immutable_image_reference, 1200)) ||
    !/^ghcr\.io\/.+:sha-[a-f0-9]{12}$/i.test(text(body?.image_tag, 1200))
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_IMAGE_EVIDENCE_INVALID");
  }
  return body;
}

function counters(raw) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}

function activeManagementWorkers(endpoint) {
  return list(endpoint?.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 80).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 80).toUpperCase();
    const exited = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
    if (desired && !exited.has(desired)) return true;
    return Boolean(status && !exited.has(status));
  });
}

function normalizedEnv(value) {
  return Object.fromEntries(Object.entries(object(value)).map(([k, v]) => [String(k), String(v ?? "")]));
}

function updateEnvFile(name, value) {
  let source = localEnv.source;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^(?:export\\s+)?${escaped}=.*$`, "m");
  const line = `${name}=${JSON.stringify(String(value))}`;
  if (pattern.test(source)) source = source.replace(pattern, line);
  else {
    if (source && !source.endsWith("\n")) source += "\n";
    source += `${line}\n`;
  }
  writeFileSync(ENV_PATH, source, { mode: 0o600 });
}

const image = evidence();
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_APPROVED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_APPROVED=YES_REQUIRED");
}

const [endpoints, templates, registryAuths, rawHealth] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true"),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false"),
  rest("/containerregistryauth"),
  health(),
]);
if (!Array.isArray(endpoints) || !Array.isArray(templates) || !Array.isArray(registryAuths)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_PROVIDER_LIST_INVALID");
}
const endpointMatches = endpoints.filter((item) => text(item?.id) === trainerEndpointId);
if (endpointMatches.length !== 1) throw new Error(`AVANTIQO_INTELLIGENCE_BENCHMARK_TRAINER_ENDPOINT_NOT_UNIQUE:${endpointMatches.length}`);
const endpoint = endpointMatches[0];
if (text(endpoint?.name) !== TRAINER_ENDPOINT_NAME) {
  throw new Error(`AVANTIQO_INTELLIGENCE_BENCHMARK_TRAINER_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name) || "MISSING"}`);
}

const queue = counters(rawHealth);
const activeWorkers = activeManagementWorkers(endpoint);
const queueWorkerCount = Object.values(queue.workers).reduce((sum, value) => sum + value, 0);
if (queue.jobs.in_queue || queue.jobs.in_progress) {
  throw new Error(`AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_BLOCKED_JOBS:queue=${queue.jobs.in_queue}:progress=${queue.jobs.in_progress}`);
}
if (activeWorkers.length || queueWorkerCount) {
  throw new Error(`AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_BLOCKED_WORKERS:management=${activeWorkers.length}:queue=${queueWorkerCount}`);
}

const currentTemplateId = text(endpoint?.templateId || endpoint?.template?.id);
const currentTemplate = object(endpoint?.template);
const fallbackTemplate = templates.find((item) => text(item?.id) === currentTemplateId) || currentTemplate;
const currentRegistryAuthId = text(fallbackTemplate?.containerRegistryAuthId);
let registryAuth = currentRegistryAuthId
  ? registryAuths.find((item) => text(item?.id) === currentRegistryAuthId)
  : null;
if (!registryAuth) {
  const candidates = registryAuths.filter((item) => /ghcr|github/i.test([item?.name, item?.registry, item?.registryUrl, item?.url].map(text).join(" ")));
  if (candidates.length !== 1) throw new Error(`AVANTIQO_INTELLIGENCE_BENCHMARK_GHCR_AUTH_RESOLUTION_FAILED:${candidates.length}`);
  registryAuth = candidates[0];
}
const registryAuthId = text(registryAuth?.id);
if (!registryAuthId) throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_GHCR_AUTH_ID_REQUIRED");

const digestSuffix = text(image.image_digest).replace(/^sha256:/, "").slice(0, 12);
const templateName = `avantiqo-intelligence-benchmark-${digestSuffix}`;
const named = templates.filter((item) => text(item?.name) === templateName);
if (named.length > 1) throw new Error(`AVANTIQO_INTELLIGENCE_BENCHMARK_TEMPLATE_AMBIGUOUS:${named.length}`);
let targetTemplate = named[0] || null;
const targetEnv = {
  ...normalizedEnv(fallbackTemplate?.env),
  AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED: "true",
  AVANTIQO_INTELLIGENCE_TRAINER_ENABLED: "false",
  HF_HOME: "/runpod-volume/huggingface-cache",
  TRANSFORMERS_CACHE: "/runpod-volume/huggingface-cache",
};
const desiredBody = {
  containerDiskInGb: Math.max(MIN_CONTAINER_DISK_GB, finite(fallbackTemplate?.containerDiskInGb)),
  containerRegistryAuthId: registryAuthId,
  dockerEntrypoint: [],
  dockerStartCmd: [],
  env: targetEnv,
  imageName: text(image.image_tag, 1200),
  isPublic: false,
  name: templateName,
  ports: [],
  readme: "Avantiqo-owned matched baseline/candidate benchmark worker. Immutable digest evidence is stored locally and production promotion is disabled.",
  volumeInGb: 0,
  volumeMountPath: text(fallbackTemplate?.volumeMountPath, 200) || "/workspace",
};

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: {
    id: trainerEndpointId,
    name: TRAINER_ENDPOINT_NAME,
    current_template_id: currentTemplateId,
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    network_volume_id: text(endpoint?.networkVolumeId) || null,
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((v) => text(v)).filter(Boolean),
  },
  queue,
  management_worker_count: activeWorkers.length,
  target: {
    template_name: templateName,
    image_tag: text(image.image_tag, 1200),
    immutable_image_reference: text(image.immutable_image_reference, 1200),
    source_sha: text(image.source_sha, 40),
    existing_template_found: Boolean(targetTemplate),
    benchmark_endpoint_env_name: "RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID",
  },
  safety: {
    endpoint_id_preserved: true,
    endpoint_name_preserved: true,
    shared_volume_preserved: true,
    gpu_pool_preserved: true,
    worker_limits_preserved: true,
    provider_job_submitted: false,
    production_model_promoted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
};
console.log(JSON.stringify(plan, null, 2));
if (!apply) {
  console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_APPLIED=false");
  process.exit(0);
}

if (!targetTemplate) {
  targetTemplate = await rest("/templates", {
    method: "POST",
    body: { ...desiredBody, category: "NVIDIA", isServerless: true },
  });
} else {
  const existingImage = text(targetTemplate?.imageName, 1200);
  const existingEnabled = text(targetTemplate?.env?.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED, 40).toLowerCase();
  if (existingImage !== desiredBody.imageName || existingEnabled !== "true") {
    await rest(`/templates/${encodeURIComponent(text(targetTemplate.id))}/update`, {
      method: "POST",
      body: desiredBody,
    });
    targetTemplate = await rest(`/templates/${encodeURIComponent(text(targetTemplate.id))}`);
  }
}
const targetTemplateId = text(targetTemplate?.id);
if (!targetTemplateId) throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_TEMPLATE_ID_REQUIRED");
if (text(targetTemplate?.imageName, 1200) !== desiredBody.imageName) {
  targetTemplate = await rest(`/templates/${encodeURIComponent(targetTemplateId)}`);
}
if (text(targetTemplate?.imageName, 1200) !== desiredBody.imageName) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_TEMPLATE_IMAGE_VERIFY_FAILED");
}
if (text(targetTemplate?.env?.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED, 40).toLowerCase() !== "true") {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_TEMPLATE_ENABLE_VERIFY_FAILED");
}

if (currentTemplateId !== targetTemplateId) {
  await rest(`/endpoints/${encodeURIComponent(trainerEndpointId)}`, {
    method: "PATCH",
    body: { templateId: targetTemplateId },
  });
}
const verifiedEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true");
const verified = verifiedEndpoints.find((item) => text(item?.id) === trainerEndpointId);
if (!verified || text(verified?.templateId) !== targetTemplateId) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_REBIND_VERIFY_FAILED");
}
if (text(verified?.networkVolumeId) !== text(endpoint?.networkVolumeId)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_SHARED_VOLUME_CHANGED");
}
if (JSON.stringify(list(verified?.gpuTypeIds)) !== JSON.stringify(list(endpoint?.gpuTypeIds))) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_GPU_POOL_CHANGED");
}
if (
  finite(verified?.workersMin) !== finite(endpoint?.workersMin) ||
  finite(verified?.workersMax) !== finite(endpoint?.workersMax)
) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_WORKER_LIMITS_CHANGED");
}

updateEnvFile("RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID", trainerEndpointId);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  applied: true,
  endpoint_id: trainerEndpointId,
  endpoint_name: TRAINER_ENDPOINT_NAME,
  template_id: targetTemplateId,
  template_name: templateName,
  image_tag: desiredBody.imageName,
  immutable_image_reference: text(image.immutable_image_reference, 1200),
  source_sha: text(image.source_sha, 40),
  benchmark_endpoint_local_binding_written: true,
  shared_volume_preserved: true,
  gpu_pool_preserved: true,
  worker_limits_preserved: true,
  provider_job_submitted: false,
  production_model_promoted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_APPLIED=true");
