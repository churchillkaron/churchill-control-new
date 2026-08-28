import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_CODE_RUNPOD_IMMUTABLE_IMAGE_BIND_V2";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const CODE_SOURCE_PATH = "services/avantiqo-code-engine";
const IMAGE_SOURCE_SHA = "c60ff6458e999ec63c0afbf1589b36d4f14d84c7";
const IMAGE_DIGEST = "sha256:398275050d3f160af627353a02de7e017a1089783c1a8a314b8c51b5bdabdddb";
const IMAGE_REPOSITORY = "ghcr.io/churchillkaron/avantiqo-code-worker";
const IMMUTABLE_IMAGE = `${IMAGE_REPOSITORY}@${IMAGE_DIGEST}`;
const APPROVAL_ENV = "AVANTIQO_CODE_IMMUTABLE_IMAGE_BIND_V2_APPROVED";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const upper = (value) => text(value).toUpperCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1000) || `exit=${result.status}`}`);
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

function sourceGate() {
  command("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const originMain = command("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_MAIN_FAILED`);
  const ancestor = commandStatus("git", ["merge-base", "--is-ancestor", IMAGE_SOURCE_SHA, originMain]);
  if (ancestor.status !== 0) throw new Error(`${CONTRACT}_IMAGE_SOURCE_NOT_ANCESTOR_OF_ORIGIN_MAIN`);
  const changes = command(
    "git",
    ["diff", "--name-only", `${IMAGE_SOURCE_SHA}..${originMain}`, "--", CODE_SOURCE_PATH],
    `${CONTRACT}_SOURCE_DIFF_FAILED`,
  ).split("\n").map((value) => value.trim()).filter(Boolean);
  if (changes.length) {
    throw new Error(`${CONTRACT}_WORKER_SOURCE_MOVED:${changes.join(",")}`);
  }
  return originMain;
}

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    const error = new Error(`${prefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body || {};
}

async function retryRead(fn, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try { return await fn(); } catch (error) {
      lastError = error;
      const status = finite(error?.httpStatus, 0);
      const transient = [429, 500, 502, 503, 504].includes(status) || /fetch failed|ECONNRESET|EPIPE|UND_ERR/i.test(text(error?.message));
      if (!transient || attempt === 5) break;
      console.log(`${CONTRACT}_${label}_RETRY=${JSON.stringify({ attempt, reason: text(error?.message).slice(0, 300) })}`);
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
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
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, `${CONTRACT}_REST`);
}

async function graphql(query, credential) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, `${CONTRACT}_GRAPHQL`);
  if (body.errors?.length) throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${body.errors.map((entry) => text(entry?.message)).join(" | ").slice(0, 1200)}`);
  return body;
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_QUEUE`);
}

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const rows = normalizeRows(value[key], keys, depth + 1);
    if (rows.length || Array.isArray(value[key])) return rows;
  }
  return [];
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => key));
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}

async function verifyGhcr() {
  const tokenUrl = new URL("https://ghcr.io/token");
  tokenUrl.searchParams.set("service", "ghcr.io");
  tokenUrl.searchParams.set("scope", "repository:churchillkaron/avantiqo-code-worker:pull");
  const tokenBody = await retryRead(async () => {
    const response = await fetch(tokenUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    return readJson(response, `${CONTRACT}_GHCR_TOKEN`);
  }, "GHCR_TOKEN");
  const token = text(tokenBody.token || tokenBody.access_token);
  if (!token) throw new Error(`${CONTRACT}_GHCR_TOKEN_MISSING`);
  const response = await fetch(`https://ghcr.io/v2/churchillkaron/avantiqo-code-worker/manifests/${IMAGE_DIGEST}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${CONTRACT}_GHCR_MANIFEST_HTTP_${response.status}`);
  const digest = text(response.headers.get("docker-content-digest")).toLowerCase();
  if (digest && digest !== IMAGE_DIGEST.toLowerCase()) throw new Error(`${CONTRACT}_GHCR_DIGEST_MISMATCH:${digest}`);
  await response.arrayBuffer();
  return true;
}

const ENDPOINT_QUERY = `
query AvantiqoCodeImmutableBindV2Read {
  myself {
    endpoints {
      id
      name
      version
      templateId
      workersMin
      workersMax
      repo { repoName repoId branch dockerFilePath buildContext }
      builds { id state commitHash branch }
    }
  }
}`;

async function graphqlEndpoint(managementKey) {
  const body = await retryRead(() => graphql(ENDPOINT_QUERY, managementKey), "GRAPHQL_READ");
  const rows = list(body?.data?.myself?.endpoints);
  const matches = rows.filter((row) => text(row?.id) === ENDPOINT_ID && text(row?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_GRAPHQL_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function activeBuilds(endpoint = {}) {
  const active = new Set(["PENDING", "QUEUED", "STARTING", "BUILDING", "UPLOADING", "TESTING"]);
  return list(endpoint.builds).filter((build) => active.has(upper(build?.state)));
}

function healthSummary(body = {}) {
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

function activeManagementWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint.workers).filter((worker) => {
    const status = upper(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus);
    const desired = upper(worker?.desiredStatus ?? worker?.desired_status);
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
}

function assertParked(endpoint, health, label) {
  if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) throw new Error(`${label}_RESTING_0_0_REQUIRED`);
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) throw new Error(`${label}_QUEUE_NOT_EMPTY`);
  if (activeManagementWorkers(endpoint).length) throw new Error(`${label}_ACTIVE_MANAGEMENT_WORKER`);
  if (Object.values(health.workers).some((value) => Number(value) !== 0)) throw new Error(`${label}_ACTIVE_HEALTH_WORKER`);
}

function templatePreservationKey(template = {}) {
  return JSON.stringify({
    id: text(template.id),
    name: text(template.name),
    containerDiskInGb: finite(template.containerDiskInGb, 0),
    containerRegistryAuthId: text(template.containerRegistryAuthId),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
    isPublic: template.isPublic === true,
  });
}

function templateUpdateBody(template) {
  const body = {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 5)),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName: IMMUTABLE_IMAGE,
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: Math.max(0, finite(template.volumeInGb, 0)),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
  };
  const auth = text(template.containerRegistryAuthId);
  if (auth) body.containerRegistryAuthId = auth;
  if (!body.name) throw new Error(`${CONTRACT}_TEMPLATE_NAME_REQUIRED`);
  return body;
}

async function endpointState(managementKey, queueKey) {
  const [endpoint, healthRaw, gqlEndpoint, templatesRaw, endpointsRaw] = await Promise.all([
    retryRead(() => rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey), "ENDPOINT_READ"),
    retryRead(() => queueHealth(ENDPOINT_ID, queueKey), "HEALTH_READ"),
    graphqlEndpoint(managementKey),
    retryRead(() => rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey), "TEMPLATE_LIST"),
    retryRead(() => rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey), "ENDPOINT_LIST"),
  ]);
  if (text(endpoint.id) !== ENDPOINT_ID || text(endpoint.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_REST_ENDPOINT_IDENTITY_MISMATCH`);
  const health = healthSummary(healthRaw);
  const templates = normalizeRows(templatesRaw, ["templates"]);
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  const templateMatches = templates.filter((row) => text(row?.id) === templateId);
  if (templateMatches.length !== 1) throw new Error(`${CONTRACT}_TEMPLATE_RESOLUTION_FAILED:${templateId}:${templateMatches.length}`);
  const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const consumers = endpoints.filter((row) => text(row?.templateId || row?.template?.id) === templateId);
  return { endpoint, health, gqlEndpoint, template: templateMatches[0], consumers };
}

const apply = process.argv.includes("--apply");
const approved = upper(process.env[APPROVAL_ENV]) === "YES";
if (apply && !approved) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
if (!queueKey) throw new Error("RUNPOD_CODE_RUNTIME_KEY_REQUIRED");

const originMain = sourceGate();
await verifyGhcr();
const initial = await endpointState(managementKey, queueKey);
assertParked(initial.endpoint, initial.health, `${CONTRACT}_PREFLIGHT`);
if (initial.gqlEndpoint.repo !== null && Object.keys(initial.gqlEndpoint.repo || {}).length) throw new Error(`${CONTRACT}_GITHUB_SOURCE_MUST_BE_DETACHED`);
if (activeBuilds(initial.gqlEndpoint).length) throw new Error(`${CONTRACT}_ACTIVE_GITHUB_BUILD_BLOCKED`);
const templateExclusive = initial.consumers.length === 1 && text(initial.consumers[0]?.id) === ENDPOINT_ID;
if (!templateExclusive) throw new Error(`${CONTRACT}_SHARED_TEMPLATE_BLOCKED:${initial.consumers.length}`);
const mutationRequired = text(initial.template.imageName) !== IMMUTABLE_IMAGE;

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  validated_origin_main: originMain,
  local_head_ignored_by_design: true,
  worker_source_equivalent_to_image: true,
  endpoint: {
    id: ENDPOINT_ID,
    name: ENDPOINT_NAME,
    version: finite(initial.gqlEndpoint.version),
    workers_min: finite(initial.endpoint.workersMin),
    workers_max: finite(initial.endpoint.workersMax),
    repo: initial.gqlEndpoint.repo,
    active_builds: activeBuilds(initial.gqlEndpoint).length,
  },
  template: {
    id: text(initial.template.id),
    image_name: text(initial.template.imageName),
    exclusive_to_code: true,
  },
  immutable_image: { reference: IMMUTABLE_IMAGE, digest: IMAGE_DIGEST, source_sha: IMAGE_SOURCE_SHA },
  health: initial.health,
  mutation_required: mutationRequired,
  mutation_performed: false,
  scaling_mutation_performed: false,
  generation_submitted: false,
  inference_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  next_action: mutationRequired ? "APPLY_IMMUTABLE_IMAGE_BIND_V2" : "RUN_METADATA_RUNTIME_PROBE_SAFE_LEASE",
};

console.log(`AVANTIQO_CODE_IMMUTABLE_IMAGE_BIND_V2_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_CODE_IMMUTABLE_IMAGE_BIND_V2_SCALING_MUTATION=false");
console.log("AVANTIQO_CODE_IMMUTABLE_IMAGE_BIND_V2_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_CODE_IMMUTABLE_IMAGE_BIND_V2_INFERENCE_PERFORMED=false");

if (!apply || !mutationRequired) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit();
}

const beforePreservation = templatePreservationKey(initial.template);
sourceGate();
let updateError = null;
try {
  await rest(`/templates/${encodeURIComponent(text(initial.template.id))}/update`, managementKey, {
    method: "POST",
    body: templateUpdateBody(initial.template),
  });
} catch (error) {
  updateError = error;
}

const after = await endpointState(managementKey, queueKey);
assertParked(after.endpoint, after.health, `${CONTRACT}_POST_BIND`);
if (after.gqlEndpoint.repo !== null && Object.keys(after.gqlEndpoint.repo || {}).length) throw new Error(`${CONTRACT}_REPO_REAPPEARED`);
if (activeBuilds(after.gqlEndpoint).length) throw new Error(`${CONTRACT}_ACTIVE_BUILD_AFTER_BIND`);
if (text(after.template.imageName) !== IMMUTABLE_IMAGE) {
  if (updateError) throw updateError;
  throw new Error(`${CONTRACT}_IMAGE_VERIFY_FAILED:${text(after.template.imageName)}`);
}
if (templatePreservationKey(after.template) !== beforePreservation) throw new Error(`${CONTRACT}_TEMPLATE_CONTENT_CHANGED`);
const finalOriginMain = sourceGate();

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  validated_origin_main: finalOriginMain,
  mutation_performed: true,
  mutation_response_uncertain_but_readback_succeeded: Boolean(updateError),
  template: { ...plan.template, image_name: text(after.template.imageName) },
  endpoint: {
    ...plan.endpoint,
    version: finite(after.gqlEndpoint.version),
    workers_min: finite(after.endpoint.workersMin),
    workers_max: finite(after.endpoint.workersMax),
    repo: after.gqlEndpoint.repo,
    active_builds: activeBuilds(after.gqlEndpoint).length,
  },
  health: after.health,
  next_action: "RUN_METADATA_RUNTIME_PROBE_SAFE_LEASE",
}, null, 2));
