import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_S3_DIRECT_CACHE_V18";
const APPROVAL_ENV = "AVANTIQO_VIDEO_WAN22_I2V_S3_DIRECT_CACHE_APPROVED";
const HELPER = "scripts/cache-avantiqo-video-wan22-i2v-s3-v18-helper.py";
const ENDPOINT_ID = "r0bzqq9zoi92h7";
const VOLUME_ID = "7pcdebhpga";
const REGION = "US-NC-2";
const S3_ENDPOINT = "https://s3api-us-nc-2.runpod.io/";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const CACHE_ROOT_KEY = "huggingface-cache/hub";
const COMPLETION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1";
const text = (value) => String(value ?? "").trim();
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

async function json(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_I2V_V18_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 800)}`);
  return body ?? {};
}

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
  const runpodEnvAccess = text(process.env.RUNPOD_S3_ACCESS_KEY_ID);
  const runpodEnvSecret = text(process.env.RUNPOD_S3_SECRET_ACCESS_KEY);
  if (runpodEnvAccess && runpodEnvSecret) return { accessKey: runpodEnvAccess, secretKey: runpodEnvSecret, source: "RUNPOD_S3_*" };

  const awsEnvAccess = text(process.env.AWS_ACCESS_KEY_ID);
  const awsEnvSecret = text(process.env.AWS_SECRET_ACCESS_KEY);
  if (awsEnvAccess && awsEnvSecret) return { accessKey: awsEnvAccess, secretKey: awsEnvSecret, source: "AWS_*" };

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
  if (runpodShaped.length > 1) throw new Error("AVANTIQO_VIDEO_I2V_V18_MULTIPLE_RUNPOD_S3_PROFILES_SET_AWS_PROFILE");
  return { accessKey: "", secretKey: "", source: null };
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const s3Credential = await resolveS3Credential();
const accessKey = s3Credential.accessKey;
const secretKey = s3Credential.secretKey;
const credentialSource = s3Credential.source;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  path: "RUNPOD_NETWORK_VOLUME_S3_DIRECT",
  volume_id: VOLUME_ID,
  region: REGION,
  target_model: I2V_MODEL,
  t2v_revalidation_required: true,
  cinema_endpoint_mutation: false,
  workers_max_change: false,
  runpod_job_submission: false,
  pod_creation: false,
  gpu_compute: false,
  resumable_by_remote_size_check: true,
  completion_marker_published_last: true,
  s3_credentials_present: Boolean(accessKey && secretKey),
  s3_credential_source: credentialSource,
  secrets_printed: false,
  production_web_deploy: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_I2V_S3_DIRECT_CACHE_V18_APPLIED=false");
  process.exit(0);
}

if (!accessKey || !secretKey) {
  throw new Error("AVANTIQO_VIDEO_I2V_V18_RUNPOD_S3_CREDENTIAL_REQUIRED:create one in RunPod Console S3 API Keys, then set RUNPOD_S3_ACCESS_KEY_ID/RUNPOD_S3_SECRET_ACCESS_KEY or configure an AWS profile");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
const endpoint = await json(`https://rest.runpod.io/v1/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_I2V_V18_CINEMA_NOT_RESTING_0_0:min=${finite(endpoint.workersMin)}:max=${finite(endpoint.workersMax)}`);
}
const health = await json(`https://api.runpod.ai/v2/${ENDPOINT_ID}/health`, queueKey);
const jobs = health.jobs || {};
const workers = health.workers || {};
const queue = finite(jobs.inQueue ?? jobs.in_queue, 0);
const progress = finite(jobs.inProgress ?? jobs.in_progress, 0);
const workerTotal = ["idle", "initializing", "ready", "running", "throttled", "unhealthy"].reduce((sum, key) => sum + finite(workers[key], 0), 0);
if (queue !== 0 || progress !== 0 || workerTotal !== 0) {
  throw new Error(`AVANTIQO_VIDEO_I2V_V18_CINEMA_NOT_QUIESCENT:queue=${queue}:progress=${progress}:workers=${workerTotal}`);
}
console.log("AVANTIQO_VIDEO_I2V_V18_CINEMA_CLEAN_0_0_CONFIRMED=true");

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-i2v-v18-"));
try {
  const venv = join(dir, "venv");
  let result = spawnSync("python3", ["-m", "venv", venv], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_V18_VENV_FAILED:exit=${result.status}`);
  const python = join(venv, "bin", "python");
  result = spawnSync(python, ["-m", "pip", "install", "--quiet", "boto3>=1.34,<2", "huggingface_hub>=0.34,<1", "requests>=2.31,<3"], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_V18_DEPENDENCY_INSTALL_FAILED:exit=${result.status}`);

  const env = {
    ...process.env,
    AVANTIQO_V18_BUCKET: VOLUME_ID,
    AVANTIQO_V18_S3_ENDPOINT: S3_ENDPOINT,
    AVANTIQO_V18_REGION: REGION,
    AVANTIQO_V18_MODEL: I2V_MODEL,
    AVANTIQO_V18_T2V_MODEL: T2V_MODEL,
    AVANTIQO_V18_CACHE_ROOT_KEY: CACHE_ROOT_KEY,
    AVANTIQO_V18_COMPLETION_CONTRACT: COMPLETION_CONTRACT,
    AVANTIQO_V18_ACCESS_KEY: accessKey,
    AVANTIQO_V18_SECRET_KEY: secretKey,
  };
  result = spawnSync(python, [HELPER], { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_V18_HELPER_FAILED:exit=${result.status}`);
  console.log("AVANTIQO_VIDEO_WAN22_I2V_S3_DIRECT_CACHE_V18_APPLIED=true");
} finally {
  await rm(dir, { recursive: true, force: true });
}
