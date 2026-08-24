import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const IMAGE_SOURCE_PATH = "services/avantiqo-image-engine";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const IMAGE_EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V1";
const RUNTIME_PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1";
const MIN_NETWORK_VOLUME_GB = 64;
const CONTRACT = "AVANTIQO_IMAGE_RUNPOD_IMMUTABLE_BIND_V1";

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

function command(commandName, args, errorCode) {
  const result = spawnSync(commandName, args, {
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

function commandStatus(commandName, args) {
  return spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HEALTH_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function endpointBoundTemplates(managementKey) {
  const templates = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
  return templates;
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean))];
}

function resolveTemplate(endpoint, templates) {
  const inline = object(endpoint?.template);
  const templateId = text(endpoint?.templateId || inline.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length) return inline;
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_ENDPOINT_BOUND_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`);
  }
  return matches[0];
}

function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function templateBody(template, imageName) {
  const body = {
    containerDiskInGb: finite(template.containerDiskInGb, 30),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName,
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
  };
  if (!body.name) throw new Error("AVANTIQO_IMAGE_TEMPLATE_NAME_REQUIRED");
  if (text(template.containerRegistryAuthId)) {
    body.containerRegistryAuthId = text(template.containerRegistryAuthId);
  }
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

function healthCounters(body = {}) {
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

function assertFullyIdle(counters) {
  const liveJobs = counters.jobs.in_queue + counters.jobs.in_progress;
  const liveWorkers = Object.values(counters.workers).reduce((sum, value) => sum + finite(value, 0), 0);
  if (liveJobs !== 0 || liveWorkers !== 0) {
    throw new Error(
      `AVANTIQO_IMAGE_IMMUTABLE_BIND_REQUIRES_ZERO_ACTIVITY:jobs=${liveJobs}:workers=${liveWorkers}`,
    );
  }
}

function validateLocalMainAndEvidence() {
  command("git", ["fetch", "origin", "main"], "GIT_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "GIT_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_IMAGE_IMMUTABLE_BIND_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "GIT_HEAD_READ_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "GIT_ORIGIN_MAIN_READ_FAILED");
  if (head !== originMain) {
    throw new Error(`AVANTIQO_IMAGE_IMMUTABLE_BIND_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${originMain}:run_git_pull_ff_only_first`);
  }

  const sourceStatus = command(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", IMAGE_SOURCE_PATH],
    "GIT_IMAGE_SOURCE_STATUS_FAILED",
  );
  if (sourceStatus) throw new Error("AVANTIQO_IMAGE_IMMUTABLE_BIND_IMAGE_SOURCE_HAS_LOCAL_CHANGES");

  let evidence = null;
  try {
    evidence = JSON.parse(readFileSync(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch {
    throw new Error("AVANTIQO_IMAGE_IMMUTABLE_WORKER_IMAGE_EVIDENCE_REQUIRED");
  }
  if (evidence?.success !== true || evidence?.contract !== IMAGE_EVIDENCE_CONTRACT) {
    throw new Error("AVANTIQO_IMAGE_IMMUTABLE_WORKER_IMAGE_EVIDENCE_INVALID");
  }
  const sourceSha = text(evidence.source_sha);
  const triggerSha = text(evidence.trigger_sha);
  if (
    evidence.source_sha_matches_trigger !== true ||
    sourceSha !== triggerSha ||
    !/^[a-f0-9]{40}$/i.test(sourceSha)
  ) {
    throw new Error("AVANTIQO_IMAGE_IMMUTABLE_WORKER_IMAGE_SOURCE_LOCK_INVALID");
  }
  if (
    text(evidence.entrypoint) !== "handler_v3.py" ||
    text(evidence.runtime_probe_contract) !== RUNTIME_PROBE_CONTRACT ||
    evidence.provider_job_submitted !== false ||
    evidence.image_generation_submitted !== false ||
    evidence.production_web_deploy !== false
  ) {
    throw new Error("AVANTIQO_IMAGE_IMMUTABLE_WORKER_IMAGE_SAFETY_EVIDENCE_INVALID");
  }
  const image = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_IMAGE_IMMUTABLE_WORKER_IMAGE_REFERENCE_INVALID");
  }

  const sourceExists = commandStatus("git", ["cat-file", "-e", `${sourceSha}^{commit}`]);
  if (sourceExists.status !== 0) {
    throw new Error(`AVANTIQO_IMAGE_IMMUTABLE_WORKER_IMAGE_SOURCE_COMMIT_MISSING:${sourceSha}`);
  }
  const sourceDiff = commandStatus(
    "git",
    ["diff", "--quiet", sourceSha, head, "--", IMAGE_SOURCE_PATH],
  );
  if (sourceDiff.status === 1) {
    throw new Error(`AVANTIQO_IMAGE_SOURCE_CHANGED_AFTER_IMMUTABLE_BUILD:source=${sourceSha}:head=${head}`);
  }
  if (sourceDiff.status !== 0) {
    throw new Error("AVANTIQO_IMAGE_SOURCE_EQUIVALENCE_CHECK_FAILED");
  }

  command(
    "python3",
    [
      "-m",
      "py_compile",
      `${IMAGE_SOURCE_PATH}/handler.py`,
      `${IMAGE_SOURCE_PATH}/handler_v2.py`,
      `${IMAGE_SOURCE_PATH}/handler_v3.py`,
    ],
    "AVANTIQO_IMAGE_REFRESH_PYTHON_SYNTAX_FAILED",
  );
  console.log("AVANTIQO_IMAGE_REFRESH_V3_SYNTAX=PASS");
  return { head, evidence, image, sourceSha };
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

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);

console.log(`AVANTIQO_IMAGE_RUNPOD_REFRESH_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_STRATEGY=IMMUTABLE_DIGEST_DIRECT_BIND");
console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_ANCESTOR_SCAN=false");
console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_SECRETS_PRINTED=false");

const local = validateLocalMainAndEvidence();
const [endpoints, templates, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

let endpoint = null;
let resolution = null;
if (configuredEndpointId) {
  const matches = endpoints.filter((candidate) => text(candidate?.id) === configuredEndpointId);
  if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_IMAGE_REFRESH_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
  }
  endpoint = matches[0];
  resolution = "ENV_VERIFIED";
} else {
  const matches = endpoints.filter((candidate) => text(candidate?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_REFRESH_ENDPOINT_AUTO_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  endpoint = matches[0];
  resolution = "EXACT_NAME";
}

const endpointId = text(endpoint.id);
const template = resolveTemplate(endpoint, templates);
const templateId = text(template.id || endpoint.templateId);
const templateConsumers = endpoints.filter(
  (candidate) => text(candidate?.templateId || candidate?.template?.id) === templateId,
);
if (templateConsumers.length !== 1 || text(templateConsumers[0]?.id) !== endpointId) {
  throw new Error(`AVANTIQO_IMAGE_IMMUTABLE_BIND_SHARED_TEMPLATE_BLOCKED:consumers=${templateConsumers.length}`);
}

const volumeIds = endpointVolumeIds(endpoint);
if (!volumeIds.length) throw new Error("AVANTIQO_IMAGE_REFRESH_NETWORK_VOLUME_REQUIRED");
const attachedVolumes = volumes.filter((volume) => volumeIds.includes(text(volume?.id)));
if (!attachedVolumes.some((volume) => finite(volume?.size, 0) >= MIN_NETWORK_VOLUME_GB)) {
  throw new Error(`AVANTIQO_IMAGE_REFRESH_NETWORK_VOLUME_TOO_SMALL:min_gb=${MIN_NETWORK_VOLUME_GB}`);
}

const counters = healthCounters(await queueHealth(endpointId, inferenceKey));
assertFullyIdle(counters);

console.log(`AVANTIQO_IMAGE_REFRESH_ENDPOINT_RESOLUTION=${resolution}`);
console.log(`AVANTIQO_IMAGE_REFRESH_ENDPOINT_NAME=${IMAGE_ENDPOINT_NAME}`);
console.log("AVANTIQO_IMAGE_REFRESH_ENDPOINT_SECRET_PRINTED=false");

const currentImage = text(template.imageName);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  strategy: "IMMUTABLE_DIGEST_DIRECT_BIND",
  ancestor_scan_performed: false,
  local_main: local.head,
  immutable_image_source_sha: local.sourceSha,
  image_source_tree_matches_current_main: true,
  endpoint: safeEndpoint(endpoint),
  template: safeTemplate(template),
  template_exclusive_to_image_endpoint: true,
  attached_network_volume_count: attachedVolumes.length,
  health: counters,
  current_image_matches_immutable_evidence: currentImage === local.image,
  mutation_required: currentImage !== local.image,
  mutation_performed: false,
  generation_submitted: false,
  worker_wakeup_requested: false,
  production_deploy_performed: false,
  next_action: currentImage === local.image
    ? "CACHE_QWEN_IMAGE_2512"
    : apply
      ? "BIND_IMMUTABLE_IMAGE"
      : "RUN_WITH_APPLY",
};

if (currentImage === local.image) {
  console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_ALREADY_CURRENT=true");
  console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH=COMPLETE");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (!apply) {
  console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

// Re-fetch local main and exact RunPod state immediately before mutation.
command("git", ["fetch", "origin", "main"], "GIT_FETCH_MAIN_BEFORE_BIND_FAILED");
const headBeforeWrite = command("git", ["rev-parse", "HEAD"], "GIT_HEAD_BEFORE_BIND_FAILED");
const originBeforeWrite = command("git", ["rev-parse", "origin/main"], "GIT_ORIGIN_MAIN_BEFORE_BIND_FAILED");
if (headBeforeWrite !== local.head || originBeforeWrite !== local.head) {
  throw new Error(`AVANTIQO_IMAGE_REFRESH_MAIN_MOVED_BEFORE_BIND:planned=${local.head}:head=${headBeforeWrite}:origin_main=${originBeforeWrite}`);
}

const [freshEndpoints, freshTemplates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
]);
if (!Array.isArray(freshEndpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID_BEFORE_BIND");
const freshMatches = freshEndpoints.filter((candidate) => text(candidate?.id) === endpointId);
if (freshMatches.length !== 1 || text(freshMatches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_ENDPOINT_CHANGED_REPLAN_REQUIRED");
}
const freshEndpoint = freshMatches[0];
const freshTemplate = resolveTemplate(freshEndpoint, freshTemplates);
if (text(freshTemplate.id || freshEndpoint.templateId) !== templateId) {
  throw new Error("AVANTIQO_IMAGE_TEMPLATE_CHANGED_REPLAN_REQUIRED");
}
if (endpointVolumeIds(freshEndpoint).join("|") !== volumeIds.join("|")) {
  throw new Error("AVANTIQO_IMAGE_VOLUME_BINDING_CHANGED_REPLAN_REQUIRED");
}
const freshConsumers = freshEndpoints.filter(
  (candidate) => text(candidate?.templateId || candidate?.template?.id) === templateId,
);
if (freshConsumers.length !== 1 || text(freshConsumers[0]?.id) !== endpointId) {
  throw new Error(`AVANTIQO_IMAGE_IMMUTABLE_BIND_SHARED_TEMPLATE_BLOCKED_BEFORE_WRITE:consumers=${freshConsumers.length}`);
}
const freshCounters = healthCounters(await queueHealth(endpointId, inferenceKey));
assertFullyIdle(freshCounters);

const beforeBody = templateBody(freshTemplate, text(freshTemplate.imageName));
const desiredBody = templateBody(freshTemplate, local.image);
await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
  method: "POST",
  body: desiredBody,
});

const [verifiedEndpoint, verifiedTemplates, afterEndpoints] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  endpointBoundTemplates(managementKey),
  rest("/endpoints?includeTemplate=true&includeWorkers=false", managementKey),
]);
if (!Array.isArray(afterEndpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID_AFTER_BIND");
const verifiedTemplate = resolveTemplate(verifiedEndpoint, verifiedTemplates);
if (text(verifiedTemplate.imageName) !== local.image) {
  throw new Error("AVANTIQO_IMAGE_IMMUTABLE_BIND_VERIFY_IMAGE_FAILED");
}
assert.deepStrictEqual(
  comparableTemplate(templateBody(verifiedTemplate, text(verifiedTemplate.imageName))),
  comparableTemplate(desiredBody),
  "AVANTIQO_IMAGE_IMMUTABLE_BIND_VERIFY_TEMPLATE_FIELDS_FAILED",
);
assert.deepStrictEqual(
  comparableTemplate(beforeBody),
  comparableTemplate(desiredBody),
  "AVANTIQO_IMAGE_IMMUTABLE_BIND_ATTEMPTED_NON_IMAGE_TEMPLATE_CHANGE",
);

const otherEndpointTemplateChanges = afterEndpoints
  .filter((candidate) => text(candidate?.id) !== endpointId)
  .filter((candidate) => {
    const before = endpoints.find((entry) => text(entry?.id) === text(candidate?.id));
    return text(before?.templateId || before?.template?.id) !== text(candidate?.templateId || candidate?.template?.id);
  });
if (otherEndpointTemplateChanges.length) {
  throw new Error(`AVANTIQO_IMAGE_IMMUTABLE_BIND_OTHER_ENDPOINT_TEMPLATE_CHANGED:count=${otherEndpointTemplateChanges.length}`);
}

console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH=COMPLETE");
console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  health_before_write: freshCounters,
  template: safeTemplate(verifiedTemplate),
  current_image_matches_immutable_evidence: true,
  mutation_required: true,
  mutation_performed: true,
  worker_wakeup_requested: false,
  generation_submitted: false,
  ancestor_scan_performed: false,
  next_action: "CACHE_QWEN_IMAGE_2512",
}, null, 2));
