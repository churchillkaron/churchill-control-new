import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CONTRACT = "AVANTIQO_VIDEO_WAN22_CROSS_REGION_S3_REPLICATION_V31";
const APPROVAL_ENV = "AVANTIQO_VIDEO_WAN22_CROSS_REGION_REPLICATION_APPROVED";
const HELPER = "scripts/replicate-avantiqo-video-wan22-cache-s3-v31-helper.py";
const CINEMA_ENDPOINT_ID = "r0bzqq9zoi92h7";
const IMAGE_ENDPOINT_ID = "m9ieryijbnq77q";
const SOURCE_VOLUME_ID = "7pcdebhpga";
const SOURCE_REGION = "US-NC-2";
const SOURCE_S3_ENDPOINT = "https://s3api-us-nc-2.runpod.io/";
const DESTINATION_VOLUME_ID = "t4erb6kxi1";
const DESTINATION_REGION = "EU-RO-1";
const DESTINATION_S3_ENDPOINT = "https://s3api-eu-ro-1.runpod.io/";
const DESTINATION_VOLUME_NAME = "avantiqo-video-cache-eu-ro-1";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const list = (value) => Array.isArray(value) ? value : [];
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

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
async function json(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_V31_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 900)}`);
  return body ?? {};
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
  const selected = requestedProfile
    ? candidates.find((entry) => entry.name === requestedProfile)
    : candidates.find((entry) => entry.name === "default");
  if (selected) return { accessKey: selected.accessKey, secretKey: selected.secretKey, source: `AWS_CREDENTIALS_FILE:${selected.name}` };
  const runpodShaped = candidates.filter((entry) => entry.accessKey.startsWith("user_") && entry.secretKey.startsWith("rps_"));
  if (runpodShaped.length === 1) return { accessKey: runpodShaped[0].accessKey, secretKey: runpodShaped[0].secretKey, source: `AWS_CREDENTIALS_FILE:${runpodShaped[0].name}` };
  if (runpodShaped.length > 1) throw new Error("AVANTIQO_VIDEO_V31_MULTIPLE_RUNPOD_S3_PROFILES_SET_AWS_PROFILE");
  return { accessKey: "", secretKey: "", source: null };
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
async function requireQuiescent(endpointId, key, label) {
  const health = await json(`https://api.runpod.ai/v2/${endpointId}/health`, key);
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  const queue = finite(jobs.inQueue ?? jobs.in_queue, 0);
  const progress = finite(jobs.inProgress ?? jobs.in_progress, 0);
  const workerTotal = ["idle", "initializing", "ready", "running", "throttled", "unhealthy"]
    .reduce((sum, workerKey) => sum + finite(workers[workerKey], 0), 0);
  if (queue !== 0 || progress !== 0 || workerTotal !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V31_${label}_NOT_QUIESCENT:queue=${queue}:progress=${progress}:workers=${workerTotal}`);
  }
  return { queue, progress, workerTotal };
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_V31_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
const imageQueueKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
const s3Credential = await resolveS3Credential();

const [cinema, destinationVolume, sourceVolume] = await Promise.all([
  json(`https://rest.runpod.io/v1/endpoints/${CINEMA_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  json(`https://rest.runpod.io/v1/networkvolumes/${DESTINATION_VOLUME_ID}`, managementKey),
  json(`https://rest.runpod.io/v1/networkvolumes/${SOURCE_VOLUME_ID}`, managementKey),
]);

const workersMin = finite(cinema.workersMin ?? cinema.workers_min, -1);
const workersMax = finite(cinema.workersMax ?? cinema.workers_max, -1);
if (workersMin !== 0 || workersMax !== 0) throw new Error(`AVANTIQO_VIDEO_V31_CINEMA_NOT_RESTING_0_0:min=${workersMin}:max=${workersMax}`);
const boundVolumeIds = endpointVolumeIds(cinema);
if (!boundVolumeIds.includes(SOURCE_VOLUME_ID)) throw new Error("AVANTIQO_VIDEO_V31_SOURCE_VOLUME_NOT_BOUND_TO_CINEMA");
if (boundVolumeIds.includes(DESTINATION_VOLUME_ID)) throw new Error("AVANTIQO_VIDEO_V31_DESTINATION_VOLUME_MUST_NOT_BE_BOUND_YET");
if (text(sourceVolume.id) !== SOURCE_VOLUME_ID || text(sourceVolume.dataCenterId) !== SOURCE_REGION) throw new Error("AVANTIQO_VIDEO_V31_SOURCE_VOLUME_ID_OR_REGION_INVALID");
if (text(destinationVolume.id) !== DESTINATION_VOLUME_ID || text(destinationVolume.dataCenterId) !== DESTINATION_REGION || text(destinationVolume.name) !== DESTINATION_VOLUME_NAME || finite(destinationVolume.size ?? destinationVolume.sizeGb, 0) < 400) {
  throw new Error(`AVANTIQO_VIDEO_V31_DESTINATION_VOLUME_INVALID:${JSON.stringify({id:destinationVolume.id,name:destinationVolume.name,size:destinationVolume.size,dataCenterId:destinationVolume.dataCenterId})}`);
}

await requireQuiescent(CINEMA_ENDPOINT_ID, queueKey, "CINEMA");
await requireQuiescent(IMAGE_ENDPOINT_ID, imageQueueKey, "IMAGE");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  source_volume: { id: SOURCE_VOLUME_ID, region: SOURCE_REGION, s3_endpoint: SOURCE_S3_ENDPOINT, preserved_untouched: true },
  destination_volume: { id: DESTINATION_VOLUME_ID, name: DESTINATION_VOLUME_NAME, region: DESTINATION_REGION, size_gb: finite(destinationVolume.size ?? destinationVolume.sizeGb, null), s3_endpoint: DESTINATION_S3_ENDPOINT },
  cinema_resting_0_0: true,
  cinema_quiescent: true,
  image_quiescent: true,
  destination_not_bound_to_cinema: true,
  t2v_revision: "5be7df9619b54f4e2667b2755bc6a756675b5cd7",
  i2v_revision: "596658fd9ca6b7b71d5057529bbf319ecbc61d74",
  bounded_memory_streaming: true,
  local_full_snapshot_staging: false,
  completion_markers_published_last: true,
  s3_credentials_present: Boolean(s3Credential.accessKey && s3Credential.secretKey),
  s3_credential_source: s3Credential.source,
  source_mutation_performed: false,
  endpoint_rebind_performed: false,
  runpod_job_submitted: false,
  gpu_compute_used: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_CROSS_REGION_S3_REPLICATION_V31_APPLIED=false");
  process.exit(0);
}
if (!s3Credential.accessKey || !s3Credential.secretKey) throw new Error("AVANTIQO_VIDEO_V31_RUNPOD_S3_CREDENTIAL_REQUIRED");

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-v31-"));
try {
  const venv = join(dir, "venv");
  let result = spawnSync("python3", ["-m", "venv", venv], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_V31_VENV_FAILED:exit=${result.status}`);
  const python = join(venv, "bin", "python");
  result = spawnSync(python, ["-m", "pip", "install", "--quiet", "boto3>=1.34,<2"], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_V31_DEPENDENCY_INSTALL_FAILED:exit=${result.status}`);

  const env = {
    ...process.env,
    AVANTIQO_V31_SOURCE_BUCKET: SOURCE_VOLUME_ID,
    AVANTIQO_V31_DESTINATION_BUCKET: DESTINATION_VOLUME_ID,
    AVANTIQO_V31_SOURCE_S3_ENDPOINT: SOURCE_S3_ENDPOINT,
    AVANTIQO_V31_DESTINATION_S3_ENDPOINT: DESTINATION_S3_ENDPOINT,
    AVANTIQO_V31_SOURCE_REGION: SOURCE_REGION,
    AVANTIQO_V31_DESTINATION_REGION: DESTINATION_REGION,
    AVANTIQO_V31_ACCESS_KEY: s3Credential.accessKey,
    AVANTIQO_V31_SECRET_KEY: s3Credential.secretKey,
  };
  result = spawnSync(python, [HELPER], { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_V31_HELPER_FAILED:exit=${result.status}`);

  const finalCinema = await json(`https://rest.runpod.io/v1/endpoints/${CINEMA_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
  if (finite(finalCinema.workersMin ?? finalCinema.workers_min, -1) !== 0 || finite(finalCinema.workersMax ?? finalCinema.workers_max, -1) !== 0) throw new Error("AVANTIQO_VIDEO_V31_FINAL_CINEMA_NOT_RESTING_0_0");
  const finalBound = endpointVolumeIds(finalCinema);
  if (!finalBound.includes(SOURCE_VOLUME_ID) || finalBound.includes(DESTINATION_VOLUME_ID)) throw new Error("AVANTIQO_VIDEO_V31_FINAL_CINEMA_BINDING_CHANGED_UNEXPECTEDLY");
  console.log("AVANTIQO_VIDEO_WAN22_CROSS_REGION_S3_REPLICATION_V31=PASS");
  console.log("AVANTIQO_VIDEO_WAN22_CROSS_REGION_S3_REPLICATION_V31_APPLIED=true");
} finally {
  await rm(dir, { recursive: true, force: true });
}
