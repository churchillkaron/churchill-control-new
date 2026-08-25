import { readFile, writeFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const RETIRED_ENDPOINT_NAME = "avantiqo-audio-v1-github-retired";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-audio-worker-image.json";
const ENV_PATH = ".env.local";
const CONTRACT = "AVANTIQO_AUDIO_RUNPOD_REGISTRY_ENDPOINT_MIGRATION_V1";
const EXPECTED_VARIANT = "acestep-v15-xl-turbo";
const EXPECTED_QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const EXPECTED_LM_MODEL = "acestep-5Hz-lm-1.7B";
const EXPECTED_LM_BACKEND = "vllm";
const EXPECTED_CHECKPOINT_ROOT = "/runpod-volume/ace-step-checkpoints";

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

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
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

async function health(endpointId, apiKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HEALTH_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function imageEvidence() {
  let parsed = null;
  try {
    parsed = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch {
    throw new Error("AVANTIQO_AUDIO_WORKER_IMAGE_EVIDENCE_REQUIRED");
  }
  if (parsed?.success !== true || parsed?.contract !== "AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V3") {
    throw new Error("AVANTIQO_AUDIO_WORKER_IMAGE_EVIDENCE_V3_REQUIRED");
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

  const repository = text(parsed?.image_repository);
  const sourceSha = text(parsed?.source_sha);
  const imageTag = text(parsed?.image_tag);
  const digest = text(parsed?.image_digest);
  const immutableReference = text(parsed?.immutable_image_reference);
  if (!/^ghcr\.io\/.+/i.test(repository)) throw new Error("AVANTIQO_AUDIO_GHCR_REPOSITORY_REQUIRED");
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("AVANTIQO_AUDIO_IMAGE_SOURCE_SHA_INVALID");
  if (imageTag !== `${repository}:sha-${sourceSha.slice(0, 12)}`) {
    throw new Error("AVANTIQO_AUDIO_IMAGE_SOURCE_LOCKED_TAG_INVALID");
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    throw new Error("AVANTIQO_AUDIO_IMAGE_DIGEST_INVALID");
  }
  if (immutableReference !== `${repository}@${digest}`) {
    throw new Error("AVANTIQO_AUDIO_IMAGE_IMMUTABLE_REFERENCE_INVALID");
  }
  return { repository, sourceSha, imageTag, digest, immutableReference };
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint?.networkVolumeId),
    ...list(endpoint?.networkVolumeIds).map(text),
  ].filter(Boolean))];
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

function queueCounters(body) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      running: finite(workers.running, 0),
      unhealthy: finite(workers.unhealthy, 0),
      initializing: finite(workers.initializing, 0),
    },
  };
}

function managementWorkers(endpoint) {
  const workers = list(endpoint?.workers);
  return {
    count: workers.length,
    non_exited: workers.filter((worker) => text(worker?.desiredStatus).toUpperCase() !== "EXITED").length,
  };
}

function resolveRegistryAuth(registryAuths, currentTemplate) {
  if (!Array.isArray(registryAuths)) throw new Error("RUNPOD_REGISTRY_AUTH_LIST_INVALID");
  const explicit = text(process.env.AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_ID);
  if (explicit) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicit);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_AUDIO_REGISTRY_AUTH_ID_NOT_FOUND:matches=${matches.length}`);
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
    throw new Error(`AVANTIQO_AUDIO_GHCR_REGISTRY_AUTH_AMBIGUOUS:matches=${candidates.length}`);
  }
  throw new Error("AVANTIQO_AUDIO_GHCR_REGISTRY_AUTH_REQUIRED");
}

function findGithubTemplate(templates, endpointId) {
  const candidates = templates.filter((template) => {
    const name = text(template?.name);
    const image = text(template?.imageName);
    return (
      name.startsWith(`${AUDIO_ENDPOINT_NAME}__template__`) &&
      image.startsWith("registry.runpod.net/") &&
      image.includes("services-avantiqo-audio-engine-dockerfile")
    );
  });
  if (candidates.length !== 1) {
    throw new Error(
      `AVANTIQO_AUDIO_GITHUB_TEMPLATE_RESOLUTION_FAILED:endpoint=${endpointId}:matches=${candidates.length}`,
    );
  }
  return candidates[0];
}

async function directTemplate(templateId, managementKey) {
  const template = await rest(`/templates/${encodeURIComponent(templateId)}`, managementKey);
  if (text(template?.id) !== templateId) throw new Error("AVANTIQO_AUDIO_TEMPLATE_DIRECT_READ_ID_MISMATCH");
  return template;
}

function assertRegistryTemplate(template, evidence, registryAuthId, templateName, env) {
  const invalidEnv = Object.entries(env)
    .filter(([key, value]) => normalizeEnv(template?.env)[key] !== value)
    .map(([key]) => key);
  const failures = [];
  if (text(template?.name) !== templateName) failures.push("name");
  if (text(template?.imageName) !== evidence.imageTag) failures.push("image");
  if (text(template?.containerRegistryAuthId) !== registryAuthId) failures.push("registry_auth");
  if (template?.isServerless !== true) failures.push("serverless");
  if (finite(template?.containerDiskInGb, 0) < 30) failures.push("container_disk");
  if (invalidEnv.length) failures.push(`env:${invalidEnv.join(",")}`);
  if (failures.length) {
    throw new Error(`AVANTIQO_AUDIO_REGISTRY_TEMPLATE_VERIFY_FAILED:${failures.join("|")}`);
  }
}

function candidateEndpointBody(oldEndpoint, templateId, candidateName) {
  const body = {
    templateId,
    computeType: "GPU",
    executionTimeoutMs: finite(oldEndpoint?.executionTimeoutMs, 1_200_000),
    flashboot: oldEndpoint?.flashboot === true,
    gpuCount: finite(oldEndpoint?.gpuCount, 1),
    gpuTypeIds: list(oldEndpoint?.gpuTypeIds).map(text).filter(Boolean),
    idleTimeout: finite(oldEndpoint?.idleTimeout, 5),
    name: candidateName,
    scalerType: text(oldEndpoint?.scalerType) || "QUEUE_DELAY",
    scalerValue: finite(oldEndpoint?.scalerValue, 4),
    workersMax: finite(oldEndpoint?.workersMax, 1),
    workersMin: 0,
  };
  const volumeId = text(oldEndpoint?.networkVolumeId) || endpointVolumeIds(oldEndpoint)[0] || "";
  if (volumeId) body.networkVolumeId = volumeId;
  const dataCenterIds = list(oldEndpoint?.dataCenterIds).map(text).filter(Boolean);
  if (dataCenterIds.length) body.dataCenterIds = dataCenterIds;
  const allowedCudaVersions = list(oldEndpoint?.allowedCudaVersions).map(text).filter(Boolean);
  if (allowedCudaVersions.length) body.allowedCudaVersions = allowedCudaVersions;
  if (text(oldEndpoint?.minCudaVersion)) body.minCudaVersion = text(oldEndpoint.minCudaVersion);
  return body;
}

async function updateLocalEndpointBinding(newEndpointId) {
  let source = "";
  try {
    source = await readFile(ENV_PATH, "utf8");
  } catch {
    throw new Error("AVANTIQO_AUDIO_LOCAL_ENV_FILE_REQUIRED");
  }
  const key = "RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID";
  const regex = new RegExp(`^${key}=.*$`, "m");
  const next = regex.test(source)
    ? source.replace(regex, `${key}=${newEndpointId}`)
    : `${source}${source.endsWith("\n") ? "" : "\n"}${key}=${newEndpointId}\n`;
  await writeFile(ENV_PATH, next, "utf8");
  return true;
}

const apply = process.argv.includes("--apply");
if (apply) approved("AVANTIQO_AUDIO_RUNPOD_REGISTRY_MIGRATION_APPROVED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const apiKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const evidence = await imageEvidence();

console.log(`AVANTIQO_AUDIO_REGISTRY_MIGRATION_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_AUDIO_REGISTRY_MIGRATION_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_REGISTRY_MIGRATION_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_AUDIO_REGISTRY_MIGRATION_PRICING_ACTIVATION_PERFORMED=false");
console.log("AVANTIQO_AUDIO_REGISTRY_MIGRATION_EXISTING_ENDPOINT_DELETED=false");
console.log("AVANTIQO_AUDIO_REGISTRY_MIGRATION_SECRETS_PRINTED=false");

const [endpoints, templates, registryAuths, currentHealth] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  ),
  rest("/containerregistryauth", managementKey),
  health(configuredEndpointId, apiKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");

const currentMatches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredEndpointId);
if (currentMatches.length !== 1) {
  throw new Error(`AVANTIQO_AUDIO_CONFIGURED_ENDPOINT_NOT_FOUND:matches=${currentMatches.length}`);
}
const currentEndpoint = currentMatches[0];
if (text(currentEndpoint?.name) !== AUDIO_ENDPOINT_NAME) {
  throw new Error(`AVANTIQO_AUDIO_CONFIGURED_ENDPOINT_NAME_MISMATCH:${text(currentEndpoint?.name) || "MISSING"}`);
}
const currentTemplateId = text(currentEndpoint?.templateId || currentEndpoint?.template?.id);
if (!currentTemplateId) throw new Error("AVANTIQO_AUDIO_CURRENT_TEMPLATE_ID_REQUIRED");
const currentTemplate = await directTemplate(currentTemplateId, managementKey);
const currentImage = text(currentTemplate?.imageName);
if (!currentImage.startsWith("registry.runpod.net/")) {
  throw new Error(`AVANTIQO_AUDIO_REGISTRY_MIGRATION_NOT_REQUIRED:current_image=${currentImage || "MISSING"}`);
}

const queue = queueCounters(currentHealth);
const management = managementWorkers(currentEndpoint);
if (queue.jobs.in_queue > 0 || queue.jobs.in_progress > 0) {
  throw new Error(
    `AVANTIQO_AUDIO_REGISTRY_MIGRATION_BLOCKED_LIVE_JOBS:in_queue=${queue.jobs.in_queue}:in_progress=${queue.jobs.in_progress}`,
  );
}
if (management.non_exited > 0 || queue.workers.running > 0) {
  throw new Error(
    `AVANTIQO_AUDIO_REGISTRY_MIGRATION_BLOCKED_ACTIVE_WORKERS:management_non_exited=${management.non_exited}:running=${queue.workers.running}`,
  );
}

const githubTemplate = findGithubTemplate(templates, configuredEndpointId);
const registryAuth = resolveRegistryAuth(registryAuths, currentTemplate);
const registryAuthId = text(registryAuth?.id);
const env = desiredEnv(currentTemplate);
const digestSuffix = evidence.digest.slice("sha256:".length, "sha256:".length + 12);
const registryTemplateName = `avantiqo-audio-registry-xl-lm-${digestSuffix}`;
const candidateName = `avantiqo-audio-v1-registry-candidate-${digestSuffix}`;
const existingRegistryTemplates = templates.filter((template) => text(template?.name) === registryTemplateName);
if (existingRegistryTemplates.length > 1) {
  throw new Error(`AVANTIQO_AUDIO_REGISTRY_TEMPLATE_AMBIGUOUS:matches=${existingRegistryTemplates.length}`);
}
const candidateMatches = endpoints.filter((endpoint) => text(endpoint?.name) === candidateName);
if (candidateMatches.length > 1) {
  throw new Error(`AVANTIQO_AUDIO_REGISTRY_CANDIDATE_AMBIGUOUS:matches=${candidateMatches.length}`);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  cause: "EXISTING_AUDIO_ENDPOINT_RETAINS_RUNPOD_GITHUB_DEPLOY_LINEAGE",
  current_endpoint: {
    id: configuredEndpointId,
    name: text(currentEndpoint?.name),
    template_id: currentTemplateId,
    image_reference_kind: "RUNPOD_GITHUB_BUILD",
    workers_min: finite(currentEndpoint?.workersMin),
    workers_max: finite(currentEndpoint?.workersMax),
    gpu_type_ids: list(currentEndpoint?.gpuTypeIds).map(text).filter(Boolean),
    network_volume_ids: endpointVolumeIds(currentEndpoint),
  },
  github_template: {
    id: text(githubTemplate?.id),
    name: text(githubTemplate?.name),
  },
  target: {
    registry_template_name: registryTemplateName,
    registry_template_exists: existingRegistryTemplates.length === 1,
    candidate_endpoint_name: candidateName,
    candidate_endpoint_exists: candidateMatches.length === 1,
    source_locked_image_tag: evidence.imageTag,
    immutable_digest_evidence: evidence.digest,
    quality_profile: EXPECTED_QUALITY_PROFILE,
    lm_model: EXPECTED_LM_MODEL,
    lm_backend: EXPECTED_LM_BACKEND,
  },
  queue,
  management_workers: management,
  safety: {
    generation_jobs_submitted: 0,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    existing_endpoint_deleted: false,
    existing_template_deleted: false,
    old_endpoint_retained_for_rollback: true,
    local_env_only_binding_update: apply,
    vercel_environment_mutated: false,
    secrets_printed: false,
  },
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log("AVANTIQO_AUDIO_REGISTRY_MIGRATION_APPLIED=false");
  process.exit(0);
}

// Put the GitHub-origin endpoint back onto its own GitHub-managed template before
// creating any registry-backed resource. This prevents future GitHub builds from
// overwriting the new registry template.
if (currentTemplateId !== text(githubTemplate?.id)) {
  await rest(`/endpoints/${encodeURIComponent(configuredEndpointId)}`, managementKey, {
    method: "PATCH",
    body: { templateId: text(githubTemplate.id) },
  });
}

let registryTemplate = existingRegistryTemplates[0] || null;
if (!registryTemplate) {
  registryTemplate = await rest("/templates", managementKey, {
    method: "POST",
    body: {
      imageName: evidence.imageTag,
      name: registryTemplateName,
      category: "NVIDIA",
      containerDiskInGb: Math.max(30, finite(currentTemplate?.containerDiskInGb, 30)),
      containerRegistryAuthId: registryAuthId,
      dockerEntrypoint: list(currentTemplate?.dockerEntrypoint),
      dockerStartCmd: list(currentTemplate?.dockerStartCmd),
      env,
      isPublic: false,
      isServerless: true,
      ports: list(currentTemplate?.ports),
      readme: "Avantiqo-owned Audio/Music registry-backed ACE-Step 1.5 XL Turbo + 1.7B LM template. Detached from RunPod GitHub deployment automation. Image SHA tag is backed by immutable digest evidence in the repository.",
      volumeInGb: 0,
      volumeMountPath: text(currentTemplate?.volumeMountPath) || "/workspace",
    },
  });
}
const registryTemplateId = text(registryTemplate?.id);
if (!registryTemplateId) throw new Error("AVANTIQO_AUDIO_REGISTRY_TEMPLATE_ID_REQUIRED");
registryTemplate = await directTemplate(registryTemplateId, managementKey);
assertRegistryTemplate(registryTemplate, evidence, registryAuthId, registryTemplateName, env);

let candidateEndpoint = candidateMatches[0] || null;
if (!candidateEndpoint) {
  candidateEndpoint = await rest("/endpoints", managementKey, {
    method: "POST",
    body: candidateEndpointBody(currentEndpoint, registryTemplateId, candidateName),
  });
}
const candidateId = text(candidateEndpoint?.id);
if (!candidateId) throw new Error("AVANTIQO_AUDIO_REGISTRY_CANDIDATE_ENDPOINT_ID_REQUIRED");

let verifiedCandidate = await rest(
  `/endpoints/${encodeURIComponent(candidateId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(verifiedCandidate?.templateId) !== registryTemplateId) {
  throw new Error("AVANTIQO_AUDIO_REGISTRY_CANDIDATE_TEMPLATE_BINDING_INVALID");
}
if (endpointVolumeIds(verifiedCandidate)[0] !== endpointVolumeIds(currentEndpoint)[0]) {
  throw new Error("AVANTIQO_AUDIO_REGISTRY_CANDIDATE_VOLUME_NOT_PRESERVED");
}
const candidateTemplate = await directTemplate(registryTemplateId, managementKey);
assertRegistryTemplate(candidateTemplate, evidence, registryAuthId, registryTemplateName, env);

// Final name cutover only after the detached endpoint and template are verified.
await rest(`/endpoints/${encodeURIComponent(configuredEndpointId)}`, managementKey, {
  method: "PATCH",
  body: { name: RETIRED_ENDPOINT_NAME },
});
await rest(`/endpoints/${encodeURIComponent(candidateId)}`, managementKey, {
  method: "PATCH",
  body: { name: AUDIO_ENDPOINT_NAME },
});

verifiedCandidate = await rest(
  `/endpoints/${encodeURIComponent(candidateId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(verifiedCandidate?.name) !== AUDIO_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_AUDIO_REGISTRY_ENDPOINT_FINAL_NAME_VERIFY_FAILED");
}
if (text(verifiedCandidate?.templateId) !== registryTemplateId) {
  throw new Error("AVANTIQO_AUDIO_REGISTRY_ENDPOINT_FINAL_TEMPLATE_VERIFY_FAILED");
}
assertRegistryTemplate(
  await directTemplate(registryTemplateId, managementKey),
  evidence,
  registryAuthId,
  registryTemplateName,
  env,
);

await updateLocalEndpointBinding(candidateId);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  applied: true,
  old_endpoint: {
    id: configuredEndpointId,
    name: RETIRED_ENDPOINT_NAME,
    retained_for_rollback: true,
    rebound_to_github_template: true,
  },
  new_endpoint: {
    id: candidateId,
    name: AUDIO_ENDPOINT_NAME,
    template_id: registryTemplateId,
    template_name: registryTemplateName,
    deployment_source: "DOCKER_REGISTRY_TEMPLATE",
    github_deploy_lineage: false,
    source_locked_image_tag: evidence.imageTag,
    immutable_digest_evidence: evidence.digest,
    shared_network_volume_preserved: true,
    gpu_type_ids_preserved:
      JSON.stringify(list(verifiedCandidate?.gpuTypeIds)) === JSON.stringify(list(currentEndpoint?.gpuTypeIds)),
    workers_min_preserved: finite(verifiedCandidate?.workersMin) === 0,
    workers_max_preserved: finite(verifiedCandidate?.workersMax) === finite(currentEndpoint?.workersMax),
  },
  local_binding: {
    env_file: ENV_PATH,
    key: "RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID",
    updated: true,
  },
  quality_profile: EXPECTED_QUALITY_PROFILE,
  lm_model: EXPECTED_LM_MODEL,
  lm_backend: EXPECTED_LM_BACKEND,
  generation_jobs_submitted: 0,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  existing_endpoint_deleted: false,
  existing_template_deleted: false,
  vercel_environment_mutated: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_AUDIO_REGISTRY_MIGRATION_APPLIED=true");
console.log(`AVANTIQO_AUDIO_REGISTRY_ENDPOINT_ID=${candidateId}`);
