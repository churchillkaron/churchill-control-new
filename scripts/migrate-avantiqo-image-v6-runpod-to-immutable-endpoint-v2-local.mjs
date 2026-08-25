import { readFile, writeFile, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_V6_RUNPOD_IMMUTABLE_ENDPOINT_MIGRATION_V2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const IMAGE_SOURCE_PATH = "services/avantiqo-image-engine";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const IMAGE_EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4";
const ENV_PATH = ".env.local";
const MIN_NETWORK_VOLUME_GB = 64;
const EXPECTED_ENTRYPOINT = "handler_v6.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V6_PHYSICAL_VOLUME_USAGE_V1";
const EXPECTED_RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_V1";
const EXPECTED_PHYSICAL_USAGE_CONTRACT = "AVANTIQO_IMAGE_NETWORK_VOLUME_PHYSICAL_USAGE_V1";
const EXPECTED_ALLOCATION_BASIS = "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK";
const DRAIN_TIMEOUT_MS = 5 * 60 * 1000;
const DRAIN_POLL_MS = 5_000;
const REQUIRED_STABLE_DRAIN_OBSERVATIONS = 2;

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 1200);
    throw new Error(`${code}:${detail || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}

function commandStatus(name, args) {
  return spawnSync(name, args, {
    cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => Boolean(key)));
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
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
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
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
  return readJson(response, "AVANTIQO_IMAGE_V6_IMMUTABLE_V2_REST");
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_IMAGE_V6_IMMUTABLE_V2_QUEUE");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_TEMPLATE_LIST_INVALID");
  return templates;
}

function templateById(templates, templateId, label) {
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_${label}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([text(endpoint.networkVolumeId), ...list(endpoint.networkVolumeIds).map(text)].filter(Boolean))];
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

function endpointContractKey(endpoint = {}) {
  return JSON.stringify({
    gpuCount: finite(endpoint.gpuCount, 1),
    gpuTypeIds: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    scalerType: text(endpoint.scalerType),
    scalerValue: finite(endpoint.scalerValue),
    idleTimeout: finite(endpoint.idleTimeout),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
    networkVolumeIds: endpointVolumeIds(endpoint),
    dataCenterIds: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    allowedCudaVersions: list(endpoint.allowedCudaVersions).map(text).filter(Boolean),
    minCudaVersion: text(endpoint.minCudaVersion),
  });
}

function templateBody(baseTemplate, imageName, name) {
  const body = {
    containerDiskInGb: Math.max(1, finite(baseTemplate?.containerDiskInGb, 30)),
    dockerEntrypoint: list(baseTemplate?.dockerEntrypoint),
    dockerStartCmd: list(baseTemplate?.dockerStartCmd),
    env: normalizeEnv(baseTemplate?.env),
    imageName,
    isPublic: baseTemplate?.isPublic === true,
    name,
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
    idleTimeout: finite(baseEndpoint?.idleTimeout, 10),
    name,
    scalerType: text(baseEndpoint?.scalerType) || "REQUEST_COUNT",
    scalerValue: finite(baseEndpoint?.scalerValue, 1),
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
    jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: {
      idle: finite(workers.idle, 0), initializing: finite(workers.initializing, 0), ready: finite(workers.ready, 0),
      running: finite(workers.running, 0), throttled: finite(workers.throttled, 0), unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function managementSummary(endpoint = {}) {
  const workers = list(endpoint.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    desired_status: text(worker?.desiredStatus || worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status || worker?.workerStatus || worker?.runtimeStatus).toUpperCase() || null,
  }));
  const nonExited = workers.filter((worker) => worker.desired_status !== "EXITED");
  return {
    count: workers.length,
    non_exited: nonExited.length,
    all_workers_desired_exited: workers.length === 0 || nonExited.length === 0,
    workers,
  };
}

function evaluateDrain(queue, management) {
  const jobsClear = queue.jobs.in_queue === 0 && queue.jobs.in_progress === 0;
  const managementExited = management.all_workers_desired_exited === true;
  const noExecutingWorkers = queue.workers.running === 0 && queue.workers.unhealthy === 0 && (managementExited || queue.workers.throttled === 0);
  return {
    jobs_clear: jobsClear,
    no_executing_workers: noExecutingWorkers,
    management_workers_exited: managementExited,
    health_ready_idle_overlap_ignored: true,
    health_initializing_ignored_when_management_desired_exited: managementExited,
    health_throttled_ignored_when_management_desired_exited: managementExited,
    drained_candidate: jobsClear && noExecutingWorkers && managementExited,
  };
}

async function readEndpoint(endpointId, managementKey) {
  const endpoint = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
  if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_ENDPOINT_ID_MISMATCH");
  return endpoint;
}

async function readDrainSnapshot(endpointId, queueKey, managementKey) {
  const [healthRaw, endpoint] = await Promise.all([queueHealth(endpointId, queueKey), readEndpoint(endpointId, managementKey)]);
  const health = queueSummary(healthRaw);
  const management = managementSummary(endpoint);
  return { endpoint, health, management, drain: evaluateDrain(health, management) };
}

async function waitForStableDrain(endpointId, queueKey, managementKey, label) {
  const started = Date.now();
  let stable = 0;
  let latest = await readDrainSnapshot(endpointId, queueKey, managementKey);
  while (Date.now() - started < DRAIN_TIMEOUT_MS) {
    if (latest.drain.drained_candidate) {
      stable += 1;
      if (stable >= REQUIRED_STABLE_DRAIN_OBSERVATIONS) break;
    } else {
      stable = 0;
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_IMAGE_V6_IMMUTABLE_DRAIN_PROGRESS",
      label,
      elapsed_seconds: Math.round((Date.now() - started) / 1000),
      stable_drain_observations: stable,
      health: latest.health,
      management: latest.management,
      drain: latest.drain,
    }));
    await sleep(DRAIN_POLL_MS);
    latest = await readDrainSnapshot(endpointId, queueKey, managementKey);
  }
  if (!latest.drain.drained_candidate || stable < REQUIRED_STABLE_DRAIN_OBSERVATIONS) {
    throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_DRAIN_TIMEOUT:${label}`);
  }
  return { stable_drain_observations: stable, snapshot: latest };
}

async function anonymousPullProof(reference) {
  const match = text(reference).match(/^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/i);
  if (!match) return { public_pull: false, invalid_reference: true };
  const repository = match[1];
  const digest = match[2];
  const tokenUrl = new URL("https://ghcr.io/token");
  tokenUrl.searchParams.set("service", "ghcr.io");
  tokenUrl.searchParams.set("scope", `repository:${repository}:pull`);
  const tokenResponse = await fetch(tokenUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  const tokenBody = object(await tokenResponse.json().catch(() => ({})));
  const token = text(tokenBody.token || tokenBody.access_token);
  if (!tokenResponse.ok || !token) return { public_pull: false, token_status: tokenResponse.status, manifest_status: null };
  const manifestResponse = await fetch(`https://ghcr.io/v2/${repository}/manifests/${encodeURIComponent(digest)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const contentDigest = text(manifestResponse.headers.get("docker-content-digest"));
  await manifestResponse.arrayBuffer();
  const digestMatches = !contentDigest || contentDigest.toLowerCase() === digest.toLowerCase();
  return { public_pull: manifestResponse.ok && digestMatches, token_status: tokenResponse.status, manifest_status: manifestResponse.status, digest_matches: digestMatches };
}

async function readEvidence() {
  const evidence = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  if (evidence?.success !== true || evidence?.contract !== IMAGE_EVIDENCE_CONTRACT) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_VALID_EVIDENCE_REQUIRED");
  const sourceSha = text(evidence.source_sha);
  const triggerSha = text(evidence.trigger_sha);
  if (evidence.source_sha_matches_trigger !== true || sourceSha !== triggerSha || !/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_SOURCE_LOCK_INVALID");
  if (
    text(evidence.entrypoint) !== EXPECTED_ENTRYPOINT ||
    text(evidence.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION ||
    text(evidence.runtime_revision) !== EXPECTED_RUNTIME_REVISION ||
    text(evidence.runtime_probe_contract) !== "AVANTIQO_IMAGE_RUNTIME_PROBE_V1" ||
    text(evidence.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE_CONTRACT ||
    text(evidence.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS ||
    evidence.backing_filesystem_capacity_used_for_decision !== false ||
    evidence.logical_file_size_used_for_quota_decision !== false ||
    evidence.hardlink_deduplication_enabled !== true ||
    evidence.provider_job_submitted !== false ||
    evidence.image_generation_submitted !== false ||
    evidence.model_download_submitted !== false ||
    evidence.production_web_deploy !== false ||
    evidence.automatic_production_routing_enabled !== false
  ) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_SAFETY_EVIDENCE_INVALID");
  const immutableImage = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_IMAGE_REFERENCE_INVALID");
  return { evidence, sourceSha, immutableImage };
}

function assertImageSourceStable(sourceSha, immutableImage) {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_V6_IMMUTABLE_V2_GIT_FETCH_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_IMAGE_V6_IMMUTABLE_V2_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_V6_IMMUTABLE_V2_GIT_HEAD_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_V6_IMMUTABLE_V2_GIT_ORIGIN_FAILED");
  const sourceExists = commandStatus("git", ["cat-file", "-e", `${sourceSha}^{commit}`]);
  if (sourceExists.status !== 0) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_SOURCE_COMMIT_MISSING:${sourceSha}`);
  const sourceDiff = commandStatus("git", ["diff", "--quiet", sourceSha, originMain, "--", IMAGE_SOURCE_PATH]);
  if (sourceDiff.status === 1) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_SOURCE_MOVED:source=${sourceSha}:origin=${originMain}`);
  if (sourceDiff.status !== 0) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_SOURCE_EQUIVALENCE_FAILED");
  const originEvidence = JSON.parse(command("git", ["show", `origin/main:${IMAGE_EVIDENCE_PATH}`], "AVANTIQO_IMAGE_V6_IMMUTABLE_V2_ORIGIN_EVIDENCE_READ_FAILED"));
  if (originEvidence?.success !== true || originEvidence?.contract !== IMAGE_EVIDENCE_CONTRACT || originEvidence?.source_sha_matches_trigger !== true || text(originEvidence?.source_sha) !== sourceSha || text(originEvidence?.immutable_image_reference) !== immutableImage) {
    throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_IMAGE_EVIDENCE_MOVED_REPLAN_REQUIRED");
  }
  let unrelatedMainDriftTolerated = false;
  if (head !== originMain) {
    const relevant = commandStatus("git", ["diff", "--quiet", head, originMain, "--", IMAGE_SOURCE_PATH, IMAGE_EVIDENCE_PATH]);
    if (relevant.status === 1) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_RELEVANT_MAIN_DRIFT_SYNC_REQUIRED");
    if (relevant.status !== 0) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_MAIN_DRIFT_INSPECTION_FAILED");
    unrelatedMainDriftTolerated = true;
  }
  return { head, origin_main: originMain, unrelated_main_drift_tolerated: unrelatedMainDriftTolerated };
}

async function loadRunPodState(managementKey) {
  const [endpointsRaw, templates, volumesRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    endpointBoundTemplates(managementKey),
    rest("/networkvolumes", managementKey),
  ]);
  const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const volumes = normalizeListResponse(volumesRaw, ["networkVolumes", "volumes"]);
  if (!endpoints) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_ENDPOINT_LIST_INVALID");
  if (!volumes) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_VOLUME_LIST_INVALID");
  return { endpoints, templates, volumes };
}

function resolveCanonical(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry?.id) === configuredId);
    if (matches.length === 1 && text(matches[0]?.name) === IMAGE_ENDPOINT_NAME) return matches[0];
  }
  const matches = endpoints.filter((entry) => text(entry?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_CANONICAL_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function assertVolumeReady(endpoint, volumes) {
  const volumeIds = endpointVolumeIds(endpoint);
  if (!volumeIds.length) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_NETWORK_VOLUME_REQUIRED");
  const attached = volumes.filter((volume) => volumeIds.includes(text(volume?.id)));
  if (!attached.some((volume) => finite(volume?.size, 0) >= MIN_NETWORK_VOLUME_GB)) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_NETWORK_VOLUME_TOO_SMALL:min_gb=${MIN_NETWORK_VOLUME_GB}`);
  return attached.map((volume) => ({ id: text(volume?.id), name: text(volume?.name) || null, size_gb: finite(volume?.size, 0), data_center_id: text(volume?.dataCenterId || volume?.data_center_id) || null }));
}

async function prepareLocalEnvUpdate(newEndpointId, oldEndpointId) {
  const source = await readFile(ENV_PATH, "utf8");
  const replace = (input, key, value) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(input)) return input.replace(regex, `${key}=${value}`);
    return `${input}${input.endsWith("\n") ? "" : "\n"}${key}=${value}\n`;
  };
  return replace(replace(source, "RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID", newEndpointId), "RUNPOD_AVANTIQO_IMAGE_GITHUB_RETIRED_ENDPOINT_ID", oldEndpointId);
}

async function atomicWriteLocalEnv(content) {
  const temp = `${ENV_PATH}.avantiqo-image-v6-migration-v2-${process.pid}`;
  await writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
  await rename(temp, ENV_PATH);
}

const apply = process.argv.includes("--apply");
if (apply) approved("AVANTIQO_IMAGE_V6_IMMUTABLE_ENDPOINT_MIGRATION_V2_APPROVED");

const { sourceSha, immutableImage } = await readEvidence();
const sourceGuard = assertImageSourceStable(sourceSha, immutableImage);
const pullProof = await anonymousPullProof(immutableImage);
if (!pullProof.public_pull) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_PUBLIC_PULL_REQUIRED:status=${pullProof.manifest_status ?? "NONE"}`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
let runpod = await loadRunPodState(managementKey);
let canonical = resolveCanonical(runpod.endpoints);
const canonicalId = text(canonical.id);
const canonicalTemplateId = text(canonical.templateId || canonical.template?.id);
const canonicalTemplate = templateById(runpod.templates, canonicalTemplateId, "CANONICAL");
const canonicalTemplateContract = templateContractKey(canonicalTemplate);
const attachedVolumes = assertVolumeReady(canonical, runpod.volumes);
const originalWorkersMin = finite(canonical.workersMin, 0);
const originalWorkersMax = finite(canonical.workersMax, 1);
const initialSnapshot = await readDrainSnapshot(canonicalId, queueKey, managementKey);
if (initialSnapshot.health.jobs.in_queue !== 0 || initialSnapshot.health.jobs.in_progress !== 0) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_LIVE_JOBS_BLOCK");
if (initialSnapshot.health.workers.running !== 0 || initialSnapshot.health.workers.unhealthy !== 0 || initialSnapshot.management.non_exited !== 0) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_EXECUTING_WORKERS_BLOCK");

const digestSuffix = immutableImage.split("sha256:")[1].slice(0, 12);
const targetTemplateName = `avantiqo-image-immutable-${digestSuffix}`;
const candidateName = `${IMAGE_ENDPOINT_NAME}-immutable-candidate-${digestSuffix}`;
const retiredName = `${IMAGE_ENDPOINT_NAME}-github-retired`;

if (text(canonicalTemplate.name) === targetTemplateName && text(canonicalTemplate.imageName) === immutableImage) {
  const retiredMatches = runpod.endpoints.filter((entry) => text(entry?.name) === retiredName);
  const retiredId = retiredMatches.length === 1 ? text(retiredMatches[0]?.id) : "";
  if (apply && retiredId) await atomicWriteLocalEnv(await prepareLocalEnvUpdate(canonicalId, retiredId));
  console.log(JSON.stringify({ success: true, contract: CONTRACT, mode: apply ? "APPLY" : "PLAN", applied: apply, mutation_required: false, already_cut_over: true, source_guard: sourceGuard, endpoint_id: canonicalId, template_id: canonicalTemplateId, template_name: text(canonicalTemplate.name), immutable_image: immutableImage, network_volumes: attachedVolumes, provider_job_submitted: false, image_generation_submitted: false, model_download_submitted: false, production_web_deploy: false, endpoint_deleted: false, template_deleted: false, secrets_in_output: false }, null, 2));
  console.log(`AVANTIQO_IMAGE_V6_IMMUTABLE_ENDPOINT_MIGRATION_V2_APPLIED=${apply ? "true" : "false"}`);
  process.exit(0);
}

const targetMatches = runpod.templates.filter((entry) => text(entry?.name) === targetTemplateName);
const candidateMatches = runpod.endpoints.filter((entry) => text(entry?.name) === candidateName);
if (targetMatches.length > 1) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_TARGET_TEMPLATE_AMBIGUOUS:${targetMatches.length}`);
if (candidateMatches.length > 1) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_CANDIDATE_AMBIGUOUS:${candidateMatches.length}`);
const retiredCollisions = runpod.endpoints.filter((entry) => text(entry?.name) === retiredName && text(entry?.id) !== canonicalId);
if (retiredCollisions.length) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_RETIRED_NAME_COLLISION:${retiredCollisions.length}`);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  source_guard: sourceGuard,
  source_sha: sourceSha,
  immutable_image: immutableImage,
  public_pull_proof: pullProof,
  current_endpoint: { id: canonicalId, name: IMAGE_ENDPOINT_NAME, template_id: canonicalTemplateId, template_name: text(canonicalTemplate.name), workers_min: originalWorkersMin, workers_max: originalWorkersMax, gpu_type_ids: list(canonical.gpuTypeIds).map(text).filter(Boolean), network_volume_ids: endpointVolumeIds(canonical) },
  initial_health: initialSnapshot.health,
  initial_management: initialSnapshot.management,
  initial_drain_evaluation: initialSnapshot.drain,
  target: { template_name: targetTemplateName, existing_template_found: targetMatches.length === 1, candidate_endpoint_name: candidateName, existing_candidate_found: candidateMatches.length === 1, temporary_create_workers_max: 1, pre_cutover_workers_max: 0, final_workers_max: originalWorkersMax },
  network_volumes: attachedVolumes,
  mutation_required: true,
  safety: { management_plane_authoritative_for_exited_workers: true, health_ready_idle_overlap_ignored_when_management_exited: true, stable_drain_observations_required: REQUIRED_STABLE_DRAIN_OBSERVATIONS, old_endpoint_retained_for_rollback: true, old_endpoint_zero_scaled_at_cutover: true, old_template_untouched: true, generation_jobs_submitted: 0, image_generation_submitted: false, model_download_submitted: false, production_deploy_performed: false, endpoint_deleted: false, template_deleted: false, secrets_printed: false },
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_IMAGE_V6_IMMUTABLE_ENDPOINT_MIGRATION_V2_APPLIED=false");
  process.exit(0);
}

let oldDrained = false;
let oldRenamed = false;
let candidateRenamed = false;
let candidateId = "";
try {
  await rest(`/endpoints/${encodeURIComponent(canonicalId)}`, managementKey, { method: "PATCH", body: { workersMin: 0, workersMax: 0 } });
  oldDrained = true;
  const canonicalDrain = await waitForStableDrain(canonicalId, queueKey, managementKey, "CANONICAL");

  runpod = await loadRunPodState(managementKey);
  canonical = runpod.endpoints.find((entry) => text(entry?.id) === canonicalId);
  if (!canonical || text(canonical.name) !== IMAGE_ENDPOINT_NAME) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_CANONICAL_MOVED_AFTER_DRAIN");
  const freshCanonicalTemplate = templateById(runpod.templates, text(canonical.templateId || canonical.template?.id), "FRESH_CANONICAL");
  if (text(freshCanonicalTemplate.id) !== canonicalTemplateId || templateContractKey(freshCanonicalTemplate) !== canonicalTemplateContract) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_CANONICAL_TEMPLATE_CONTRACT_MOVED");

  let targetTemplate = runpod.templates.find((entry) => text(entry?.name) === targetTemplateName) || null;
  if (!targetTemplate) {
    await rest("/templates", managementKey, { method: "POST", body: { ...templateBody(freshCanonicalTemplate, immutableImage, targetTemplateName), category: "NVIDIA", isServerless: true } });
    runpod = await loadRunPodState(managementKey);
    const created = runpod.templates.filter((entry) => text(entry?.name) === targetTemplateName);
    if (created.length !== 1) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_TARGET_TEMPLATE_CREATE_RESOLUTION_FAILED:${created.length}`);
    targetTemplate = created[0];
  }
  const targetTemplateId = text(targetTemplate.id);
  if (text(targetTemplate.imageName) !== immutableImage || templateContractKey(targetTemplate) !== canonicalTemplateContract) {
    const consumers = runpod.endpoints.filter((entry) => text(entry?.templateId || entry?.template?.id) === targetTemplateId);
    const foreign = consumers.filter((entry) => text(entry?.name) !== candidateName);
    if (foreign.length) throw new Error(`AVANTIQO_IMAGE_V6_IMMUTABLE_V2_TARGET_TEMPLATE_IN_USE:${foreign.length}`);
    await rest(`/templates/${encodeURIComponent(targetTemplateId)}/update`, managementKey, { method: "POST", body: templateBody(freshCanonicalTemplate, immutableImage, targetTemplateName) });
    runpod = await loadRunPodState(managementKey);
    targetTemplate = templateById(runpod.templates, targetTemplateId, "UPDATED_TARGET");
  }
  if (text(targetTemplate.imageName) !== immutableImage || templateContractKey(targetTemplate) !== canonicalTemplateContract) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_TARGET_TEMPLATE_VERIFY_FAILED");

  let candidate = runpod.endpoints.find((entry) => text(entry?.name) === candidateName) || null;
  if (!candidate) {
    candidate = await rest("/endpoints", managementKey, { method: "POST", body: endpointBody(canonical, targetTemplateId, candidateName, 1) });
  }
  candidateId = text(candidate.id);
  if (!candidateId) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_CANDIDATE_ID_REQUIRED");
  await rest(`/endpoints/${encodeURIComponent(candidateId)}`, managementKey, { method: "PATCH", body: { workersMin: 0, workersMax: 0 } });
  const candidateDrain = await waitForStableDrain(candidateId, queueKey, managementKey, "CANDIDATE");

  const finalSourceGuard = assertImageSourceStable(sourceSha, immutableImage);
  runpod = await loadRunPodState(managementKey);
  canonical = runpod.endpoints.find((entry) => text(entry?.id) === canonicalId);
  candidate = runpod.endpoints.find((entry) => text(entry?.id) === candidateId);
  if (!canonical || text(canonical.name) !== IMAGE_ENDPOINT_NAME) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_CANONICAL_MOVED_REPLAN_REQUIRED");
  if (!candidate || text(candidate.name) !== candidateName) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_CANDIDATE_MOVED_REPLAN_REQUIRED");
  if (text(candidate.templateId || candidate.template?.id) !== targetTemplateId) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_CANDIDATE_TEMPLATE_MOVED_REPLAN_REQUIRED");
  if (endpointContractKey(candidate) !== endpointContractKey(canonical)) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_ENDPOINT_CONTRACT_DRIFT");
  assertVolumeReady(canonical, runpod.volumes);
  assertVolumeReady(candidate, runpod.volumes);

  const localEnvNext = await prepareLocalEnvUpdate(candidateId, canonicalId);
  await rest(`/endpoints/${encodeURIComponent(canonicalId)}`, managementKey, { method: "PATCH", body: { name: retiredName, workersMin: 0, workersMax: 0 } });
  oldRenamed = true;
  await rest(`/endpoints/${encodeURIComponent(candidateId)}`, managementKey, { method: "PATCH", body: { name: IMAGE_ENDPOINT_NAME, workersMin: originalWorkersMin, workersMax: originalWorkersMax } });
  candidateRenamed = true;

  runpod = await loadRunPodState(managementKey);
  const verifiedOld = runpod.endpoints.find((entry) => text(entry?.id) === canonicalId);
  const verifiedNew = runpod.endpoints.find((entry) => text(entry?.id) === candidateId);
  if (!verifiedOld || !verifiedNew) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_FINAL_ENDPOINT_RESOLUTION_FAILED");
  if (text(verifiedOld.name) !== retiredName || finite(verifiedOld.workersMin, -1) !== 0 || finite(verifiedOld.workersMax, -1) !== 0) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_RETIRED_VERIFY_FAILED");
  if (text(verifiedNew.name) !== IMAGE_ENDPOINT_NAME || finite(verifiedNew.workersMin, -1) !== originalWorkersMin || finite(verifiedNew.workersMax, -1) !== originalWorkersMax) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_NEW_CANONICAL_VERIFY_FAILED");
  const verifiedTemplate = templateById(runpod.templates, text(verifiedNew.templateId || verifiedNew.template?.id), "FINAL");
  if (text(verifiedTemplate.id) !== targetTemplateId || text(verifiedTemplate.name) !== targetTemplateName || text(verifiedTemplate.imageName) !== immutableImage || templateContractKey(verifiedTemplate) !== canonicalTemplateContract) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_FINAL_TEMPLATE_VERIFY_FAILED");
  if (endpointContractKey(verifiedNew) !== endpointContractKey(canonical)) throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_V2_FINAL_ENDPOINT_CONTRACT_VERIFY_FAILED");
  const verifiedVolumes = assertVolumeReady(verifiedNew, runpod.volumes);
  await atomicWriteLocalEnv(localEnvNext);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    applied: true,
    source_guard: finalSourceGuard,
    old_endpoint: { id: canonicalId, name: retiredName, workers_min: 0, workers_max: 0, retained_for_rollback: true, template_untouched: true },
    new_endpoint: { id: candidateId, name: IMAGE_ENDPOINT_NAME, template_id: targetTemplateId, template_name: targetTemplateName, immutable_image: immutableImage, source_sha: sourceSha, workers_min: finite(verifiedNew.workersMin), workers_max: finite(verifiedNew.workersMax), gpu_type_ids: list(verifiedNew.gpuTypeIds).map(text).filter(Boolean), endpoint_contract_preserved: true, network_volumes: verifiedVolumes },
    drain: { canonical: canonicalDrain, candidate: candidateDrain, management_plane_authoritative: true },
    local_binding_updated: true,
    provider_job_submitted: false,
    image_generation_submitted: false,
    model_download_submitted: false,
    production_web_deploy: false,
    endpoint_deleted: false,
    template_deleted: false,
    secrets_in_output: false,
    next_action: "RUN_IMAGE_VIDEO_READINESS_AND_IMAGE_RUNTIME_PROBE",
  }, null, 2));
  console.log("AVANTIQO_IMAGE_V6_IMMUTABLE_ENDPOINT_MIGRATION_V2_APPLIED=true");
} catch (error) {
  const rollbackErrors = [];
  if (candidateRenamed && candidateId) {
    try { await rest(`/endpoints/${encodeURIComponent(candidateId)}`, managementKey, { method: "PATCH", body: { name: candidateName, workersMin: 0, workersMax: 0 } }); }
    catch (rollbackError) { rollbackErrors.push(`candidate:${text(rollbackError?.message || rollbackError)}`); }
  }
  if (oldRenamed) {
    try { await rest(`/endpoints/${encodeURIComponent(canonicalId)}`, managementKey, { method: "PATCH", body: { name: IMAGE_ENDPOINT_NAME, workersMin: originalWorkersMin, workersMax: originalWorkersMax } }); }
    catch (rollbackError) { rollbackErrors.push(`old:${text(rollbackError?.message || rollbackError)}`); }
  } else if (oldDrained) {
    try { await rest(`/endpoints/${encodeURIComponent(canonicalId)}`, managementKey, { method: "PATCH", body: { workersMin: originalWorkersMin, workersMax: originalWorkersMax } }); }
    catch (rollbackError) { rollbackErrors.push(`drain_restore:${text(rollbackError?.message || rollbackError)}`); }
  }
  console.error(JSON.stringify({ success: false, contract: CONTRACT, error: text(error?.message || error), rollback_attempted: oldDrained || oldRenamed || candidateRenamed, rollback_errors: rollbackErrors, provider_job_submitted: false, image_generation_submitted: false, production_web_deploy: false, secrets_in_output: false }));
  throw error;
}
