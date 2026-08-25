import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-audio-worker-image.json";
const EXPECTED_IMAGE_CONTRACT = "AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V3";
const EXPECTED_VARIANT = "acestep-v15-xl-turbo";
const EXPECTED_QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const EXPECTED_LM_MODEL = "acestep-5Hz-lm-1.7B";
const EXPECTED_LM_BACKEND = "vllm";
const EXPECTED_CHECKPOINT_ROOT = "/runpod-volume/ace-step-checkpoints";
const MIN_CONTAINER_DISK_GB = 30;

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

function required(name, code = `${name}_REQUIRED`) {
  const value = text(process.env[name]);
  if (!value) throw new Error(code);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}_YES_REQUIRED`);
  }
}

function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

async function rest(path, managementKey, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueHealth(endpointId, apiKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HEALTH_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function imageEvidence() {
  let parsed = null;
  try {
    parsed = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_WORKER_IMAGE_EVIDENCE_REQUIRED");
  }
  if (parsed?.success !== true || parsed?.contract !== EXPECTED_IMAGE_CONTRACT) {
    throw new Error("AVANTIQO_AUDIO_XL_LM_WORKER_IMAGE_EVIDENCE_REQUIRED");
  }
  if (
    text(parsed?.runtime_variant) !== EXPECTED_VARIANT ||
    text(parsed?.quality_profile) !== EXPECTED_QUALITY_PROFILE ||
    parsed?.ace_step_lm_required !== true ||
    text(parsed?.lm_model) !== EXPECTED_LM_MODEL ||
    text(parsed?.lm_backend) !== EXPECTED_LM_BACKEND ||
    parsed?.xl_model_contract_passed_by_docker_build !== true ||
    parsed?.lm_contract_passed_by_docker_build !== true ||
    parsed?.production_web_deploy !== false ||
    parsed?.provider_job_submitted !== false ||
    parsed?.pricing_activation_performed !== false
  ) {
    throw new Error("AVANTIQO_AUDIO_WORKER_IMAGE_RUNTIME_EVIDENCE_INVALID");
  }
  const image = text(parsed?.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_WORKER_IMAGE_REFERENCE_INVALID");
  }
  const digest = text(parsed?.image_digest) || image.slice(image.indexOf("sha256:"));
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_WORKER_IMAGE_DIGEST_INVALID");
  }
  return { image, digest };
}

async function endpointBoundTemplates(managementKey) {
  const templates = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveEndpoint(endpoints, endpointId) {
  if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  const matches = endpoints.filter((endpoint) => text(endpoint?.id) === endpointId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_AUDIO_CONFIGURED_ENDPOINT_NOT_FOUND:matches=${matches.length}`);
  }
  const endpoint = matches[0];
  if (text(endpoint?.name) !== AUDIO_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_AUDIO_CONFIGURED_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name) || "MISSING"}`);
  }
  return endpoint;
}

function resolveTemplate(endpoint, templates) {
  const inline = object(endpoint?.template);
  const templateId = text(endpoint?.templateId || inline.id);
  if (!templateId) throw new Error("AVANTIQO_AUDIO_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length) return inline;
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_AUDIO_ENDPOINT_BOUND_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`);
  }
  return matches[0];
}

function resolveRegistryAuth(registryAuths, currentTemplate) {
  if (!Array.isArray(registryAuths)) throw new Error("RUNPOD_REGISTRY_AUTH_LIST_INVALID");
  const explicitId = text(process.env.AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_ID);
  if (explicitId) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicitId);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_ID_NOT_FOUND:matches=${matches.length}`);
    }
    return matches[0];
  }
  const currentId = text(currentTemplate?.containerRegistryAuthId);
  if (currentId) {
    const current = registryAuths.find((item) => text(item?.id) === currentId);
    if (current && /ghcr|github/i.test(text(current?.name))) return current;
  }
  const candidates = registryAuths.filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(`AVANTIQO_AUDIO_RUNPOD_GHCR_AUTH_AMBIGUOUS:matches=${candidates.length}`);
  }
  throw new Error("AVANTIQO_AUDIO_RUNPOD_GHCR_AUTH_REQUIRED");
}

function desiredEnv(currentTemplate) {
  return {
    ...normalizeEnv(currentTemplate?.env),
    ACESTEP_CHECKPOINTS_DIR: EXPECTED_CHECKPOINT_ROOT,
    HF_HOME: `${EXPECTED_CHECKPOINT_ROOT}/.hf-cache`,
    ACESTEP_INIT_LLM: "true",
    AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES: "ai.music.generate",
    AVANTIQO_AUDIO_DEVICE: "cuda",
    AVANTIQO_AUDIO_FOUNDATION_MODEL: "ACE-Step/Ace-Step1.5",
    AVANTIQO_AUDIO_MODEL_FAMILY: "ACE_STEP_1_5",
    AVANTIQO_AUDIO_MODEL_SOURCE: "huggingface",
    AVANTIQO_AUDIO_MODEL_VARIANT: EXPECTED_VARIANT,
    AVANTIQO_AUDIO_LM_MODEL: EXPECTED_LM_MODEL,
    AVANTIQO_AUDIO_LM_BACKEND: EXPECTED_LM_BACKEND,
    AVANTIQO_AUDIO_FITNESS_LOAD_MODEL: "false",
  };
}

function assertTemplateContract(template, image, expectedEnv) {
  if (text(template?.imageName) !== image) {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_TEMPLATE_IMAGE_MISMATCH");
  }
  if (template?.isServerless !== true) {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_TEMPLATE_SERVERLESS_REQUIRED");
  }
  const env = normalizeEnv(template?.env);
  const invalid = Object.entries(expectedEnv)
    .filter(([key, value]) => env[key] !== value)
    .map(([key]) => key);
  if (invalid.length) {
    throw new Error(`AVANTIQO_AUDIO_IMMUTABLE_TEMPLATE_ENV_MISMATCH:${invalid.join(",")}`);
  }
}

function managementWorkersExited(endpoint) {
  const workers = list(endpoint?.workers);
  return {
    count: workers.length,
    non_exited: workers.filter((worker) => text(worker?.desiredStatus).toUpperCase() !== "EXITED").length,
  };
}

function healthCounters(health) {
  const jobs = object(health?.jobs);
  const workers = object(health?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      initializing: finite(workers.initializing, 0),
      running: finite(workers.running, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

const apply = process.argv.includes("--apply");
if (apply) approved("AVANTIQO_AUDIO_RUNPOD_IMMUTABLE_REBIND_APPROVED");

const managementKey = required(
  "RUNPOD_MANAGEMENT_API_KEY",
  "RUNPOD_MANAGEMENT_API_KEY_REQUIRED_FOR_AUDIO_IMMUTABLE_REBIND",
);
const apiKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const evidence = await imageEvidence();

console.log(`AVANTIQO_AUDIO_IMMUTABLE_REBIND_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_AUDIO_IMMUTABLE_REBIND_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_IMMUTABLE_REBIND_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_AUDIO_IMMUTABLE_REBIND_PRICING_ACTIVATION_PERFORMED=false");
console.log("AVANTIQO_AUDIO_IMMUTABLE_REBIND_SECRETS_PRINTED=false");

const [endpoints, templates, registryAuths, health] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
  rest("/containerregistryauth", managementKey),
  queueHealth(endpointId, apiKey),
]);
const endpoint = resolveEndpoint(endpoints, endpointId);
const currentTemplate = resolveTemplate(endpoint, templates);
const counters = healthCounters(health);
const management = managementWorkersExited(endpoint);

if (counters.jobs.in_queue > 0 || counters.jobs.in_progress > 0) {
  throw new Error(
    `AVANTIQO_AUDIO_IMMUTABLE_REBIND_BLOCKED_LIVE_JOBS:in_queue=${counters.jobs.in_queue}:in_progress=${counters.jobs.in_progress}`,
  );
}
if (management.non_exited > 0 || counters.workers.running > 0) {
  throw new Error(
    `AVANTIQO_AUDIO_IMMUTABLE_REBIND_BLOCKED_ACTIVE_WORKERS:management_non_exited=${management.non_exited}:running=${counters.workers.running}`,
  );
}

const registryAuth = resolveRegistryAuth(registryAuths, currentTemplate);
const env = desiredEnv(currentTemplate);
const digestSuffix = evidence.digest.slice("sha256:".length, "sha256:".length + 12);
const templateName = `avantiqo-audio-immutable-xl-lm-${digestSuffix}`;
const currentImage = text(currentTemplate?.imageName);
const currentLooksGithubManaged =
  currentImage.startsWith("registry.runpod.net/") ||
  text(currentTemplate?.name).startsWith(`${AUDIO_ENDPOINT_NAME}__template__`);

const namedTemplates = templates.filter((template) => text(template?.name) === templateName);
if (namedTemplates.length > 1) {
  throw new Error(`AVANTIQO_AUDIO_IMMUTABLE_TEMPLATE_NAME_AMBIGUOUS:matches=${namedTemplates.length}`);
}
let immutableTemplate = namedTemplates[0] || null;
if (immutableTemplate) {
  assertTemplateContract(immutableTemplate, evidence.image, env);
}

const plan = {
  success: true,
  contract: "AVANTIQO_AUDIO_IMMUTABLE_TEMPLATE_REBIND_V1",
  mode: apply ? "APPLY" : "PLAN",
  endpoint: {
    id: endpointId,
    name: AUDIO_ENDPOINT_NAME,
    current_template_id: text(endpoint?.templateId) || null,
    current_image_reference_kind: /^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(currentImage)
      ? "IMMUTABLE_GHCR_DIGEST"
      : currentImage.startsWith("registry.runpod.net/")
        ? "RUNPOD_GITHUB_BUILD"
        : "OTHER",
    current_template_looks_github_managed: currentLooksGithubManaged,
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map(text).filter(Boolean),
    network_volume_id: text(endpoint?.networkVolumeId) || null,
  },
  target: {
    template_name: templateName,
    existing_template_found: Boolean(immutableTemplate),
    image_reference_kind: "IMMUTABLE_GHCR_DIGEST",
    variant: EXPECTED_VARIANT,
    quality_profile: EXPECTED_QUALITY_PROFILE,
    lm_model: EXPECTED_LM_MODEL,
    lm_backend: EXPECTED_LM_BACKEND,
  },
  queue: counters,
  management_workers: management,
  mutation_required:
    !immutableTemplate || text(endpoint?.templateId) !== text(immutableTemplate?.id) || currentLooksGithubManaged,
  safety: {
    generation_jobs_submitted: 0,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    existing_endpoint_deleted: false,
    existing_template_deleted: false,
    secret_values_printed: false,
  },
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log("AVANTIQO_AUDIO_IMMUTABLE_REBIND_APPLIED=false");
  process.exit(0);
}

if (!immutableTemplate) {
  immutableTemplate = await rest("/templates", managementKey, {
    method: "POST",
    body: {
      imageName: evidence.image,
      name: templateName,
      category: "NVIDIA",
      containerDiskInGb: Math.max(MIN_CONTAINER_DISK_GB, finite(currentTemplate?.containerDiskInGb, 0)),
      containerRegistryAuthId: text(registryAuth?.id),
      dockerEntrypoint: list(currentTemplate?.dockerEntrypoint),
      dockerStartCmd: list(currentTemplate?.dockerStartCmd),
      env,
      isPublic: false,
      isServerless: true,
      ports: list(currentTemplate?.ports),
      readme: "Avantiqo-owned Audio/Music immutable ACE-Step 1.5 XL Turbo + 1.7B LM worker template. Managed by the governed local repair path; not by GitHub auto-deploy.",
      volumeInGb: Math.max(0, finite(currentTemplate?.volumeInGb, 0)),
      volumeMountPath: text(currentTemplate?.volumeMountPath) || "/workspace",
    },
  });
  if (!text(immutableTemplate?.id)) {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_TEMPLATE_CREATE_ID_REQUIRED");
  }
  assertTemplateContract(immutableTemplate, evidence.image, env);
}

if (text(endpoint?.templateId) !== text(immutableTemplate?.id)) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { templateId: text(immutableTemplate.id) },
  });
}

const [verifiedEndpoints, verifiedTemplates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
]);
const verifiedEndpoint = resolveEndpoint(verifiedEndpoints, endpointId);
const verifiedTemplate = resolveTemplate(verifiedEndpoint, verifiedTemplates);
if (text(verifiedEndpoint?.templateId) !== text(immutableTemplate?.id)) {
  throw new Error("AVANTIQO_AUDIO_IMMUTABLE_ENDPOINT_REBIND_VERIFY_TEMPLATE_ID_FAILED");
}
assertTemplateContract(verifiedTemplate, evidence.image, env);
if (text(verifiedTemplate?.name) !== templateName) {
  throw new Error("AVANTIQO_AUDIO_IMMUTABLE_ENDPOINT_REBIND_VERIFY_TEMPLATE_NAME_FAILED");
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_AUDIO_IMMUTABLE_TEMPLATE_REBIND_V1",
  applied: true,
  endpoint_id: endpointId,
  endpoint_name: AUDIO_ENDPOINT_NAME,
  endpoint_version: finite(verifiedEndpoint?.version),
  template_id: text(verifiedTemplate?.id),
  template_name: text(verifiedTemplate?.name),
  image_reference_kind: "IMMUTABLE_GHCR_DIGEST",
  variant: EXPECTED_VARIANT,
  quality_profile: EXPECTED_QUALITY_PROFILE,
  lm_model: EXPECTED_LM_MODEL,
  lm_backend: EXPECTED_LM_BACKEND,
  shared_network_volume_preserved: text(verifiedEndpoint?.networkVolumeId) === text(endpoint?.networkVolumeId),
  gpu_type_ids_preserved:
    JSON.stringify(list(verifiedEndpoint?.gpuTypeIds)) === JSON.stringify(list(endpoint?.gpuTypeIds)),
  workers_min_preserved: finite(verifiedEndpoint?.workersMin) === finite(endpoint?.workersMin),
  workers_max_preserved: finite(verifiedEndpoint?.workersMax) === finite(endpoint?.workersMax),
  generation_jobs_submitted: 0,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  existing_endpoint_deleted: false,
  existing_template_deleted: false,
  secret_values_printed: false,
}, null, 2));
console.log("AVANTIQO_AUDIO_IMMUTABLE_REBIND_APPLIED=true");
