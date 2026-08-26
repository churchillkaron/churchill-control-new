import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
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

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const accessKey = text(process.env.RUNPOD_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID);
const secretKey = text(process.env.RUNPOD_S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY);
const credentialSource = process.env.RUNPOD_S3_ACCESS_KEY_ID && process.env.RUNPOD_S3_SECRET_ACCESS_KEY
  ? "RUNPOD_S3_*"
  : process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? "AWS_*"
    : null;

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
  throw new Error("AVANTIQO_VIDEO_I2V_V18_RUNPOD_S3_CREDENTIAL_REQUIRED:expected RUNPOD_S3_ACCESS_KEY_ID/RUNPOD_S3_SECRET_ACCESS_KEY or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY");
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
const workerTotal = ["idle", "initializing", "ready", "running", "throttled", "unhealthy"]
  .reduce((sum, key) => sum + finite(workers[key], 0), 0);
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
  result = spawnSync(python, ["-m", "pip", "install", "--quiet", "boto3>=1.34,<2", "huggingface_hub>=0.34,<1", "requests>=2.31,<3"], {
    cwd: process.cwd(), env: process.env, stdio: "inherit",
  });
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
