import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTROL = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_V1";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-stt-worker-image.json";
const ACTIVE = new Set(["IDLE", "READY", "RUNNING", "THROTTLED", "INITIALIZING", "UNHEALTHY"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}
function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: process.env,
  });
  return result.status === 0 ? text(result.stdout) : "";
}

async function parseJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.status = response.status;
    throw error;
  }
  return body || {};
}
async function rest(pathname, key, options = {}) {
  return parseJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_GHCR_AUTH_REPAIR_REST");
}
async function queueHealth(endpointId, key) {
  return parseJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_GHCR_AUTH_REPAIR_QUEUE");
}
async function controlWorkers(endpointId, key) {
  const body = await parseJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_GHCR_AUTH_REPAIR_CONTROL");
  return list(body?.workers).map((worker) => ({
    status: text(worker?.status).toUpperCase() || null,
    is_stale: worker?.isStale === true,
  }));
}

function gitShow(path) {
  const result = spawnSync("git", ["show", `origin/main:${path}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(`AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_GIT_SHOW_FAILED:${path}`);
  return result.stdout;
}
function certifiedImage() {
  const fetchResult = spawnSync("git", ["fetch", "origin", "main", "--quiet"], { encoding: "utf8" });
  if (fetchResult.status !== 0) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_GIT_FETCH_FAILED");
  const evidence = JSON.parse(gitShow(IMAGE_EVIDENCE_PATH));
  const image = text(evidence?.immutable_image_reference);
  if (
    evidence?.success !== true ||
    evidence?.contract !== "AVANTIQO_VOICE_STT_WORKER_IMAGE_RESULT_V1" ||
    evidence?.source_sha_matches_trigger !== true ||
    evidence?.vocabulary_context_prompt_ids_baked !== true ||
    !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)
  ) {
    throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_CERTIFIED_IMAGE_REQUIRED");
  }
  return image;
}

function parseBearerChallenge(value) {
  const raw = text(value);
  if (!/^Bearer\s+/i.test(raw)) return null;
  const params = {};
  const expression = /([a-zA-Z]+)="([^"]*)"/g;
  let match;
  while ((match = expression.exec(raw))) params[match[1].toLowerCase()] = match[2];
  return params.realm ? params : null;
}
function ghcrImageParts(image) {
  const match = image.match(/^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/i);
  if (!match) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_IMAGE_REFERENCE_INVALID");
  return { repository: match[1], reference: match[2] };
}
async function canPullGhcrImage(image, credential) {
  const { repository, reference } = ghcrImageParts(image);
  const manifestUrl = `https://ghcr.io/v2/${repository}/manifests/${reference}`;
  const accept = [
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
  ].join(", ");
  const first = await fetch(manifestUrl, { method: "GET", headers: { Accept: accept }, signal: AbortSignal.timeout(30_000) });
  if (first.ok) return { success: true, public: true };
  if (first.status !== 401) return { success: false, public: false };
  const challenge = parseBearerChallenge(first.headers.get("www-authenticate"));
  if (!challenge) return { success: false, public: false };
  const tokenUrl = new URL(challenge.realm);
  tokenUrl.searchParams.set("service", challenge.service || "ghcr.io");
  tokenUrl.searchParams.set("scope", challenge.scope || `repository:${repository}:pull`);
  const tokenResponse = await fetch(tokenUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!tokenResponse.ok) return { success: false, public: false };
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  const registryToken = text(tokenBody.token || tokenBody.access_token);
  if (!registryToken) return { success: false, public: false };
  const manifest = await fetch(manifestUrl, {
    headers: { Accept: accept, Authorization: `Bearer ${registryToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  return { success: manifest.ok, public: false };
}
function localGhcrCredential() {
  const envUsername = text(process.env.AVANTIQO_VOICE_GHCR_USERNAME || process.env.GHCR_USERNAME || process.env.GITHUB_USERNAME);
  const envToken = text(process.env.AVANTIQO_VOICE_GHCR_READ_TOKEN || process.env.GHCR_TOKEN || process.env.CR_PAT);
  if (envUsername && envToken) return { username: envUsername, password: envToken, source: "ENV" };
  if (envUsername || envToken) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_USERNAME_AND_TOKEN_REQUIRED_TOGETHER");
  const username = commandOutput("gh", ["api", "user", "--jq", ".login"]);
  const password = commandOutput("gh", ["auth", "token", "--hostname", "github.com"]);
  if (username && password) return { username, password, source: "GH_CLI" };
  throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_LOCAL_GITHUB_CREDENTIAL_REQUIRED");
}

async function endpointSnapshot(managementKey, queueKey) {
  const raw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
  const endpoints = normalizeList(raw, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_ENDPOINT_LIST_INVALID");
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  const endpoint = matches[0];
  const endpointId = text(endpoint?.id);
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!endpointId || !templateId) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_ENDPOINT_BINDING_REQUIRED");
  const templatesRaw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey);
  const templates = normalizeList(templatesRaw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_TEMPLATE_LIST_INVALID");
  const template = templates.find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_TEMPLATE_NOT_FOUND");
  const health = await queueHealth(endpointId, queueKey);
  const jobs = object(health?.jobs);
  const workers = await controlWorkers(endpointId, managementKey);
  return {
    endpoint,
    endpointId,
    template,
    templateId,
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers,
  };
}
function assertClean(snapshot) {
  const active = snapshot.workers.filter((worker) => ACTIVE.has(worker.status) && worker.is_stale !== true);
  const reasons = [];
  if (Number(snapshot.endpoint?.workersMin) !== 0) reasons.push("WORKERS_MIN_NOT_ZERO");
  if (Number(snapshot.endpoint?.workersMax) !== 0) reasons.push("WORKERS_MAX_NOT_ZERO");
  if (snapshot.jobs.in_queue !== 0) reasons.push("JOBS_IN_QUEUE");
  if (snapshot.jobs.in_progress !== 0) reasons.push("JOBS_IN_PROGRESS");
  if (active.length) reasons.push("ACTIVE_WORKER_PRESENT");
  if (reasons.length) throw new Error(`AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_ENDPOINT_NOT_CLEAN:${reasons.join(",")}`);
}
function templateUpdateBody(template, imageName, registryAuthId) {
  return {
    containerDiskInGb: Math.max(1, Number(template?.containerDiskInGb) || 30),
    containerRegistryAuthId: registryAuthId,
    dockerEntrypoint: [],
    dockerStartCmd: [],
    env: Object.fromEntries(Object.entries(object(template?.env)).map(([key, value]) => [key, String(value ?? "")])),
    imageName,
    isPublic: template?.isPublic === true,
    name: text(template?.name),
    ports: list(template?.ports),
    readme: text(template?.readme),
    volumeInGb: Math.max(0, Number(template?.volumeInGb) || 0),
    volumeMountPath: text(template?.volumeMountPath) || "/workspace",
  };
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_APPROVED=YES_REQUIRED");
}
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
const image = certifiedImage();
const credential = localGhcrCredential();
const pull = await canPullGhcrImage(image, credential);
if (!pull.success) {
  throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_READ_PACKAGES_REQUIRED:run_gh_auth_refresh_-h_github.com_-s_read:packages_or_set_CR_PAT");
}
const initial = await endpointSnapshot(managementKey, queueKey);
assertClean(initial);
if (text(initial.template?.imageName) !== image) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_CERTIFIED_IMAGE_NOT_BOUND");

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_name: ENDPOINT_NAME,
  endpoint_id_present: true,
  template_id_present: true,
  certified_image: image,
  local_credential_source: credential.source,
  local_credential_can_pull_certified_image: true,
  ghcr_image_public: pull.public,
  current_registry_auth_id_present: Boolean(text(initial.template?.containerRegistryAuthId)),
  fresh_registry_auth_created: false,
  template_auth_rebound: false,
  workers_min: 0,
  workers_max: 0,
  jobs: initial.jobs,
  tts_touched: false,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const digestShort = image.match(/sha256:([a-f0-9]{12})/i)?.[1] || Date.now().toString(36);
const authName = `avantiqo-ghcr-readonly-stt-${digestShort}-${Date.now().toString(36)}`;
const created = await rest("/containerregistryauth", managementKey, {
  method: "POST",
  body: { name: authName, username: credential.username, password: credential.password },
});
const freshAuthId = text(created?.id);
if (!freshAuthId) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_CREATED_AUTH_ID_REQUIRED");
plan.fresh_registry_auth_created = true;

const beforeWrite = await endpointSnapshot(managementKey, queueKey);
assertClean(beforeWrite);
if (beforeWrite.templateId !== initial.templateId) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_TEMPLATE_CHANGED_BEFORE_WRITE");
if (text(beforeWrite.template?.imageName) !== image) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_IMAGE_CHANGED_BEFORE_WRITE");

await rest(`/templates/${encodeURIComponent(beforeWrite.templateId)}/update`, managementKey, {
  method: "POST",
  body: templateUpdateBody(beforeWrite.template, image, freshAuthId),
});
plan.template_auth_rebound = true;

const verified = await endpointSnapshot(managementKey, queueKey);
assertClean(verified);
if (verified.templateId !== initial.templateId) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_TEMPLATE_CHANGED_DURING_APPLY");
if (text(verified.template?.imageName) !== image) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_IMAGE_CHANGED_DURING_APPLY");
if (text(verified.template?.containerRegistryAuthId) !== freshAuthId) throw new Error("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_AUTH_BIND_VERIFY_FAILED");

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  fresh_registry_auth_created: true,
  template_auth_rebound: true,
  fresh_registry_auth_id_present: true,
  verified_workers_min: Number(verified.endpoint?.workersMin),
  verified_workers_max: Number(verified.endpoint?.workersMax),
  verified_jobs: verified.jobs,
  tts_touched: false,
  generation_submitted: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR=PASS");
