import { readFile, writeFile, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_IMMUTABLE_ENDPOINT_CUTOVER_V3";
const VIDEO_SOURCE_PATH = "services/avantiqo-video-engine";
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const ENV_PATH = ".env.local";
const CANONICAL_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

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
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1000) || `exit=${result.status}`}`);
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
    return Object.fromEntries(value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => key));
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
  return readJson(response, "AVANTIQO_VIDEO_CUTOVER_V3_REST");
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_VIDEO_CUTOVER_V3_QUEUE");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_TEMPLATE_LIST_INVALID");
  return templates;
}

function templateById(templates, templateId, label) {
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_CUTOVER_V3_${label}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
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

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([text(endpoint.networkVolumeId), ...list(endpoint.networkVolumeIds).map(text)].filter(Boolean))];
}

function endpointContractKey(endpoint = {}) {
  return JSON.stringify({
    computeType: text(endpoint.computeType),
    executionTimeoutMs: finite(endpoint.executionTimeoutMs),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
    gpuCount: finite(endpoint.gpuCount, 1),
    gpuTypeIds: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    idleTimeout: finite(endpoint.idleTimeout),
    scalerType: text(endpoint.scalerType),
    scalerValue: finite(endpoint.scalerValue),
    networkVolumeIds: endpointVolumeIds(endpoint),
    dataCenterIds: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    allowedCudaVersions: list(endpoint.allowedCudaVersions).map(text).filter(Boolean),
    minCudaVersion: text(endpoint.minCudaVersion),
  });
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
  return {
    count: workers.length,
    non_exited: workers.filter((worker) => worker.desired_status !== "EXITED").length,
    workers,
  };
}

function assertIdle(queue, management, prefix) {
  if (queue.jobs.in_queue || queue.jobs.in_progress) {
    throw new Error(`${prefix}_LIVE_JOBS_BLOCK:in_queue=${queue.jobs.in_queue}:in_progress=${queue.jobs.in_progress}`);
  }
  if (queue.workers.idle || queue.workers.ready || queue.workers.running || queue.workers.throttled || queue.workers.unhealthy || management.non_exited) {
    throw new Error(`${prefix}_ACTIVE_WORKERS_BLOCK:idle=${queue.workers.idle}:ready=${queue.workers.ready}:running=${queue.workers.running}:throttled=${queue.workers.throttled}:unhealthy=${queue.workers.unhealthy}:management_non_exited=${management.non_exited}`);
  }
  return { stale_initializing_tolerated: queue.workers.initializing > 0 && management.non_exited === 0 };
}

async function readEvidence() {
  const evidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
  if (evidence?.success !== true || evidence?.contract !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V1" || evidence?.source_sha_matches_trigger !== true) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_VALID_IMAGE_EVIDENCE_REQUIRED");
  }
  const sourceSha = text(evidence.source_sha);
  const immutableImage = text(evidence.immutable_image_reference);
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_SOURCE_SHA_INVALID");
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_IMMUTABLE_IMAGE_INVALID");
  }
  return { sourceSha, immutableImage };
}

function assertVideoSourceStable(sourceSha, immutableImage) {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_CUTOVER_V3_GIT_FETCH_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_CUTOVER_V3_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_CUTOVER_V3_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_CUTOVER_V3_GIT_HEAD_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_CUTOVER_V3_GIT_ORIGIN_FAILED");
  const sourceDiff = commandStatus("git", ["diff", "--quiet", sourceSha, originMain, "--", VIDEO_SOURCE_PATH]);
  if (sourceDiff.status === 1) throw new Error(`AVANTIQO_VIDEO_CUTOVER_V3_VIDEO_SOURCE_MOVED:source=${sourceSha}:origin=${originMain}`);
  if (sourceDiff.status !== 0) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_VIDEO_SOURCE_EQUIVALENCE_FAILED");
  const originEvidence = JSON.parse(command("git", ["show", `origin/main:${VIDEO_EVIDENCE_PATH}`], "AVANTIQO_VIDEO_CUTOVER_V3_ORIGIN_EVIDENCE_READ_FAILED"));
  if (originEvidence?.success !== true || originEvidence?.source_sha_matches_trigger !== true || text(originEvidence?.source_sha) !== sourceSha || text(originEvidence?.immutable_image_reference) !== immutableImage) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_IMAGE_EVIDENCE_MOVED_REPLAN_REQUIRED");
  }
  let unrelatedMainDriftTolerated = false;
  if (head !== originMain) {
    const relevant = commandStatus("git", ["diff", "--quiet", head, originMain, "--", VIDEO_SOURCE_PATH, VIDEO_EVIDENCE_PATH]);
    if (relevant.status === 1) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_RELEVANT_MAIN_DRIFT_SYNC_REQUIRED");
    if (relevant.status !== 0) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_MAIN_DRIFT_INSPECTION_FAILED");
    unrelatedMainDriftTolerated = true;
  }
  return { head, origin_main: originMain, unrelated_main_drift_tolerated: unrelatedMainDriftTolerated };
}

async function prepareLocalEnvUpdate(newEndpointId, oldEndpointId) {
  const source = await readFile(ENV_PATH, "utf8");
  const replace = (input, key, value) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(input)) return input.replace(regex, `${key}=${value}`);
    return `${input}${input.endsWith("\n") ? "" : "\n"}${key}=${value}\n`;
  };
  return replace(replace(source, "RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID", newEndpointId), "RUNPOD_AVANTIQO_VIDEO_GITHUB_RETIRED_ENDPOINT_ID", oldEndpointId);
}

async function atomicWriteLocalEnv(content) {
  const temp = `${ENV_PATH}.avantiqo-video-cutover-v3-${process.pid}`;
  await writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
  await rename(temp, ENV_PATH);
}

async function inspectState(managementKey, queueKey, immutableImage) {
  const [endpointsRaw, templates] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    endpointBoundTemplates(managementKey),
  ]);
  const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_ENDPOINT_LIST_INVALID");
  const canonicalMatches = endpoints.filter((entry) => CANONICAL_NAMES.has(text(entry?.name)));
  if (canonicalMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_CUTOVER_V3_CANONICAL_ENDPOINT_AMBIGUOUS:${canonicalMatches.length}`);
  const canonical = canonicalMatches[0];
  const canonicalId = text(canonical.id);
  const canonicalName = text(canonical.name);
  const canonicalTemplateId = text(canonical.templateId || canonical.template?.id);
  const canonicalTemplate = templateById(templates, canonicalTemplateId, "CANONICAL");
  const digestSuffix = immutableImage.split("sha256:")[1].slice(0, 12);
  const targetTemplateName = `avantiqo-video-immutable-${digestSuffix}`;
  const targetMatches = templates.filter((entry) => text(entry?.name) === targetTemplateName);
  if (targetMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_CUTOVER_V3_TARGET_TEMPLATE_REQUIRED:${targetMatches.length}`);
  const targetTemplate = targetMatches[0];
  if (text(targetTemplate.imageName) !== immutableImage) {
    throw new Error(`AVANTIQO_VIDEO_CUTOVER_V3_TARGET_IMAGE_MISMATCH:${text(targetTemplate.imageName) || "MISSING"}`);
  }
  const retiredName = `${canonicalName}-github-retired`;
  if (canonicalTemplateId === text(targetTemplate.id)) {
    const retiredMatches = endpoints.filter((entry) => text(entry?.name) === retiredName);
    const canonicalQueue = queueSummary(await queueHealth(canonicalId, queueKey));
    const canonicalManagement = managementSummary(canonical);
    const canonicalIdle = assertIdle(canonicalQueue, canonicalManagement, "AVANTIQO_VIDEO_CUTOVER_V3_CANONICAL");
    return { alreadyCutOver: true, canonical, canonicalId, canonicalName, canonicalTemplate, targetTemplate, retired: retiredMatches[0] || null, canonicalQueue, canonicalManagement, canonicalIdle };
  }
  const candidateName = `${canonicalName}-immutable-candidate-${digestSuffix}`;
  const candidateMatches = endpoints.filter((entry) => text(entry?.name) === candidateName);
  if (candidateMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_CUTOVER_V3_CANDIDATE_ENDPOINT_REQUIRED:${candidateMatches.length}`);
  const candidate = candidateMatches[0];
  const candidateId = text(candidate.id);
  const candidateTemplateId = text(candidate.templateId || candidate.template?.id);
  if (candidateTemplateId !== text(targetTemplate.id)) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_CANDIDATE_TEMPLATE_ID_MISMATCH");
  const candidateTemplate = templateById(templates, candidateTemplateId, "CANDIDATE");
  if (text(candidateTemplate.imageName) !== immutableImage) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_CANDIDATE_IMAGE_MISMATCH");
  if (templateContractKey(candidateTemplate) !== templateContractKey(canonicalTemplate)) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_TEMPLATE_CONTRACT_DRIFT");
  if (endpointContractKey(candidate) !== endpointContractKey(canonical)) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_ENDPOINT_CONTRACT_DRIFT");
  if (finite(candidate.workersMin, -1) !== 0 || finite(candidate.workersMax, -1) !== 0) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_CANDIDATE_NOT_ZERO_SCALED");
  const retiredCollisions = endpoints.filter((entry) => text(entry?.name) === retiredName && text(entry?.id) !== canonicalId);
  if (retiredCollisions.length) throw new Error(`AVANTIQO_VIDEO_CUTOVER_V3_RETIRED_NAME_COLLISION:${retiredCollisions.length}`);
  const [canonicalHealth, candidateHealth] = await Promise.all([queueHealth(canonicalId, queueKey), queueHealth(candidateId, queueKey)]);
  const canonicalQueue = queueSummary(canonicalHealth);
  const candidateQueue = queueSummary(candidateHealth);
  const canonicalManagement = managementSummary(canonical);
  const candidateManagement = managementSummary(candidate);
  const canonicalIdle = assertIdle(canonicalQueue, canonicalManagement, "AVANTIQO_VIDEO_CUTOVER_V3_CANONICAL");
  const candidateIdle = assertIdle(candidateQueue, candidateManagement, "AVANTIQO_VIDEO_CUTOVER_V3_CANDIDATE");
  return {
    alreadyCutOver: false, canonical, candidate, canonicalId, candidateId, canonicalName, candidateName, retiredName,
    canonicalTemplate, candidateTemplate, targetTemplate, canonicalQueue, candidateQueue, canonicalManagement, candidateManagement, canonicalIdle, candidateIdle,
  };
}

const apply = process.argv.includes("--apply");
if (apply) approved("AVANTIQO_VIDEO_IMMUTABLE_CUTOVER_V3_APPROVED");
const { sourceSha, immutableImage } = await readEvidence();
const sourceGuard = assertVideoSourceStable(sourceSha, immutableImage);
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
let state = await inspectState(managementKey, queueKey, immutableImage);

if (state.alreadyCutOver) {
  const retiredId = text(state.retired?.id);
  if (apply && retiredId) await atomicWriteLocalEnv(await prepareLocalEnvUpdate(state.canonicalId, retiredId));
  console.log(JSON.stringify({
    success: true, contract: CONTRACT, mode: apply ? "APPLY" : "PLAN", applied: apply, mutation_required: false, already_cut_over: true,
    source_guard: sourceGuard, endpoint_id: state.canonicalId, endpoint_name: state.canonicalName,
    template_id: text(state.targetTemplate.id), template_name: text(state.targetTemplate.name), immutable_image: text(state.targetTemplate.imageName),
    retired_endpoint_id: retiredId || null, local_binding_updated: apply && Boolean(retiredId), provider_job_submitted: false,
    video_generation_submitted: false, production_web_deploy: false, endpoint_deleted: false, template_deleted: false, secrets_in_output: false,
  }, null, 2));
  console.log(`AVANTIQO_VIDEO_IMMUTABLE_CUTOVER_V3_APPLIED=${apply ? "true" : "false"}`);
  process.exit(0);
}

console.log(JSON.stringify({
  success: true, contract: CONTRACT, mode: apply ? "APPLY" : "PLAN", source_guard: sourceGuard, source_sha: sourceSha,
  immutable_image: immutableImage, template_resolution: "ENDPOINT_BOUND_TEMPLATE_LIST",
  canonical_endpoint: { id: state.canonicalId, name: state.canonicalName, template_id: text(state.canonicalTemplate.id), template_name: text(state.canonicalTemplate.name), workers_min: finite(state.canonical.workersMin), workers_max: finite(state.canonical.workersMax) },
  candidate_endpoint: { id: state.candidateId, name: state.candidateName, template_id: text(state.candidateTemplate.id), template_name: text(state.candidateTemplate.name), image_name: text(state.candidateTemplate.imageName), workers_min: finite(state.candidate.workersMin), workers_max: finite(state.candidate.workersMax) },
  queue: { canonical: state.canonicalQueue, candidate: state.candidateQueue }, management_workers: { canonical: state.canonicalManagement, candidate: state.candidateManagement },
  idle_guard: { canonical: state.canonicalIdle, candidate: state.candidateIdle }, mutation_required: true,
  safety: { candidate_precreated: true, old_endpoint_retained_for_rollback: true, old_endpoint_zero_scaled_at_cutover: true, old_template_untouched: true, generation_jobs_submitted: 0, video_generation_submitted: false, production_deploy_performed: false, endpoint_deleted: false, template_deleted: false, secrets_printed: false },
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_IMMUTABLE_CUTOVER_V3_APPLIED=false");
  process.exit(0);
}

const finalSourceGuard = assertVideoSourceStable(sourceSha, immutableImage);
state = await inspectState(managementKey, queueKey, immutableImage);
if (state.alreadyCutOver) {
  const retiredId = text(state.retired?.id);
  if (retiredId) await atomicWriteLocalEnv(await prepareLocalEnvUpdate(state.canonicalId, retiredId));
  console.log(JSON.stringify({ success: true, contract: CONTRACT, applied: true, mutation_required: false, already_cut_over: true, source_guard: finalSourceGuard, endpoint_id: state.canonicalId, endpoint_name: state.canonicalName, template_id: text(state.targetTemplate.id), template_name: text(state.targetTemplate.name), immutable_image: text(state.targetTemplate.imageName), retired_endpoint_id: retiredId || null, local_binding_updated: Boolean(retiredId), provider_job_submitted: false, video_generation_submitted: false, production_web_deploy: false, endpoint_deleted: false, template_deleted: false, secrets_in_output: false }, null, 2));
  console.log("AVANTIQO_VIDEO_IMMUTABLE_CUTOVER_V3_APPLIED=true");
  process.exit(0);
}

const originalWorkersMin = finite(state.canonical.workersMin, 0);
const originalWorkersMax = finite(state.canonical.workersMax, 0);
const localEnvNext = await prepareLocalEnvUpdate(state.candidateId, state.canonicalId);
let oldRenamed = false;
let candidateRenamed = false;
try {
  await rest(`/endpoints/${encodeURIComponent(state.canonicalId)}`, managementKey, { method: "PATCH", body: { name: state.retiredName, workersMin: 0, workersMax: 0 } });
  oldRenamed = true;
  await rest(`/endpoints/${encodeURIComponent(state.candidateId)}`, managementKey, { method: "PATCH", body: { name: state.canonicalName } });
  candidateRenamed = true;

  const [endpointsRaw, templates] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey), endpointBoundTemplates(managementKey),
  ]);
  const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const verifiedOld = endpoints?.find((entry) => text(entry?.id) === state.canonicalId);
  const verifiedNew = endpoints?.find((entry) => text(entry?.id) === state.candidateId);
  if (!verifiedOld || !verifiedNew) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_FINAL_ENDPOINT_RESOLUTION_FAILED");
  if (text(verifiedOld.name) !== state.retiredName || finite(verifiedOld.workersMin, -1) !== 0 || finite(verifiedOld.workersMax, -1) !== 0) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_RETIRED_VERIFY_FAILED");
  if (text(verifiedNew.name) !== state.canonicalName || finite(verifiedNew.workersMin, -1) !== 0 || finite(verifiedNew.workersMax, -1) !== 0) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_NEW_CANONICAL_VERIFY_FAILED");
  const verifiedTemplateId = text(verifiedNew.templateId || verifiedNew.template?.id);
  const verifiedTemplate = templateById(templates, verifiedTemplateId, "FINAL");
  if (verifiedTemplateId !== text(state.targetTemplate.id) || text(verifiedTemplate.name) !== text(state.targetTemplate.name) || text(verifiedTemplate.imageName) !== immutableImage) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_FINAL_TEMPLATE_VERIFY_FAILED");
  if (templateContractKey(verifiedTemplate) !== templateContractKey(state.canonicalTemplate)) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_FINAL_TEMPLATE_CONTRACT_VERIFY_FAILED");
  if (endpointContractKey(verifiedNew) !== endpointContractKey(state.canonical)) throw new Error("AVANTIQO_VIDEO_CUTOVER_V3_FINAL_ENDPOINT_CONTRACT_VERIFY_FAILED");
  await atomicWriteLocalEnv(localEnvNext);
  console.log(JSON.stringify({
    success: true, contract: CONTRACT, applied: true, source_guard: finalSourceGuard, template_resolution: "ENDPOINT_BOUND_TEMPLATE_LIST",
    old_endpoint: { id: text(verifiedOld.id), name: text(verifiedOld.name), workers_min: finite(verifiedOld.workersMin), workers_max: finite(verifiedOld.workersMax), retained_for_rollback: true, template_untouched: true },
    new_endpoint: { id: text(verifiedNew.id), name: text(verifiedNew.name), template_id: verifiedTemplateId, template_name: text(verifiedTemplate.name), immutable_image: text(verifiedTemplate.imageName), source_sha: sourceSha, workers_min: finite(verifiedNew.workersMin), workers_max: finite(verifiedNew.workersMax), endpoint_contract_preserved: true },
    local_binding_updated: true, provider_job_submitted: false, video_generation_submitted: false, model_download_submitted: false, production_web_deploy: false, endpoint_deleted: false, template_deleted: false, secrets_in_output: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_IMMUTABLE_CUTOVER_V3_APPLIED=true");
} catch (error) {
  const rollbackErrors = [];
  if (candidateRenamed) {
    try { await rest(`/endpoints/${encodeURIComponent(state.candidateId)}`, managementKey, { method: "PATCH", body: { name: state.candidateName } }); }
    catch (rollbackError) { rollbackErrors.push(`candidate:${text(rollbackError?.message || rollbackError)}`); }
  }
  if (oldRenamed) {
    try { await rest(`/endpoints/${encodeURIComponent(state.canonicalId)}`, managementKey, { method: "PATCH", body: { name: state.canonicalName, workersMin: originalWorkersMin, workersMax: originalWorkersMax } }); }
    catch (rollbackError) { rollbackErrors.push(`old:${text(rollbackError?.message || rollbackError)}`); }
  }
  console.error(JSON.stringify({ success: false, contract: CONTRACT, error: text(error?.message || error), rollback_attempted: oldRenamed || candidateRenamed, rollback_errors: rollbackErrors, provider_job_submitted: false, video_generation_submitted: false, production_web_deploy: false, secrets_in_output: false }));
  throw error;
}
