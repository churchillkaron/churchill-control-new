import { readFile, writeFile, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_IMMUTABLE_ENDPOINT_CUTOVER_V1";
const VIDEO_SOURCE_PATH = "services/avantiqo-video-engine";
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const ENV_PATH = ".env.local";
const CANONICAL_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);

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

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 1200);
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
  return readJson(response, "AVANTIQO_VIDEO_CUTOVER_REST");
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_VIDEO_CUTOVER_QUEUE");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VIDEO_CUTOVER_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VIDEO_CUTOVER_TEMPLATE_ID_REQUIRED");
  const inline = object(endpoint?.template);
  if (Object.keys(inline).length && text(inline.id) === templateId) return inline;
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_CUTOVER_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  }
  return matches[0];
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
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
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

function assertNoLiveExecution(queue, management, prefix) {
  if (queue.jobs.in_queue !== 0 || queue.jobs.in_progress !== 0) {
    throw new Error(
      `${prefix}_LIVE_JOBS_BLOCK:in_queue=${queue.jobs.in_queue}:in_progress=${queue.jobs.in_progress}`,
    );
  }
  if (
    queue.workers.idle !== 0 ||
    queue.workers.ready !== 0 ||
    queue.workers.running !== 0 ||
    queue.workers.throttled !== 0 ||
    queue.workers.unhealthy !== 0 ||
    management.non_exited !== 0
  ) {
    throw new Error(
      `${prefix}_ACTIVE_WORKERS_BLOCK:idle=${queue.workers.idle}:ready=${queue.workers.ready}:running=${queue.workers.running}:throttled=${queue.workers.throttled}:unhealthy=${queue.workers.unhealthy}:management_non_exited=${management.non_exited}`,
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

function assertEndpointParity(candidate, canonical) {
  if (JSON.stringify(list(candidate?.gpuTypeIds)) !== JSON.stringify(list(canonical?.gpuTypeIds))) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_GPU_TYPES_NOT_PRESERVED");
  }
  if (JSON.stringify(endpointVolumeIds(candidate)) !== JSON.stringify(endpointVolumeIds(canonical))) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_NETWORK_VOLUMES_NOT_PRESERVED");
  }
  if (finite(candidate?.workersMin, -1) !== 0 || finite(candidate?.workersMax, -1) !== 0) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_CANDIDATE_MUST_BE_ZERO_SCALED");
  }
}

async function readEvidence() {
  const evidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
  if (evidence?.success !== true || evidence?.contract !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V1") {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_VALID_IMAGE_EVIDENCE_REQUIRED");
  }
  if (evidence?.source_sha_matches_trigger !== true) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_SOURCE_TRIGGER_MATCH_REQUIRED");
  }
  const sourceSha = text(evidence.source_sha);
  const immutableImage = text(evidence.immutable_image_reference);
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_SOURCE_SHA_INVALID");
  }
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_IMMUTABLE_IMAGE_INVALID");
  }
  return { evidence, sourceSha, immutableImage };
}

function assertVideoSourceStable(sourceSha, expectedEvidence) {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_CUTOVER_GIT_FETCH_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_CUTOVER_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_CUTOVER_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_CUTOVER_GIT_HEAD_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_CUTOVER_GIT_ORIGIN_FAILED");

  const sourceExists = commandStatus("git", ["cat-file", "-e", `${sourceSha}^{commit}`]);
  if (sourceExists.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_CUTOVER_SOURCE_COMMIT_MISSING:${sourceSha}`);
  }
  const sourceDiff = commandStatus("git", ["diff", "--quiet", sourceSha, originMain, "--", VIDEO_SOURCE_PATH]);
  if (sourceDiff.status === 1) {
    throw new Error(`AVANTIQO_VIDEO_CUTOVER_VIDEO_SOURCE_MOVED:source=${sourceSha}:origin=${originMain}`);
  }
  if (sourceDiff.status !== 0) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_VIDEO_SOURCE_EQUIVALENCE_FAILED");
  }

  const originEvidenceRaw = command(
    "git",
    ["show", `origin/main:${VIDEO_EVIDENCE_PATH}`],
    "AVANTIQO_VIDEO_CUTOVER_ORIGIN_EVIDENCE_READ_FAILED",
  );
  const originEvidence = JSON.parse(originEvidenceRaw);
  if (
    text(originEvidence?.source_sha) !== expectedEvidence.sourceSha ||
    text(originEvidence?.immutable_image_reference) !== expectedEvidence.immutableImage ||
    originEvidence?.source_sha_matches_trigger !== true
  ) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_IMAGE_EVIDENCE_MOVED_REPLAN_REQUIRED");
  }

  let unrelatedMainDriftTolerated = false;
  if (head !== originMain) {
    const relevantDiff = commandStatus(
      "git",
      ["diff", "--quiet", head, originMain, "--", VIDEO_SOURCE_PATH, VIDEO_EVIDENCE_PATH],
    );
    if (relevantDiff.status === 1) {
      throw new Error(`AVANTIQO_VIDEO_CUTOVER_RELEVANT_MAIN_DRIFT_SYNC_REQUIRED:head=${head}:origin=${originMain}`);
    }
    if (relevantDiff.status !== 0) {
      throw new Error("AVANTIQO_VIDEO_CUTOVER_MAIN_DRIFT_INSPECTION_FAILED");
    }
    unrelatedMainDriftTolerated = true;
  }

  return { head, origin_main: originMain, unrelated_main_drift_tolerated: unrelatedMainDriftTolerated };
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
  return replace(replace(source, primaryKey, newEndpointId), retiredKey, oldEndpointId);
}

async function atomicWriteLocalEnv(content) {
  const temp = `${ENV_PATH}.avantiqo-video-cutover-${process.pid}`;
  await writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
  await rename(temp, ENV_PATH);
}

async function loadState(managementKey, queueKey, immutableImage) {
  const [endpointsRaw, templates] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    endpointBoundTemplates(managementKey),
  ]);
  const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) throw new Error("AVANTIQO_VIDEO_CUTOVER_ENDPOINT_LIST_INVALID");

  const canonicalMatches = endpoints.filter((entry) => CANONICAL_NAMES.has(text(entry?.name)));
  if (canonicalMatches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_CUTOVER_CANONICAL_ENDPOINT_AMBIGUOUS:${canonicalMatches.length}`);
  }
  const canonical = canonicalMatches[0];
  const canonicalName = text(canonical.name);
  const digestSuffix = immutableImage.split("sha256:")[1].slice(0, 12);
  const candidateName = `${canonicalName}-immutable-candidate-${digestSuffix}`;
  const retiredName = `${canonicalName}-github-retired`;
  const targetTemplateName = `avantiqo-video-immutable-${digestSuffix}`;

  const candidateMatches = endpoints.filter((entry) => text(entry?.name) === candidateName);
  if (candidateMatches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_CUTOVER_CANDIDATE_ENDPOINT_REQUIRED:${candidateMatches.length}`);
  }
  const candidate = candidateMatches[0];
  const retiredCollisions = endpoints.filter(
    (entry) => text(entry?.name) === retiredName && text(entry?.id) !== text(canonical.id),
  );
  if (retiredCollisions.length) {
    throw new Error(`AVANTIQO_VIDEO_CUTOVER_RETIRED_NAME_COLLISION:${retiredCollisions.length}`);
  }

  const targetTemplateMatches = templates.filter((entry) => text(entry?.name) === targetTemplateName);
  if (targetTemplateMatches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_CUTOVER_TARGET_TEMPLATE_REQUIRED:${targetTemplateMatches.length}`);
  }
  const targetTemplate = targetTemplateMatches[0];
  const canonicalTemplate = resolveTemplate(canonical, templates);
  const candidateTemplate = resolveTemplate(candidate, templates);

  if (text(candidate.templateId || candidate.template?.id) !== text(targetTemplate.id)) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_CANDIDATE_TEMPLATE_ID_MISMATCH");
  }
  if (text(candidateTemplate.id) !== text(targetTemplate.id)) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_CANDIDATE_TEMPLATE_RESOLUTION_MISMATCH");
  }
  if (text(targetTemplate.imageName) !== immutableImage || text(candidateTemplate.imageName) !== immutableImage) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_IMMUTABLE_IMAGE_MISMATCH");
  }
  if (templateContractKey(targetTemplate) !== templateContractKey(canonicalTemplate)) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_TEMPLATE_CONTRACT_DRIFT");
  }
  assertEndpointParity(candidate, canonical);

  const [canonicalHealthRaw, candidateHealthRaw] = await Promise.all([
    queueHealth(text(canonical.id), queueKey),
    queueHealth(text(candidate.id), queueKey),
  ]);
  const canonicalQueue = queueSummary(canonicalHealthRaw);
  const candidateQueue = queueSummary(candidateHealthRaw);
  const canonicalManagement = managementSummary(canonical);
  const candidateManagement = managementSummary(candidate);
  assertNoLiveExecution(canonicalQueue, canonicalManagement, "AVANTIQO_VIDEO_CUTOVER_CANONICAL");
  assertNoLiveExecution(candidateQueue, candidateManagement, "AVANTIQO_VIDEO_CUTOVER_CANDIDATE");

  return {
    endpoints,
    canonical,
    candidate,
    canonicalTemplate,
    targetTemplate,
    canonicalName,
    candidateName,
    retiredName,
    targetTemplateName,
    canonicalQueue,
    candidateQueue,
    canonicalManagement,
    candidateManagement,
  };
}

const apply = process.argv.includes("--apply");
if (apply) approved("AVANTIQO_VIDEO_IMMUTABLE_CUTOVER_APPROVED");

const { evidence, sourceSha, immutableImage } = await readEvidence();
const sourceGuard = assertVideoSourceStable(sourceSha, { sourceSha, immutableImage });
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const state = await loadState(managementKey, queueKey, immutableImage);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  source_guard: sourceGuard,
  source_sha: sourceSha,
  immutable_image: immutableImage,
  canonical_endpoint: {
    id: text(state.canonical.id),
    name: state.canonicalName,
    template_id: text(state.canonical.templateId || state.canonical.template?.id),
    template_name: text(state.canonicalTemplate.name),
    workers_min: finite(state.canonical.workersMin),
    workers_max: finite(state.canonical.workersMax),
  },
  candidate_endpoint: {
    id: text(state.candidate.id),
    name: state.candidateName,
    template_id: text(state.candidate.templateId || state.candidate.template?.id),
    template_name: state.targetTemplateName,
    workers_min: finite(state.candidate.workersMin),
    workers_max: finite(state.candidate.workersMax),
  },
  queue: {
    canonical: state.canonicalQueue,
    candidate: state.candidateQueue,
  },
  management_workers: {
    canonical: state.canonicalManagement,
    candidate: state.candidateManagement,
  },
  mutation_required: true,
  safety: {
    candidate_precreated: true,
    target_template_precreated: true,
    old_endpoint_retained_for_rollback: true,
    old_endpoint_zero_scaled_at_cutover: true,
    old_template_untouched: true,
    generation_jobs_submitted: 0,
    video_generation_submitted: false,
    production_deploy_performed: false,
    endpoint_deleted: false,
    template_deleted: false,
    secrets_printed: false,
  },
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_IMMUTABLE_CUTOVER_APPLIED=false");
  process.exit(0);
}

const finalSourceGuard = assertVideoSourceStable(sourceSha, { sourceSha, immutableImage });
const fresh = await loadState(managementKey, queueKey, immutableImage);
if (
  text(fresh.canonical.id) !== text(state.canonical.id) ||
  text(fresh.candidate.id) !== text(state.candidate.id) ||
  text(fresh.targetTemplate.id) !== text(state.targetTemplate.id)
) {
  throw new Error("AVANTIQO_VIDEO_CUTOVER_RUNPOD_IDENTITY_MOVED_REPLAN_REQUIRED");
}

const localEnvNext = await prepareLocalEnvUpdate(text(fresh.candidate.id), text(fresh.canonical.id));
let oldRenamed = false;
let candidateRenamed = false;
try {
  await rest(`/endpoints/${encodeURIComponent(text(fresh.canonical.id))}`, managementKey, {
    method: "PATCH",
    body: { name: fresh.retiredName, workersMin: 0, workersMax: 0 },
  });
  oldRenamed = true;

  await rest(`/endpoints/${encodeURIComponent(text(fresh.candidate.id))}`, managementKey, {
    method: "PATCH",
    body: { name: fresh.canonicalName },
  });
  candidateRenamed = true;

  const [verifiedOld, verifiedNew, verifiedTemplate] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(text(fresh.canonical.id))}?includeTemplate=true&includeWorkers=true`, managementKey),
    rest(`/endpoints/${encodeURIComponent(text(fresh.candidate.id))}?includeTemplate=true&includeWorkers=true`, managementKey),
    rest(`/templates/${encodeURIComponent(text(fresh.targetTemplate.id))}`, managementKey),
  ]);

  if (text(verifiedOld.name) !== fresh.retiredName) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_RETIRED_NAME_VERIFY_FAILED");
  }
  if (finite(verifiedOld.workersMin, -1) !== 0 || finite(verifiedOld.workersMax, -1) !== 0) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_RETIRED_ZERO_SCALE_VERIFY_FAILED");
  }
  if (text(verifiedNew.name) !== fresh.canonicalName) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_NEW_CANONICAL_NAME_VERIFY_FAILED");
  }
  if (text(verifiedNew.templateId || verifiedNew.template?.id) !== text(fresh.targetTemplate.id)) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_NEW_TEMPLATE_ID_VERIFY_FAILED");
  }
  if (finite(verifiedNew.workersMin, -1) !== 0 || finite(verifiedNew.workersMax, -1) !== 0) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_NEW_ZERO_SCALE_VERIFY_FAILED");
  }
  if (text(verifiedTemplate.imageName) !== immutableImage) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_FINAL_IMMUTABLE_IMAGE_VERIFY_FAILED");
  }
  if (templateContractKey(verifiedTemplate) !== templateContractKey(fresh.canonicalTemplate)) {
    throw new Error("AVANTIQO_VIDEO_CUTOVER_FINAL_TEMPLATE_CONTRACT_VERIFY_FAILED");
  }

  await atomicWriteLocalEnv(localEnvNext);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    applied: true,
    source_guard: finalSourceGuard,
    old_endpoint: {
      id: text(verifiedOld.id),
      name: text(verifiedOld.name),
      workers_min: finite(verifiedOld.workersMin),
      workers_max: finite(verifiedOld.workersMax),
      retained_for_rollback: true,
      template_untouched: true,
    },
    new_endpoint: {
      id: text(verifiedNew.id),
      name: text(verifiedNew.name),
      template_id: text(verifiedNew.templateId || verifiedNew.template?.id),
      template_name: fresh.targetTemplateName,
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
    endpoint_deleted: false,
    template_deleted: false,
    secrets_in_output: false,
    next_action: "RUN_IMAGE_VIDEO_READINESS_AND_VIDEO_RUNTIME_PROBE",
  }, null, 2));
  console.log("AVANTIQO_VIDEO_IMMUTABLE_CUTOVER_APPLIED=true");
} catch (error) {
  const rollbackErrors = [];
  if (candidateRenamed) {
    try {
      await rest(`/endpoints/${encodeURIComponent(text(fresh.candidate.id))}`, managementKey, {
        method: "PATCH",
        body: { name: fresh.candidateName },
      });
    } catch (rollbackError) {
      rollbackErrors.push(`candidate:${text(rollbackError?.message || rollbackError)}`);
    }
  }
  if (oldRenamed) {
    try {
      await rest(`/endpoints/${encodeURIComponent(text(fresh.canonical.id))}`, managementKey, {
        method: "PATCH",
        body: { name: fresh.canonicalName, workersMin: 0, workersMax: 0 },
      });
    } catch (rollbackError) {
      rollbackErrors.push(`old:${text(rollbackError?.message || rollbackError)}`);
    }
  }
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: text(error?.message || error),
    rollback_attempted: oldRenamed || candidateRenamed,
    rollback_errors: rollbackErrors,
    provider_job_submitted: false,
    video_generation_submitted: false,
    production_web_deploy: false,
    secrets_in_output: false,
  }));
  throw error;
}
