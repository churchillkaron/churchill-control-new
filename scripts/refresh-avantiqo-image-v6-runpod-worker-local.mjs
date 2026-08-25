import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_V6_RUNPOD_IMMUTABLE_BIND_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const IMAGE_SOURCE_PATH = "services/avantiqo-image-engine";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const IMAGE_EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4";
const EXPECTED_ENTRYPOINT = "handler_v6.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V6_PHYSICAL_VOLUME_USAGE_V1";
const EXPECTED_RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_V1";
const EXPECTED_PHYSICAL_USAGE_CONTRACT = "AVANTIQO_IMAGE_NETWORK_VOLUME_PHYSICAL_USAGE_V1";
const EXPECTED_ALLOCATION_BASIS = "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK";
const MIN_NETWORK_VOLUME_GB = 64;

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

function command(name, args, errorCode) {
  const result = spawnSync(name, args, {
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

function commandStatus(name, args) {
  return spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean))];
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
  return readJson(response, "RUNPOD_IMAGE_V6_BIND_REST");
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "RUNPOD_IMAGE_V6_BIND_QUEUE");
}

async function endpointBoundTemplates(managementKey) {
  const templates = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  if (!Array.isArray(templates)) throw new Error("AVANTIQO_IMAGE_V6_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_V6_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_V6_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  }
  return matches[0];
}

function templateBody(template, imageName) {
  const body = {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 30)),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName,
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: Math.max(0, finite(template.volumeInGb, 0)),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
  };
  const registryAuthId = text(template.containerRegistryAuthId);
  if (registryAuthId) body.containerRegistryAuthId = registryAuthId;
  if (!body.name) throw new Error("AVANTIQO_IMAGE_V6_TEMPLATE_NAME_REQUIRED");
  return body;
}

function comparableTemplate(body) {
  return {
    containerDiskInGb: finite(body.containerDiskInGb, 30),
    dockerEntrypoint: list(body.dockerEntrypoint),
    dockerStartCmd: list(body.dockerStartCmd),
    env: normalizeEnv(body.env),
    isPublic: body.isPublic === true,
    name: text(body.name),
    ports: list(body.ports),
    readme: text(body.readme),
    volumeInGb: finite(body.volumeInGb, 0),
    volumeMountPath: text(body.volumeMountPath),
    containerRegistryAuthId: text(body.containerRegistryAuthId),
  };
}

function healthCounters(value = {}) {
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

function assertFullyIdle(counters) {
  const jobs = counters.jobs.in_queue + counters.jobs.in_progress;
  const workers = Object.values(counters.workers).reduce((sum, value) => sum + finite(value, 0), 0);
  if (jobs !== 0 || workers !== 0) {
    throw new Error(`AVANTIQO_IMAGE_V6_BIND_REQUIRES_ZERO_ACTIVITY:jobs=${jobs}:workers=${workers}`);
  }
}

function safeEndpoint(endpoint = {}) {
  return {
    id_present: Boolean(text(endpoint.id)),
    name: text(endpoint.name) || null,
    template_id_present: Boolean(text(endpoint.templateId || endpoint.template?.id)),
    network_volume_count: endpointVolumeIds(endpoint).length,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
  };
}

function safeTemplate(template = {}) {
  return {
    id_present: Boolean(text(template.id)),
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    image_is_immutable: text(template.imageName).includes("@sha256:"),
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
    volume_mount_path: text(template.volumeMountPath) || null,
  };
}

function validateLocalMainAndEvidence() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_V6_BIND_GIT_FETCH_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_IMAGE_V6_BIND_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_IMAGE_V6_BIND_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_V6_BIND_GIT_HEAD_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_V6_BIND_GIT_ORIGIN_MAIN_FAILED");
  if (head !== originMain) {
    throw new Error(`AVANTIQO_IMAGE_V6_BIND_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${originMain}`);
  }

  const evidence = JSON.parse(readFileSync(IMAGE_EVIDENCE_PATH, "utf8"));
  if (evidence?.success !== true || evidence?.contract !== IMAGE_EVIDENCE_CONTRACT) {
    throw new Error("AVANTIQO_IMAGE_V6_BIND_VALID_V4_EVIDENCE_REQUIRED");
  }
  const sourceSha = text(evidence.source_sha);
  const triggerSha = text(evidence.trigger_sha);
  if (
    evidence.source_sha_matches_trigger !== true ||
    sourceSha !== triggerSha ||
    !/^[a-f0-9]{40}$/i.test(sourceSha)
  ) {
    throw new Error("AVANTIQO_IMAGE_V6_BIND_SOURCE_LOCK_INVALID");
  }
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
  ) {
    throw new Error("AVANTIQO_IMAGE_V6_BIND_SAFETY_EVIDENCE_INVALID");
  }
  const image = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_IMAGE_V6_BIND_IMMUTABLE_REFERENCE_INVALID");
  }

  const sourceExists = commandStatus("git", ["cat-file", "-e", `${sourceSha}^{commit}`]);
  if (sourceExists.status !== 0) {
    throw new Error(`AVANTIQO_IMAGE_V6_BIND_SOURCE_COMMIT_MISSING:${sourceSha}`);
  }
  const sourceDiff = commandStatus("git", ["diff", "--quiet", sourceSha, head, "--", IMAGE_SOURCE_PATH]);
  if (sourceDiff.status === 1) {
    throw new Error(`AVANTIQO_IMAGE_V6_BIND_SOURCE_MOVED:source=${sourceSha}:head=${head}`);
  }
  if (sourceDiff.status !== 0) throw new Error("AVANTIQO_IMAGE_V6_BIND_SOURCE_EQUIVALENCE_FAILED");

  command(
    "python3",
    [
      "-m",
      "py_compile",
      `${IMAGE_SOURCE_PATH}/handler.py`,
      `${IMAGE_SOURCE_PATH}/handler_v2.py`,
      `${IMAGE_SOURCE_PATH}/handler_v3.py`,
      `${IMAGE_SOURCE_PATH}/handler_v4.py`,
      `${IMAGE_SOURCE_PATH}/handler_v5.py`,
      `${IMAGE_SOURCE_PATH}/handler_v6.py`,
    ],
    "AVANTIQO_IMAGE_V6_BIND_PYTHON_SYNTAX_FAILED",
  );
  return { head, evidence, sourceSha, image };
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_IMAGE_V6_IMMUTABLE_BIND_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_IMAGE_V6_IMMUTABLE_BIND_APPROVED=YES_REQUIRED");
}

const local = validateLocalMainAndEvidence();
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY", managementKey);
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);

console.log(`AVANTIQO_IMAGE_V6_IMMUTABLE_BIND_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_V6_IMMUTABLE_BIND_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_V6_IMMUTABLE_BIND_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_V6_IMMUTABLE_BIND_MODEL_DOWNLOAD_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_V6_IMMUTABLE_BIND_PRODUCTION_DEPLOY=false");

const [endpoints, templates, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("AVANTIQO_IMAGE_V6_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("AVANTIQO_IMAGE_V6_VOLUME_LIST_INVALID");

let endpoint = null;
let resolution = null;
if (configuredEndpointId) {
  const matches = endpoints.filter((entry) => text(entry?.id) === configuredEndpointId);
  if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_IMAGE_V6_CONFIGURED_ENDPOINT_INVALID:${matches.length}`);
  }
  endpoint = matches[0];
  resolution = "CONFIGURED_ID";
} else {
  const matches = endpoints.filter((entry) => text(entry?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_V6_ENDPOINT_NAME_RESOLUTION_FAILED:${matches.length}`);
  }
  endpoint = matches[0];
  resolution = "EXACT_NAME";
}

const endpointId = text(endpoint.id);
const template = resolveTemplate(endpoint, templates);
const templateId = text(template.id);
const consumers = endpoints.filter(
  (entry) => text(entry?.templateId || entry?.template?.id) === templateId,
);
const exclusive = consumers.length === 1 && text(consumers[0]?.id) === endpointId;
if (!exclusive) {
  throw new Error(`AVANTIQO_IMAGE_V6_SHARED_TEMPLATE_BLOCKED:${consumers.length}`);
}

const volumeIds = endpointVolumeIds(endpoint);
if (!volumeIds.length) throw new Error("AVANTIQO_IMAGE_V6_NETWORK_VOLUME_REQUIRED");
const attachedVolumes = volumes.filter((volume) => volumeIds.includes(text(volume?.id)));
if (!attachedVolumes.some((volume) => finite(volume?.size, 0) >= MIN_NETWORK_VOLUME_GB)) {
  throw new Error(`AVANTIQO_IMAGE_V6_NETWORK_VOLUME_TOO_SMALL:min_gb=${MIN_NETWORK_VOLUME_GB}`);
}

const health = healthCounters(await queueHealth(endpointId, inferenceKey));
assertFullyIdle(health);
const currentImage = text(template.imageName);
const mutationRequired = currentImage !== local.image;
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_main: local.head,
  image_source_sha: local.sourceSha,
  evidence_contract: IMAGE_EVIDENCE_CONTRACT,
  entrypoint: EXPECTED_ENTRYPOINT,
  entrypoint_revision: EXPECTED_ENTRYPOINT_REVISION,
  runtime_revision: EXPECTED_RUNTIME_REVISION,
  physical_usage_contract: EXPECTED_PHYSICAL_USAGE_CONTRACT,
  endpoint_resolution: resolution,
  endpoint: safeEndpoint(endpoint),
  template: safeTemplate(template),
  template_exclusive_to_image_endpoint: true,
  attached_network_volume_count: attachedVolumes.length,
  health,
  immutable_image_reference: local.image,
  mutation_required: mutationRequired,
  mutation_performed: false,
  provider_job_submitted: false,
  image_generation_submitted: false,
  model_download_submitted: false,
  production_web_deploy: false,
  next_action: mutationRequired
    ? "APPLY_IMAGE_V6_IMMUTABLE_BIND_THEN_RUN_RUNTIME_PROBE"
    : "RUN_IMAGE_V6_RUNTIME_PROBE_AND_INSPECT_FOUNDATION_CAPACITY",
};

if (!apply || !mutationRequired) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_V6_BIND_GIT_FETCH_BEFORE_WRITE_FAILED");
const headBeforeWrite = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_V6_BIND_HEAD_BEFORE_WRITE_FAILED");
const originBeforeWrite = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_V6_BIND_ORIGIN_BEFORE_WRITE_FAILED");
if (headBeforeWrite !== local.head || originBeforeWrite !== local.head) {
  throw new Error(
    `AVANTIQO_IMAGE_V6_BIND_MAIN_MOVED_REPLAN_REQUIRED:planned=${local.head}:head=${headBeforeWrite}:origin=${originBeforeWrite}`,
  );
}

const [freshEndpoints, freshTemplates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
]);
if (!Array.isArray(freshEndpoints)) throw new Error("AVANTIQO_IMAGE_V6_FRESH_ENDPOINT_LIST_INVALID");
const freshMatches = freshEndpoints.filter((entry) => text(entry?.id) === endpointId);
if (freshMatches.length !== 1 || text(freshMatches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_V6_ENDPOINT_MOVED_REPLAN_REQUIRED");
}
const freshEndpoint = freshMatches[0];
const freshTemplate = resolveTemplate(freshEndpoint, freshTemplates);
if (text(freshTemplate.id) !== templateId) {
  throw new Error("AVANTIQO_IMAGE_V6_TEMPLATE_MOVED_REPLAN_REQUIRED");
}
const freshConsumers = freshEndpoints.filter(
  (entry) => text(entry?.templateId || entry?.template?.id) === templateId,
);
if (freshConsumers.length !== 1 || text(freshConsumers[0]?.id) !== endpointId) {
  throw new Error(`AVANTIQO_IMAGE_V6_TEMPLATE_SHARING_CHANGED:${freshConsumers.length}`);
}
const freshHealth = healthCounters(await queueHealth(endpointId, inferenceKey));
assertFullyIdle(freshHealth);

const beforeBody = templateBody(freshTemplate, text(freshTemplate.imageName));
const desiredBody = templateBody(freshTemplate, local.image);
assert.deepStrictEqual(
  comparableTemplate(beforeBody),
  comparableTemplate(desiredBody),
  "AVANTIQO_IMAGE_V6_BIND_ATTEMPTED_NON_IMAGE_TEMPLATE_CHANGE",
);

await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
  method: "POST",
  body: desiredBody,
});

const [verifiedEndpoint, verifiedTemplates] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  endpointBoundTemplates(managementKey),
]);
const verifiedTemplate = resolveTemplate(verifiedEndpoint, verifiedTemplates);
if (text(verifiedTemplate.imageName) !== local.image) {
  throw new Error("AVANTIQO_IMAGE_V6_BIND_VERIFY_IMAGE_FAILED");
}
assert.deepStrictEqual(
  comparableTemplate(templateBody(verifiedTemplate, text(verifiedTemplate.imageName))),
  comparableTemplate(desiredBody),
  "AVANTIQO_IMAGE_V6_BIND_VERIFY_TEMPLATE_FIELDS_FAILED",
);

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint: safeEndpoint(verifiedEndpoint),
  template: safeTemplate(verifiedTemplate),
  mutation_performed: true,
  image_bind_verified: true,
  provider_job_submitted: false,
  image_generation_submitted: false,
  model_download_submitted: false,
  production_web_deploy: false,
  next_action: "RUN_IMAGE_V6_RUNTIME_PROBE_AND_INSPECT_FOUNDATION_CAPACITY",
}, null, 2));
