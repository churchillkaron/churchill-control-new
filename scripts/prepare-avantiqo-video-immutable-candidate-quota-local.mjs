import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_QUOTA_PREP_V1";
const VIDEO_ENDPOINT_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";

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

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}=YES_REQUIRED`);
  }
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`${prefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(pathname, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_VIDEO_CANDIDATE_QUOTA_REST");
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_VIDEO_CANDIDATE_QUOTA_QUEUE");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_TEMPLATE_LIST_INVALID");
  return templates;
}

async function anonymousPullProof(reference) {
  const match = text(reference).match(/^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/i);
  if (!match) return { public_pull: false, invalid_reference: true };
  const repository = match[1];
  const digest = match[2];
  const tokenUrl = new URL("https://ghcr.io/token");
  tokenUrl.searchParams.set("service", "ghcr.io");
  tokenUrl.searchParams.set("scope", `repository:${repository}:pull`);
  const tokenResponse = await fetch(tokenUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const tokenBody = object(await tokenResponse.json().catch(() => ({})));
  const token = text(tokenBody.token || tokenBody.access_token);
  if (!tokenResponse.ok || !token) {
    return { public_pull: false, token_status: tokenResponse.status, manifest_status: null };
  }
  const manifestResponse = await fetch(
    `https://ghcr.io/v2/${repository}/manifests/${encodeURIComponent(digest)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const contentDigest = text(manifestResponse.headers.get("docker-content-digest"));
  await manifestResponse.arrayBuffer();
  const digestMatches = !contentDigest || contentDigest.toLowerCase() === digest.toLowerCase();
  return {
    public_pull: manifestResponse.ok && digestMatches,
    token_status: tokenResponse.status,
    manifest_status: manifestResponse.status,
    digest_matches: digestMatches,
  };
}

function resolveLiveEndpoint(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry?.id) === configuredId);
    if (matches.length === 1 && VIDEO_ENDPOINT_NAMES.has(text(matches[0]?.name))) {
      return { endpoint: matches[0], resolution: "CONFIGURED_ID" };
    }
  }
  const matches = endpoints.filter((entry) => VIDEO_ENDPOINT_NAMES.has(text(entry?.name)));
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_CANDIDATE_QUOTA_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  }
  return { endpoint: matches[0], resolution: "CANONICAL_NAME" };
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_TEMPLATE_ID_REQUIRED");
  const inline = object(endpoint?.template);
  if (Object.keys(inline).length && text(inline.id) === templateId) return inline;
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_CANDIDATE_QUOTA_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  }
  return matches[0];
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean))];
}

function templateContractKey(template = {}) {
  return JSON.stringify({
    containerDiskInGb: finite(template.containerDiskInGb, 0),
    containerRegistryAuthId: text(template.containerRegistryAuthId),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    isPublic: template.isPublic === true,
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
  });
}

function templateBody(baseTemplate, imageName, templateName) {
  const body = {
    containerDiskInGb: Math.max(1, finite(baseTemplate?.containerDiskInGb, 5)),
    dockerEntrypoint: list(baseTemplate?.dockerEntrypoint),
    dockerStartCmd: list(baseTemplate?.dockerStartCmd),
    env: normalizeEnv(baseTemplate?.env),
    imageName,
    isPublic: baseTemplate?.isPublic === true,
    name: templateName,
    ports: list(baseTemplate?.ports),
    readme: text(baseTemplate?.readme),
    volumeInGb: Math.max(0, finite(baseTemplate?.volumeInGb, 0)),
    volumeMountPath: text(baseTemplate?.volumeMountPath) || "/workspace",
  };
  const registryAuthId = text(baseTemplate?.containerRegistryAuthId);
  if (registryAuthId) body.containerRegistryAuthId = registryAuthId;
  return body;
}

function endpointBody(baseEndpoint, templateId, name, workersMax) {
  const body = {
    templateId,
    computeType: text(baseEndpoint?.computeType) || "GPU",
    executionTimeoutMs: finite(baseEndpoint?.executionTimeoutMs, 1_200_000),
    flashboot: baseEndpoint?.flashboot === true || baseEndpoint?.flashBoot === true,
    gpuCount: finite(baseEndpoint?.gpuCount, 1),
    gpuTypeIds: list(baseEndpoint?.gpuTypeIds).map(text).filter(Boolean),
    idleTimeout: finite(baseEndpoint?.idleTimeout, 5),
    name,
    scalerType: text(baseEndpoint?.scalerType) || "QUEUE_DELAY",
    scalerValue: finite(baseEndpoint?.scalerValue, 4),
    workersMax,
    workersMin: 0,
  };
  const volumeIds = endpointVolumeIds(baseEndpoint);
  if (volumeIds.length === 1) body.networkVolumeId = volumeIds[0];
  if (volumeIds.length > 1) body.networkVolumeIds = volumeIds;
  const dataCenterIds = list(baseEndpoint?.dataCenterIds).map(text).filter(Boolean);
  if (dataCenterIds.length) body.dataCenterIds = dataCenterIds;
  const allowedCudaVersions = list(baseEndpoint?.allowedCudaVersions).map(text).filter(Boolean);
  if (allowedCudaVersions.length) body.allowedCudaVersions = allowedCudaVersions;
  if (text(baseEndpoint?.minCudaVersion)) body.minCudaVersion = text(baseEndpoint.minCudaVersion);
  return body;
}

function queueSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
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

function managementSummary(endpoint = {}) {
  const workers = list(endpoint.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    desired_status: text(worker?.desiredStatus || worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status || worker?.workerStatus || worker?.runtimeStatus).toUpperCase() || null,
  }));
  return {
    count: workers.length,
    non_exited: workers.filter((worker) => worker.desired_status !== "EXITED").length,
    workers,
  };
}

function assertNoLiveExecution(queue, management) {
  if (queue.jobs.in_queue !== 0 || queue.jobs.in_progress !== 0) {
    throw new Error(
      `AVANTIQO_VIDEO_CANDIDATE_QUOTA_LIVE_JOBS_BLOCK:in_queue=${queue.jobs.in_queue}:in_progress=${queue.jobs.in_progress}`,
    );
  }
  if (queue.workers.running !== 0 || management.non_exited !== 0) {
    throw new Error(
      `AVANTIQO_VIDEO_CANDIDATE_QUOTA_ACTIVE_WORKERS_BLOCK:running=${queue.workers.running}:management_non_exited=${management.non_exited}`,
    );
  }
}

const apply = process.argv.includes("--apply");
if (apply) approved("AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_QUOTA_PREP_APPROVED");

const evidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
if (evidence?.success !== true || evidence?.contract !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V1") {
  throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_IMAGE_EVIDENCE_REQUIRED");
}
if (evidence?.source_sha_matches_trigger !== true) {
  throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_SOURCE_TRIGGER_MATCH_REQUIRED");
}
const immutableImage = text(evidence.immutable_image_reference);
if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
  throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_IMMUTABLE_IMAGE_INVALID");
}
const pullProof = await anonymousPullProof(immutableImage);
if (!pullProof.public_pull) {
  throw new Error(`AVANTIQO_VIDEO_CANDIDATE_QUOTA_PUBLIC_PULL_REQUIRED:status=${pullProof.manifest_status ?? "NONE"}`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const [endpointsRaw, templates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
]);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_ENDPOINT_LIST_INVALID");

const resolved = resolveLiveEndpoint(endpoints);
const currentEndpoint = resolved.endpoint;
const currentEndpointId = text(currentEndpoint.id);
const canonicalName = text(currentEndpoint.name);
const currentTemplate = resolveTemplate(currentEndpoint, templates);
const currentQueue = queueSummary(await queueHealth(currentEndpointId, queueKey));
const currentManagement = managementSummary(currentEndpoint);
assertNoLiveExecution(currentQueue, currentManagement);

const desiredWorkersMax = Math.max(0, finite(currentEndpoint.workersMax, 0));
const bootstrapWorkersMax = desiredWorkersMax === 0 ? 1 : Math.min(desiredWorkersMax, 2);
const digestSuffix = immutableImage.split("sha256:")[1].slice(0, 12);
const targetTemplateName = `avantiqo-video-immutable-${digestSuffix}`;
const candidateName = `${canonicalName}-immutable-candidate-${digestSuffix}`;
let targetTemplateMatches = templates.filter((entry) => text(entry?.name) === targetTemplateName);
if (targetTemplateMatches.length > 1) {
  throw new Error(`AVANTIQO_VIDEO_CANDIDATE_QUOTA_TARGET_TEMPLATE_AMBIGUOUS:${targetTemplateMatches.length}`);
}
let candidateMatches = endpoints.filter((entry) => text(entry?.name) === candidateName);
if (candidateMatches.length > 1) {
  throw new Error(`AVANTIQO_VIDEO_CANDIDATE_QUOTA_CANDIDATE_AMBIGUOUS:${candidateMatches.length}`);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  cause: "RUNPOD_ENDPOINT_CREATE_ZERO_MAX_WORKERS_QUOTA_QUIRK",
  live_endpoint: {
    id: currentEndpointId,
    name: canonicalName,
    workers_min: finite(currentEndpoint.workersMin),
    workers_max: desiredWorkersMax,
    mutation_planned: false,
  },
  target: {
    template_name: targetTemplateName,
    template_exists: targetTemplateMatches.length === 1,
    candidate_name: candidateName,
    candidate_exists: candidateMatches.length === 1,
    temporary_create_workers_max: bootstrapWorkersMax,
    final_workers_min: 0,
    final_workers_max: desiredWorkersMax,
    immutable_image: immutableImage,
    public_pull_proof: pullProof,
  },
  queue: currentQueue,
  management_workers: currentManagement,
  safety: {
    canonical_endpoint_mutated: false,
    endpoint_renamed: false,
    production_deploy_performed: false,
    provider_job_submitted: false,
    video_generation_submitted: false,
    secrets_printed: false,
  },
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_QUOTA_PREP_APPLIED=false");
  process.exit(0);
}

const currentContractKey = templateContractKey(currentTemplate);
let targetTemplate = targetTemplateMatches[0] || null;
if (!targetTemplate) {
  targetTemplate = await rest("/templates", managementKey, {
    method: "POST",
    body: {
      ...templateBody(currentTemplate, immutableImage, targetTemplateName),
      category: "NVIDIA",
      isServerless: true,
    },
  });
}
const targetTemplateId = text(targetTemplate.id);
if (!targetTemplateId) throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_TARGET_TEMPLATE_ID_REQUIRED");
targetTemplate = await rest(`/templates/${encodeURIComponent(targetTemplateId)}`, managementKey);
if (text(targetTemplate.imageName) !== immutableImage) {
  throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_TARGET_IMAGE_VERIFY_FAILED");
}
if (templateContractKey(targetTemplate) !== currentContractKey) {
  throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_TARGET_CONTRACT_VERIFY_FAILED");
}

let candidate = candidateMatches[0] || null;
if (!candidate) {
  candidate = await rest("/endpoints", managementKey, {
    method: "POST",
    body: endpointBody(currentEndpoint, targetTemplateId, candidateName, bootstrapWorkersMax),
  });
}
const candidateId = text(candidate.id);
if (!candidateId) throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_CANDIDATE_ID_REQUIRED");

await rest(`/endpoints/${encodeURIComponent(candidateId)}`, managementKey, {
  method: "PATCH",
  body: { workersMin: 0, workersMax: desiredWorkersMax },
});

candidate = await rest(
  `/endpoints/${encodeURIComponent(candidateId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(candidate.templateId) !== targetTemplateId) {
  throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_TEMPLATE_BINDING_VERIFY_FAILED");
}
if (JSON.stringify(endpointVolumeIds(candidate)) !== JSON.stringify(endpointVolumeIds(currentEndpoint))) {
  throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_VOLUME_VERIFY_FAILED");
}
if (JSON.stringify(list(candidate.gpuTypeIds)) !== JSON.stringify(list(currentEndpoint.gpuTypeIds))) {
  throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_GPU_VERIFY_FAILED");
}
if (finite(candidate.workersMin, -1) !== 0 || finite(candidate.workersMax, -1) !== desiredWorkersMax) {
  throw new Error("AVANTIQO_VIDEO_CANDIDATE_QUOTA_FINAL_SCALING_VERIFY_FAILED");
}

const candidateQueue = queueSummary(await queueHealth(candidateId, queueKey));
const candidateManagement = managementSummary(candidate);
assertNoLiveExecution(candidateQueue, candidateManagement);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  applied: true,
  live_endpoint_untouched: true,
  target_template: {
    id_present: true,
    name: targetTemplateName,
    immutable_image: immutableImage,
  },
  candidate_endpoint: {
    id: candidateId,
    name: candidateName,
    workers_min: finite(candidate.workersMin),
    workers_max: finite(candidate.workersMax),
    gpu_type_ids_preserved: true,
    network_volumes_preserved: true,
    queue: candidateQueue,
    management_workers: candidateManagement,
  },
  quota_bootstrap: {
    create_workers_max: bootstrapWorkersMax,
    final_workers_max: desiredWorkersMax,
    reduced_immediately_after_create: bootstrapWorkersMax !== desiredWorkersMax,
  },
  canonical_endpoint_mutated: false,
  endpoint_renamed: false,
  production_deploy_performed: false,
  provider_job_submitted: false,
  video_generation_submitted: false,
  secrets_printed: false,
  next_action: "RUN_GUARDED_IMMUTABLE_VIDEO_ENDPOINT_MIGRATION_APPLY",
}, null, 2));
console.log("AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_QUOTA_PREP_APPLIED=true");
