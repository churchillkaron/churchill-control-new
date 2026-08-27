import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_EU_RO1_CACHE_BIND_V34";
const APPROVAL_ENV = "AVANTIQO_VIDEO_EU_RO1_CACHE_BIND_APPROVED";
const HELPER = "scripts/verify-avantiqo-video-eu-ro1-cache-s3-v34-helper.py";
const CINEMA_ENDPOINT_ID = "r0bzqq9zoi92h7";
const IMAGE_ENDPOINT_ID = "m9ieryijbnq77q";
const SOURCE_VOLUME_ID = "7pcdebhpga";
const DESTINATION_VOLUME_ID = "t4erb6kxi1";
const DESTINATION_VOLUME_NAME = "avantiqo-video-cache-eu-ro-1";
const DESTINATION_REGION = "EU-RO-1";
const DESTINATION_S3_ENDPOINT = "https://s3api-eu-ro-1.runpod.io/";
const TARGET_VOLUMES = [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID].sort();

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const list = (value) => Array.isArray(value) ? value : [];
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function sameSet(a, b) {
  const left = unique(a);
  const right = unique(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function stableEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin ?? endpoint.workers_min),
    workers_max: finite(endpoint.workersMax ?? endpoint.workers_max),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    data_center_ids: unique(list(endpoint.dataCenterIds)),
    network_volume_ids: endpointVolumeIds(endpoint),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    idle_timeout: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
  };
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_V34_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  return body ?? {};
}

async function rest(pathname, key, options = {}) {
  return requestJson(`${REST_BASE}${pathname}`, key, options);
}

async function queueHealth(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key);
}

function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  const normalizedWorkers = {
    idle: finite(workers.idle, 0), initializing: finite(workers.initializing, 0), ready: finite(workers.ready, 0),
    running: finite(workers.running, 0), throttled: finite(workers.throttled, 0), unhealthy: finite(workers.unhealthy, 0),
  };
  return {
    jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: normalizedWorkers,
    worker_total: Object.values(normalizedWorkers).reduce((sum, value) => sum + value, 0),
  };
}

function assertQuiescent(health, label) {
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || health.worker_total !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V34_${label}_NOT_QUIESCENT:${JSON.stringify(health)}`);
  }
}

function parseAwsCredentials(raw) {
  const profiles = new Map();
  let current = null;
  for (const sourceLine of String(raw || "").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      current = section[1].trim();
      if (!profiles.has(current)) profiles.set(current, {});
      continue;
    }
    if (!current) continue;
    const equals = line.indexOf("=");
    if (equals < 1) continue;
    profiles.get(current)[line.slice(0, equals).trim().toLowerCase()] = line.slice(equals + 1).trim();
  }
  return profiles;
}

async function resolveS3Credential() {
  const runpodAccess = text(process.env.RUNPOD_S3_ACCESS_KEY_ID);
  const runpodSecret = text(process.env.RUNPOD_S3_SECRET_ACCESS_KEY);
  if (runpodAccess && runpodSecret) return { accessKey: runpodAccess, secretKey: runpodSecret, source: "RUNPOD_S3_*" };
  const awsAccess = text(process.env.AWS_ACCESS_KEY_ID);
  const awsSecret = text(process.env.AWS_SECRET_ACCESS_KEY);
  if (awsAccess && awsSecret) return { accessKey: awsAccess, secretKey: awsSecret, source: "AWS_*" };
  const raw = await readFile(join(homedir(), ".aws", "credentials"), "utf8").catch(() => "");
  const profiles = parseAwsCredentials(raw);
  const candidates = [];
  for (const [name, profile] of profiles.entries()) {
    const accessKey = text(profile.aws_access_key_id);
    const secretKey = text(profile.aws_secret_access_key);
    if (accessKey && secretKey) candidates.push({ name, accessKey, secretKey });
  }
  const requestedProfile = text(process.env.AWS_PROFILE || process.env.AWS_DEFAULT_PROFILE);
  const selected = requestedProfile ? candidates.find((entry) => entry.name === requestedProfile) : candidates.find((entry) => entry.name === "default");
  if (selected) return { accessKey: selected.accessKey, secretKey: selected.secretKey, source: `AWS_CREDENTIALS_FILE:${selected.name}` };
  const runpodShaped = candidates.filter((entry) => entry.accessKey.startsWith("user_") && entry.secretKey.startsWith("rps_"));
  if (runpodShaped.length === 1) return { accessKey: runpodShaped[0].accessKey, secretKey: runpodShaped[0].secretKey, source: `AWS_CREDENTIALS_FILE:${runpodShaped[0].name}` };
  if (runpodShaped.length > 1) throw new Error("AVANTIQO_VIDEO_V34_MULTIPLE_RUNPOD_S3_PROFILES_SET_AWS_PROFILE");
  return { accessKey: "", secretKey: "", source: null };
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_V34_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const videoQueueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
const imageQueueKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
const s3Credential = await resolveS3Credential();
if (!s3Credential.accessKey || !s3Credential.secretKey) throw new Error("AVANTIQO_VIDEO_V34_RUNPOD_S3_CREDENTIAL_REQUIRED");

const [cinema, image, sourceVolume, destinationVolume] = await Promise.all([
  rest(`/endpoints/${CINEMA_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  rest(`/endpoints/${IMAGE_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  rest(`/networkvolumes/${SOURCE_VOLUME_ID}`, managementKey),
  rest(`/networkvolumes/${DESTINATION_VOLUME_ID}`, managementKey),
]);

const cinemaBefore = stableEndpoint(cinema);
const imageBefore = stableEndpoint(image);
if (cinemaBefore.workers_min !== 0 || cinemaBefore.workers_max !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V34_CINEMA_NOT_RESTING_0_0:${cinemaBefore.workers_min}/${cinemaBefore.workers_max}`);
}
if (!cinemaBefore.network_volume_ids.includes(SOURCE_VOLUME_ID)) throw new Error("AVANTIQO_VIDEO_V34_SOURCE_VOLUME_NOT_BOUND");
if (text(sourceVolume.id) !== SOURCE_VOLUME_ID || text(sourceVolume.dataCenterId) !== "US-NC-2") throw new Error("AVANTIQO_VIDEO_V34_SOURCE_VOLUME_INVALID");
if (text(destinationVolume.id) !== DESTINATION_VOLUME_ID || text(destinationVolume.name) !== DESTINATION_VOLUME_NAME || text(destinationVolume.dataCenterId) !== DESTINATION_REGION || finite(destinationVolume.size ?? destinationVolume.sizeGb, 0) < 400) {
  throw new Error("AVANTIQO_VIDEO_V34_DESTINATION_VOLUME_INVALID");
}
const cinemaHealth = healthSummary(await queueHealth(CINEMA_ENDPOINT_ID, videoQueueKey));
const imageHealth = healthSummary(await queueHealth(IMAGE_ENDPOINT_ID, imageQueueKey));
assertQuiescent(cinemaHealth, "CINEMA");
assertQuiescent(imageHealth, "IMAGE");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  cinema_before: cinemaBefore,
  image_before: imageBefore,
  target_network_volume_ids: TARGET_VOLUMES,
  destination_volume: { id: DESTINATION_VOLUME_ID, name: DESTINATION_VOLUME_NAME, data_center_id: DESTINATION_REGION, size_gb: finite(destinationVolume.size ?? destinationVolume.sizeGb, null) },
  exact_destination_cache_verification_required_before_patch: true,
  cinema_workers_remain_0_0: true,
  template_mutation: false,
  gpu_pool_mutation: false,
  image_mutation: false,
  serverless_job_submission: false,
  gpu_compute_used: false,
  source_volume_mutation: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_EU_RO1_CACHE_BIND_V34_APPLIED=false");
  process.exit(0);
}

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-v34-"));
try {
  const venv = join(dir, "venv");
  let child = spawnSync("python3", ["-m", "venv", venv], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_V34_VENV_FAILED:exit=${child.status}`);
  const python = join(venv, "bin", "python");
  child = spawnSync(python, ["-m", "pip", "install", "--quiet", "boto3>=1.34,<2", "huggingface_hub>=0.34,<1"], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_V34_DEPENDENCY_INSTALL_FAILED:exit=${child.status}`);
  const env = {
    ...process.env,
    AVANTIQO_V34_BUCKET: DESTINATION_VOLUME_ID,
    AVANTIQO_V34_S3_ENDPOINT: DESTINATION_S3_ENDPOINT,
    AVANTIQO_V34_REGION: DESTINATION_REGION,
    AVANTIQO_V34_ACCESS_KEY: s3Credential.accessKey,
    AVANTIQO_V34_SECRET_KEY: s3Credential.secretKey,
  };
  child = spawnSync(python, [HELPER], { cwd: process.cwd(), env, stdio: "inherit" });
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_V34_CACHE_VERIFY_FAILED:exit=${child.status}`);

  const freshCinema = await rest(`/endpoints/${CINEMA_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
  const freshImage = await rest(`/endpoints/${IMAGE_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
  const freshCinemaStable = stableEndpoint(freshCinema);
  if (freshCinemaStable.workers_min !== 0 || freshCinemaStable.workers_max !== 0) throw new Error("AVANTIQO_VIDEO_V34_FRESH_CINEMA_NOT_0_0");
  assertQuiescent(healthSummary(await queueHealth(CINEMA_ENDPOINT_ID, videoQueueKey)), "FRESH_CINEMA");
  assertQuiescent(healthSummary(await queueHealth(IMAGE_ENDPOINT_ID, imageQueueKey)), "FRESH_IMAGE");
  if (JSON.stringify(stableEndpoint(freshImage)) !== JSON.stringify(imageBefore)) throw new Error("AVANTIQO_VIDEO_V34_IMAGE_CHANGED_BEFORE_PATCH");
  if (freshCinemaStable.template_id !== cinemaBefore.template_id || !sameSet(freshCinemaStable.gpu_type_ids, cinemaBefore.gpu_type_ids)) throw new Error("AVANTIQO_VIDEO_V34_CINEMA_NONVOLUME_BASELINE_CHANGED");

  let mutationPerformed = false;
  if (!sameSet(freshCinemaStable.network_volume_ids, TARGET_VOLUMES)) {
    await rest(`/endpoints/${CINEMA_ENDPOINT_ID}`, managementKey, {
      method: "PATCH",
      body: { networkVolumeIds: TARGET_VOLUMES },
    });
    mutationPerformed = true;
  }

  const verifiedCinema = stableEndpoint(await rest(`/endpoints/${CINEMA_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey));
  const verifiedImage = stableEndpoint(await rest(`/endpoints/${IMAGE_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey));
  if (!sameSet(verifiedCinema.network_volume_ids, TARGET_VOLUMES)) throw new Error(`AVANTIQO_VIDEO_V34_BIND_VERIFY_FAILED:${verifiedCinema.network_volume_ids.join("|")}`);
  if (verifiedCinema.workers_min !== 0 || verifiedCinema.workers_max !== 0) throw new Error("AVANTIQO_VIDEO_V34_CINEMA_SCALING_CHANGED");
  if (verifiedCinema.template_id !== cinemaBefore.template_id || !sameSet(verifiedCinema.gpu_type_ids, cinemaBefore.gpu_type_ids)) throw new Error("AVANTIQO_VIDEO_V34_CINEMA_CONTRACT_CHANGED");
  if (JSON.stringify(verifiedImage) !== JSON.stringify(imageBefore)) throw new Error("AVANTIQO_VIDEO_V34_IMAGE_CHANGED");
  assertQuiescent(healthSummary(await queueHealth(CINEMA_ENDPOINT_ID, videoQueueKey)), "FINAL_CINEMA");

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mutation_performed: mutationPerformed,
    cinema_after: verifiedCinema,
    image_preserved: true,
    source_volume_preserved: true,
    destination_volume_attached: true,
    cinema_workers_0_0: true,
    serverless_job_submitted: false,
    gpu_compute_used: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_EU_RO1_CACHE_BIND_V34=PASS");
  console.log("AVANTIQO_VIDEO_EU_RO1_CACHE_BIND_V34_APPLIED=true");
} finally {
  await rm(dir, { recursive: true, force: true });
}
