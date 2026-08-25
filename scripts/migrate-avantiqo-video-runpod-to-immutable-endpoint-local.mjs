import { readFile, writeFile, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_RUNPOD_IMMUTABLE_ENDPOINT_MIGRATION_V1";
const VIDEO_ENDPOINT_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const VIDEO_SOURCE_PATH = "services/avantiqo-video-engine";
const ENV_PATH = ".env.local";

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

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 1000);
    throw new Error(`${code}:${detail || `exit=${result.status}`}`);
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
  return readJson(response, "AVANTIQO_VIDEO_IMMUTABLE_ENDPOINT_REST");
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_VIDEO_IMMUTABLE_ENDPOINT_QUEUE");
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

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_TEMPLATE_ID_REQUIRED");
  const inline = object(endpoint?.template);
  if (Object.keys(inline).length && text(inline.id) === templateId) return inline;
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  }
  return matches[0];
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
    throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_CANONICAL_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  }
  return { endpoint: matches[0], resolution: "CANONICAL_NAME" };
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean))];
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
      `AVANTIQO_VIDEO_IMMUTABLE_LIVE_JOBS_BLOCK:in_queue=${queue.jobs.in_queue}:in_progress=${queue.jobs.in_progress}`,
    );
  }
  if (queue.workers.running !== 0 || management.non_exited !== 0) {
    throw new Error(
      `AVANTIQO_VIDEO_IMMUTABLE_ACTIVE_WORKERS_BLOCK:running=${queue.workers.running}:management_non_exited=${management.non_exited}`,
    );
  }
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

function endpointBody(baseEndpoint, templateId, name) {
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
    workersMax: finite(baseEndpoint?.workersMax, 0),
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

function assertCandidateContract(candidate, current, targetTemplateId) {
  if (text(candidate?.templateId) !== targetTemplateId) {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_TEMPLATE_BINDING_INVALID");
  }
  if (JSON.stringify(endpointVolumeIds(candidate)) !== JSON.stringify(endpointVolumeIds(current))) {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_VOLUME_NOT_PRESERVED");
  }
  if (JSON.stringify(list(candidate?.gpuTypeIds)) !== JSON.stringify(list(current?.gpuTypeIds))) {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_GPU_TYPES_NOT_PRESERVED");
  }
  if (finite(candidate?.workersMin, -1) !== 0) {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_WORKERS_MIN_INVALID");
  }
  if (finite(candidate?.workersMax, -1) !== finite(current?.workersMax, -2)) {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_WORKERS_MAX_NOT_PRESERVED");
  }
}

async function readEvidence() {
  const evidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
  if (evidence?.success !== true || evidence?.contract !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V1") {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_IMAGE_EVIDENCE_REQUIRED");
  }
  if (evidence?.source_sha_matches_trigger !== true) {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_SOURCE_TRIGGER_MATCH_REQUIRED");
  }
  const sourceSha = text(evidence.source_sha);
  const image = text(evidence.immutable_image_reference);
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_SOURCE_SHA_INVALID");
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_IMAGE_REFERENCE_INVALID");
  }
  return { evidence, sourceSha, image };
}

function validateLocalMain(sourceSha) {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_IMMUTABLE_GIT_FETCH_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_IMMUTABLE_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_IMMUTABLE_GIT_HEAD_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_IMMUTABLE_GIT_ORIGIN_MAIN_FAILED");
  if (head !== originMain) {
    throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${originMain}`);
  }
  const sourceExists = commandStatus("git", ["cat-file", "-e", `${sourceSha}^{commit}`]);
  if (sourceExists.status !== 0) throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_SOURCE_COMMIT_MISSING:${sourceSha}`);
  const diff = commandStatus("git", ["diff", "--quiet", sourceSha, head, "--", VIDEO_SOURCE_PATH]);
  if (diff.status === 1) {
    throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_SOURCE_MOVED:source=${sourceSha}:head=${head}`);
  }
  if (diff.status !== 0) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_SOURCE_EQUIVALENCE_FAILED");
  return head;
}

async function prepareLocalEnvUpdate(newEndpointId, oldEndpointId) {
  const source = await readFile(ENV_PATH, "utf8");
  const primaryKey = "RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID";
  const retiredKey = "RUNPOD_AVANTIQO_VIDEO_GITHUB_RETIRED_ENDPOINT_ID";
  const replace = (input, key, value) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(input)) return input.replace(regex, `${key}=${value}`);
    return `${input}${input.endsWith("\n") ? "" : "\n"}${key}=${value}\n`;
  };
  return {
    source,
    next: replace(replace(source, primaryKey, newEndpointId), retiredKey, oldEndpointId),
  };
}

async function atomicWriteLocalEnv(content) {
  const temp = `${ENV_PATH}.avantiqo-video-migration-${process.pid}`;
  await writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
  await rename(temp, ENV_PATH);
}

const apply = process.argv.includes("--apply");
if (apply) approved("AVANTIQO_VIDEO_IMMUTABLE_ENDPOINT_MIGRATION_APPROVED");

const { evidence, sourceSha, image: immutableImage } = await readEvidence();
const localMain = validateLocalMain(sourceSha);
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const publicPull = await anonymousPullProof(immutableImage);
if (!publicPull.public_pull) {
  throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_PUBLIC_PULL_REQUIRED:manifest_status=${publicPull.manifest_status ?? "NONE"}`);
}

const [endpointsRaw, templates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
]);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_ENDPOINT_LIST_INVALID");
const resolved = resolveLiveEndpoint(endpoints);
const currentEndpoint = resolved.endpoint;
const currentEndpointId = text(currentEndpoint.id);
const canonicalName = text(currentEndpoint.name);
const currentTemplate = resolveTemplate(currentEndpoint, templates);
const currentTemplateId = text(currentTemplate.id);
const currentImage = text(currentTemplate.imageName);
const currentGithubManaged =
  currentImage.startsWith("registry.runpod.net/") || text(currentTemplate.name).includes("__template__");

const currentQueue = queueSummary(await queueHealth(currentEndpointId, queueKey));
const currentManagement = managementSummary(currentEndpoint);
assertNoLiveExecution(currentQueue, currentManagement);

if (!currentGithubManaged) {
  if (currentImage !== immutableImage) {
    throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_UNEXPECTED_NON_GITHUB_LINEAGE:${currentImage || "MISSING"}`);
  }
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    mutation_required: false,
    endpoint_id: currentEndpointId,
    endpoint_name: canonicalName,
    template_id: currentTemplateId,
    template_name: text(currentTemplate.name),
    immutable_image: immutableImage,
    provider_job_submitted: false,
    video_generation_submitted: false,
    production_web_deploy: false,
    secrets_in_output: false,
    next_action: "RUN_VIDEO_RUNTIME_PROBE",
  }, null, 2));
  process.exit(0);
}

const digestSuffix = immutableImage.split("sha256:")[1].slice(0, 12);
const targetTemplateName = `avantiqo-video-immutable-${digestSuffix}`;
const candidateName = `${canonicalName}-immutable-candidate-${digestSuffix}`;
const retiredName = `${canonicalName}-github-retired`;
const targetTemplates = templates.filter((entry) => text(entry?.name) === targetTemplateName);
if (targetTemplates.length > 1) {
  throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_TARGET_TEMPLATE_AMBIGUOUS:${targetTemplates.length}`);
}
const candidateMatches = endpoints.filter((entry) => text(entry?.name) === candidateName);
if (candidateMatches.length > 1) {
  throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_AMBIGUOUS:${candidateMatches.length}`);
}
const retiredCollisions = endpoints.filter(
  (entry) => text(entry?.name) === retiredName && text(entry?.id) !== currentEndpointId,
);
if (retiredCollisions.length) {
  throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_RETIRED_NAME_COLLISION:${retiredCollisions.length}`);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_main: localMain,
  cause: "LIVE_VIDEO_ENDPOINT_RETAINS_RUNPOD_GITHUB_DEPLOY_LINEAGE",
  current_endpoint: {
    id: currentEndpointId,
    name: canonicalName,
    version: finite(currentEndpoint.version),
    template_id: currentTemplateId,
    template_name: text(currentTemplate.name),
    image_reference_kind: "RUNPOD_GITHUB_BUILD",
    workers_min: finite(currentEndpoint.workersMin),
    workers_max: finite(currentEndpoint.workersMax),
    gpu_type_ids: list(currentEndpoint.gpuTypeIds).map(text).filter(Boolean),
    network_volume_ids: endpointVolumeIds(currentEndpoint),
  },
  target: {
    template_name: targetTemplateName,
    existing_template_found: targetTemplates.length === 1,
    candidate_endpoint_name: candidateName,
    existing_candidate_found: candidateMatches.length === 1,
    immutable_image: immutableImage,
    source_sha: sourceSha,
    github_run_id: text(evidence.github_run_id),
    public_pull_proof: publicPull,
  },
  queue: currentQueue,
  management_workers: currentManagement,
  mutation_required: true,
  safety: {
    old_endpoint_retained_for_rollback: true,
    old_endpoint_zero_scaled_at_cutover: true,
    old_template_untouched: true,
    generation_jobs_submitted: 0,
    video_generation_submitted: false,
    production_deploy_performed: false,
    existing_endpoint_deleted: false,
    existing_template_deleted: false,
    vercel_environment_mutated: false,
    secrets_printed: false,
  },
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_IMMUTABLE_ENDPOINT_MIGRATION_APPLIED=false");
  process.exit(0);
}

const originalWorkersMin = finite(currentEndpoint.workersMin, 0);
const originalWorkersMax = finite(currentEndpoint.workersMax, 0);
const currentContractKey = templateContractKey(currentTemplate);
let targetTemplate = targetTemplates[0] || null;
const desiredTemplateBody = templateBody(currentTemplate, immutableImage, targetTemplateName);

if (!targetTemplate) {
  targetTemplate = await rest("/templates", managementKey, {
    method: "POST",
    body: { ...desiredTemplateBody, category: "NVIDIA", isServerless: true },
  });
} else {
  const targetId = text(targetTemplate.id);
  if (!targetId) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_TARGET_TEMPLATE_ID_REQUIRED");
  const targetConsumers = endpoints.filter(
    (entry) => text(entry?.templateId || entry?.template?.id) === targetId,
  );
  const foreignConsumers = targetConsumers.filter((entry) => text(entry?.name) !== candidateName);
  if (foreignConsumers.length) {
    throw new Error(`AVANTIQO_VIDEO_IMMUTABLE_TARGET_TEMPLATE_IN_USE:${foreignConsumers.length}`);
  }
  if (
    text(targetTemplate.imageName) !== immutableImage ||
    templateContractKey(targetTemplate) !== currentContractKey
  ) {
    await rest(`/templates/${encodeURIComponent(targetId)}/update`, managementKey, {
      method: "POST",
      body: desiredTemplateBody,
    });
    targetTemplate = await rest(`/templates/${encodeURIComponent(targetId)}`, managementKey);
  }
}

const targetTemplateId = text(targetTemplate.id);
if (!targetTemplateId) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_TARGET_TEMPLATE_ID_REQUIRED");
const verifiedTargetTemplate = await rest(`/templates/${encodeURIComponent(targetTemplateId)}`, managementKey);
if (text(verifiedTargetTemplate.imageName) !== immutableImage) {
  throw new Error("AVANTIQO_VIDEO_IMMUTABLE_TARGET_TEMPLATE_IMAGE_VERIFY_FAILED");
}
if (templateContractKey(verifiedTargetTemplate) !== currentContractKey) {
  throw new Error("AVANTIQO_VIDEO_IMMUTABLE_TARGET_TEMPLATE_CONTRACT_VERIFY_FAILED");
}

let candidate = candidateMatches[0] || null;
if (!candidate) {
  candidate = await rest("/endpoints", managementKey, {
    method: "POST",
    body: endpointBody(currentEndpoint, targetTemplateId, candidateName),
  });
}
const candidateId = text(candidate.id);
if (!candidateId) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_CANDIDATE_ID_REQUIRED");
candidate = await rest(
  `/endpoints/${encodeURIComponent(candidateId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
assertCandidateContract(candidate, currentEndpoint, targetTemplateId);
const candidateQueue = queueSummary(await queueHealth(candidateId, queueKey));
const candidateManagement = managementSummary(candidate);
assertNoLiveExecution(candidateQueue, candidateManagement);

command("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_IMMUTABLE_GIT_FETCH_BEFORE_CUTOVER_FAILED");
const headBeforeCutover = command("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_IMMUTABLE_HEAD_BEFORE_CUTOVER_FAILED");
const originBeforeCutover = command("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_IMMUTABLE_ORIGIN_BEFORE_CUTOVER_FAILED");
if (headBeforeCutover !== localMain || originBeforeCutover !== localMain) {
  throw new Error(
    `AVANTIQO_VIDEO_IMMUTABLE_MAIN_MOVED_REPLAN_REQUIRED:planned=${localMain}:head=${headBeforeCutover}:origin=${originBeforeCutover}`,
  );
}

const [freshEndpointsRaw, freshTemplates, freshHealth] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
  queueHealth(currentEndpointId, queueKey),
]);
const freshEndpoints = normalizeListResponse(freshEndpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!freshEndpoints) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_FRESH_ENDPOINT_LIST_INVALID");
const freshCurrentMatches = freshEndpoints.filter((entry) => text(entry?.id) === currentEndpointId);
if (freshCurrentMatches.length !== 1 || text(freshCurrentMatches[0]?.name) !== canonicalName) {
  throw new Error("AVANTIQO_VIDEO_IMMUTABLE_CURRENT_ENDPOINT_MOVED_REPLAN_REQUIRED");
}
const freshCurrent = freshCurrentMatches[0];
const freshCurrentTemplate = resolveTemplate(freshCurrent, freshTemplates);
if (text(freshCurrentTemplate.id) !== currentTemplateId) {
  throw new Error("AVANTIQO_VIDEO_IMMUTABLE_CURRENT_TEMPLATE_MOVED_REPLAN_REQUIRED");
}
if (templateContractKey(freshCurrentTemplate) !== currentContractKey) {
  throw new Error("AVANTIQO_VIDEO_IMMUTABLE_CURRENT_TEMPLATE_CONTRACT_CHANGED_REPLAN_REQUIRED");
}
const freshQueue = queueSummary(freshHealth);
const freshManagement = managementSummary(freshCurrent);
assertNoLiveExecution(freshQueue, freshManagement);

const localEnvUpdate = await prepareLocalEnvUpdate(candidateId, currentEndpointId);
let oldCutover = false;
let candidateCutover = false;
try {
  await rest(`/endpoints/${encodeURIComponent(currentEndpointId)}`, managementKey, {
    method: "PATCH",
    body: { name: retiredName, workersMin: 0, workersMax: 0 },
  });
  oldCutover = true;

  await rest(`/endpoints/${encodeURIComponent(candidateId)}`, managementKey, {
    method: "PATCH",
    body: { name: canonicalName },
  });
  candidateCutover = true;

  const [verifiedOld, verifiedNew] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(currentEndpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    rest(`/endpoints/${encodeURIComponent(candidateId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  ]);
  if (text(verifiedOld.name) !== retiredName) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_RETIRED_NAME_VERIFY_FAILED");
  if (finite(verifiedOld.workersMin, -1) !== 0 || finite(verifiedOld.workersMax, -1) !== 0) {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_RETIRED_ZERO_SCALE_VERIFY_FAILED");
  }
  if (text(verifiedNew.name) !== canonicalName) throw new Error("AVANTIQO_VIDEO_IMMUTABLE_NEW_NAME_VERIFY_FAILED");
  assertCandidateContract(verifiedNew, currentEndpoint, targetTemplateId);
  const finalTemplate = await rest(`/templates/${encodeURIComponent(targetTemplateId)}`, managementKey);
  if (text(finalTemplate.imageName) !== immutableImage) {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_FINAL_IMAGE_VERIFY_FAILED");
  }
  if (templateContractKey(finalTemplate) !== currentContractKey) {
    throw new Error("AVANTIQO_VIDEO_IMMUTABLE_FINAL_TEMPLATE_CONTRACT_VERIFY_FAILED");
  }

  await atomicWriteLocalEnv(localEnvUpdate.next);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    applied: true,
    old_endpoint: {
      id: currentEndpointId,
      name: retiredName,
      workers_min: 0,
      workers_max: 0,
      retained_for_rollback: true,
      template_untouched: true,
    },
    new_endpoint: {
      id: candidateId,
      name: canonicalName,
      template_id: targetTemplateId,
      template_name: targetTemplateName,
      immutable_image: immutableImage,
      source_sha: sourceSha,
      workers_min: finite(verifiedNew.workersMin),
      workers_max: finite(verifiedNew.workersMax),
      gpu_type_ids_preserved: true,
      network_volumes_preserved: true,
    },
    local_binding_updated: true,
    provider_job_submitted: false,
    video_generation_submitted: false,
    model_download_submitted: false,
    production_web_deploy: false,
    existing_endpoint_deleted: false,
    existing_template_deleted: false,
    vercel_environment_mutated: false,
    secrets_in_output: false,
    next_action: "RUN_VIDEO_RUNTIME_PROBE",
  }, null, 2));
  console.log("AVANTIQO_VIDEO_IMMUTABLE_ENDPOINT_MIGRATION_APPLIED=true");
} catch (error) {
  const rollbackErrors = [];
  if (candidateCutover) {
    try {
      await rest(`/endpoints/${encodeURIComponent(candidateId)}`, managementKey, {
        method: "PATCH",
        body: { name: candidateName },
      });
    } catch (rollbackError) {
      rollbackErrors.push(`candidate_name:${text(rollbackError?.message || rollbackError)}`);
    }
  }
  if (oldCutover) {
    try {
      await rest(`/endpoints/${encodeURIComponent(currentEndpointId)}`, managementKey, {
        method: "PATCH",
        body: { name: canonicalName, workersMin: originalWorkersMin, workersMax: originalWorkersMax },
      });
    } catch (rollbackError) {
      rollbackErrors.push(`old_endpoint:${text(rollbackError?.message || rollbackError)}`);
    }
  }
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: text(error?.message || error),
    rollback_attempted: oldCutover || candidateCutover,
    rollback_errors: rollbackErrors,
    provider_job_submitted: false,
    video_generation_submitted: false,
    production_web_deploy: false,
    secrets_in_output: false,
  }));
  throw error;
}
