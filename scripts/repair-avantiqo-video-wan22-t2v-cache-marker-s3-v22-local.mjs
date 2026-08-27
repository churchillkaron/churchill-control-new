import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_S3_MARKER_REPAIR_V22";
const APPROVAL_ENV = "AVANTIQO_VIDEO_WAN22_T2V_S3_MARKER_REPAIR_APPROVED";
const HELPER = "scripts/repair-avantiqo-video-wan22-t2v-cache-marker-s3-v22-helper.py";
const CINEMA_ENDPOINT_ID = "r0bzqq9zoi92h7";
const IMAGE_ENDPOINT_ID = "m9ieryijbnq77q";
const VOLUME_ID = "7pcdebhpga";
const REGION = "US-NC-2";
const S3_ENDPOINT = "https://s3api-us-nc-2.runpod.io/";
const MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const CACHE_ROOT_KEY = "huggingface-cache/hub";
const COMPLETION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1";

const text = (value) => String(value ?? "").trim();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

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
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_T2V_V22_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 800)}`);
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
  const requested = text(process.env.AWS_PROFILE || process.env.AWS_DEFAULT_PROFILE);
  const selected = requested ? candidates.find((entry) => entry.name === requested) : candidates.find((entry) => entry.name === "default");
  if (selected) return { accessKey: selected.accessKey, secretKey: selected.secretKey, source: `AWS_CREDENTIALS_FILE:${selected.name}` };

  const runpodShaped = candidates.filter((entry) => entry.accessKey.startsWith("user_") && entry.secretKey.startsWith("rps_"));
  if (runpodShaped.length === 1) return { accessKey: runpodShaped[0].accessKey, secretKey: runpodShaped[0].secretKey, source: `AWS_CREDENTIALS_FILE:${runpodShaped[0].name}` };
  if (runpodShaped.length > 1) throw new Error("AVANTIQO_VIDEO_T2V_V22_MULTIPLE_RUNPOD_S3_PROFILES_SET_AWS_PROFILE");
  return { accessKey: "", secretKey: "", source: null };
}

async function requireQuiescent(endpointId, key, label) {
  const health = await json(`https://api.runpod.ai/v2/${endpointId}/health`, key);
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  const inQueue = finite(jobs.inQueue ?? jobs.in_queue, 0);
  const inProgress = finite(jobs.inProgress ?? jobs.in_progress, 0);
  const workerTotal = ["idle", "initializing", "ready", "running", "throttled", "unhealthy"].reduce((sum, keyName) => sum + finite(workers[keyName], 0), 0);
  if (inQueue !== 0 || inProgress !== 0 || workerTotal !== 0) {
    throw new Error(`AVANTIQO_VIDEO_T2V_V22_${label}_NOT_QUIESCENT:queue=${inQueue}:progress=${inProgress}:workers=${workerTotal}`);
  }
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_T2V_V22_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const credential = await resolveS3Credential();
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "VERIFY",
  target_model: MODEL,
  path: "RUNPOD_NETWORK_VOLUME_S3_DIRECT_METADATA_REPAIR",
  full_hf_manifest_verification_required_before_write: true,
  model_file_mutation: false,
  refs_main_write_allowed_only_after_manifest_verify: apply,
  completion_marker_write_allowed_only_after_manifest_verify: apply,
  cinema_endpoint_mutation: false,
  image_endpoint_mutation: false,
  workers_max_change: false,
  runpod_job_submission: false,
  pod_creation: false,
  gpu_compute: false,
  s3_credentials_present: Boolean(credential.accessKey && credential.secretKey),
  s3_credential_source: credential.source,
  secrets_printed: false,
  production_web_deploy: false,
}, null, 2));

if (!credential.accessKey || !credential.secretKey) {
  throw new Error("AVANTIQO_VIDEO_T2V_V22_RUNPOD_S3_CREDENTIAL_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const cinemaQueueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
const imageQueueKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);

const cinema = await json(`https://rest.runpod.io/v1/endpoints/${CINEMA_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
if (finite(cinema.workersMin ?? cinema.workers_min, -1) !== 0 || finite(cinema.workersMax ?? cinema.workers_max, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_T2V_V22_CINEMA_NOT_RESTING_0_0:${finite(cinema.workersMin, -1)}/${finite(cinema.workersMax, -1)}`);
}
await requireQuiescent(CINEMA_ENDPOINT_ID, cinemaQueueKey, "CINEMA");
await requireQuiescent(IMAGE_ENDPOINT_ID, imageQueueKey, "IMAGE");
console.log("AVANTIQO_VIDEO_T2V_V22_SHARED_VOLUME_QUIESCENT_CONFIRMED=true");

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-t2v-v22-"));
try {
  const venv = join(dir, "venv");
  let result = spawnSync("python3", ["-m", "venv", venv], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_T2V_V22_VENV_FAILED:exit=${result.status}`);
  const python = join(venv, "bin", "python");
  result = spawnSync(python, ["-m", "pip", "install", "--quiet", "boto3>=1.34,<2", "huggingface_hub>=0.34,<1"], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_T2V_V22_DEPENDENCY_INSTALL_FAILED:exit=${result.status}`);

  const env = {
    ...process.env,
    AVANTIQO_V22_BUCKET: VOLUME_ID,
    AVANTIQO_V22_S3_ENDPOINT: S3_ENDPOINT,
    AVANTIQO_V22_REGION: REGION,
    AVANTIQO_V22_MODEL: MODEL,
    AVANTIQO_V22_CACHE_ROOT_KEY: CACHE_ROOT_KEY,
    AVANTIQO_V22_COMPLETION_CONTRACT: COMPLETION_CONTRACT,
    AVANTIQO_V22_ACCESS_KEY: credential.accessKey,
    AVANTIQO_V22_SECRET_KEY: credential.secretKey,
    AVANTIQO_V22_APPLY: apply ? "1" : "0",
  };
  result = spawnSync(python, [HELPER], { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_T2V_V22_HELPER_FAILED:exit=${result.status}`);
  console.log(`AVANTIQO_VIDEO_WAN22_T2V_S3_MARKER_REPAIR_V22_APPLIED=${apply ? "true" : "false"}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
