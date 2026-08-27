import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const CONTRACT = "AVANTIQO_VIDEO_FIRST_REAL_T2V_V47";
const APPROVAL_ENV = "AVANTIQO_VIDEO_FIRST_REAL_T2V_V47_APPROVED";
const SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "cinema";
const ENDPOINT_ID = "r0bzqq9zoi92h7";
const ENDPOINT_NAME = "avantiqo-cinema-v1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const STORAGE_BUCKET = "creative-assets";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1";
const CAPABILITY = "ai.video.generate";
const EXPECTED_T2V = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const EXPECTED_ENTRYPOINT = "handler_v3.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_VIDEO_HANDLER_V3_WAN22_A14B_DEFAULT_ROUTING_V1";
const EXPECTED_RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_ROUTING_CACHE_V1";
const TARGET_POOL = [
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA A100 80GB PCIe",
];
const REQUIRED_CUDA = ["12.8", "12.9", "13.0"];
const REQUIRED_VOLUMES = ["7pcdebhpga", "t4erb6kxi1"];
const DURATION_SECONDS = 2;
const FPS = 8;
const ASPECT_RATIO = "16:9";
const RESOLUTION = "720p";
const SEED = 470047;
const QUEUE_LIMIT_MS = 90_000;
const EXECUTION_LIMIT_MS = 12 * 60_000;
const POLL_MS = 3_000;
const LEASE_TTL_MS = 15 * 60_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const sorted = (values) => [...unique(values)].sort();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function sameSet(a, b) {
  const left = sorted(a);
  const right = sorted(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function sameOrder(a, b) {
  const left = list(a).map(text).filter(Boolean);
  const right = list(b).map(text).filter(Boolean);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|signature)=[^&\s]+)/gi, "[SIGNED_QUERY_REDACTED]");
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  return body ?? {};
}
async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V47_REST");
}
async function queue(pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VIDEO_V47_QUEUE");
}
async function queueCredential(managementKey) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try { await queue("/health", key); return { source, key }; } catch {}
  }
  throw new Error("AVANTIQO_VIDEO_V47_QUEUE_CREDENTIAL_NOT_FOUND");
}
function endpointVolumes(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  const wc = {
    idle: finite(workers.idle, 0),
    initializing: finite(workers.initializing, 0),
    ready: finite(workers.ready, 0),
    running: finite(workers.running, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: wc,
    worker_total: Object.values(wc).reduce((sum, value) => sum + value, 0),
  };
}
async function cancel(jobId, key, reason) {
  if (!jobId) return { attempted: false, reason };
  try {
    const result = await queue(`/cancel/${encodeURIComponent(jobId)}`, key, { method: "POST" });
    return { attempted: true, success: true, reason, result_status: text(result?.status) || null };
  } catch (error) {
    return { attempted: true, success: false, reason, error: redact(error?.message || error).slice(0, 500) };
  }
}

async function runLeased() {
  if (
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES" ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== ENDPOINT_ID
  ) throw new Error("AVANTIQO_VIDEO_V47_VALID_CINEMA_SAFE_LEASE_REQUIRED");

  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
  const credential = await queueCredential(managementKey);
  const signedUploadUrl = required("AVANTIQO_VIDEO_V47_SIGNED_UPLOAD_URL");
  const storageReference = required("AVANTIQO_VIDEO_V47_STORAGE_REFERENCE");
  const endpoint = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
  if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V47_SAFE_LEASE_CAPACITY_REQUIRED:${finite(endpoint.workersMin)}/${finite(endpoint.workersMax)}`);
  }
  if (!sameOrder(list(endpoint.gpuTypeIds), TARGET_POOL)) throw new Error(`AVANTIQO_VIDEO_V47_GPU_POOL_CHANGED:${JSON.stringify(list(endpoint.gpuTypeIds))}`);
  if (!sameSet(list(endpoint.allowedCudaVersions), REQUIRED_CUDA)) throw new Error("AVANTIQO_VIDEO_V47_CUDA_CONTRACT_CHANGED");
  if (!sameSet(endpointVolumes(endpoint), REQUIRED_VOLUMES)) throw new Error("AVANTIQO_VIDEO_V47_VOLUME_CONTRACT_CHANGED");

  const initialHealth = healthSummary(await queue("/health", credential.key));
  if (initialHealth.jobs.in_queue !== 0 || initialHealth.jobs.in_progress !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V47_QUEUE_NOT_CLEAN_AT_LEASE_START:${JSON.stringify(initialHealth)}`);
  }

  const payload = {
    contract: ENGINE_CONTRACT,
    capability: CAPABILITY,
    model: ENDPOINT_NAME,
    instruction: "Premium cinematic sunrise over a calm tropical ocean, natural golden morning light, gentle realistic water movement, clean horizon, slow elegant forward camera drift, photorealistic, no text, no logos.",
    duration_seconds: DURATION_SECONDS,
    fps: FPS,
    aspect_ratio: ASPECT_RATIO,
    resolution: RESOLUTION,
    seed: SEED,
    quality_profile: "cinema",
    storage_upload: {
      signed_url: signedUploadUrl,
      storage_reference: storageReference,
    },
  };

  let submitted = null;
  let attempt = 0;
  const propagationDeadline = Date.now() + 25_000;
  while (!submitted) {
    attempt += 1;
    try {
      submitted = await queue("/run", credential.key, { method: "POST", body: { input: payload } });
    } catch (error) {
      const message = redact(error?.message || error);
      const retryable = /HTTP_409/i.test(message) && /Endpoint is paused/i.test(message) && /max_workers=0/i.test(message);
      if (!retryable) throw error;
      if (Date.now() >= propagationDeadline) throw new Error(`AVANTIQO_VIDEO_V47_QUEUE_PROPAGATION_TIMEOUT:${attempt}:${message}`);
      console.log(`AVANTIQO_VIDEO_V47_QUEUE_PROPAGATION_WAIT=${JSON.stringify({ attempt, retry_in_ms: 1000 })}`);
      await sleep(1_000);
    }
  }

  const jobId = text(submitted.id || submitted.jobId || submitted.job_id);
  if (!jobId) throw new Error("AVANTIQO_VIDEO_V47_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_VIDEO_V47_GENERATION_ACCEPTED=${JSON.stringify({
    job_id: jobId,
    submit_attempts: attempt,
    capability: CAPABILITY,
    foundation_override_present: false,
    requested_duration_seconds: DURATION_SECONDS,
    requested_fps: FPS,
    requested_resolution: RESOLUTION,
    seed: SEED,
  })}`);

  const submittedAt = Date.now();
  let executionStartedAt = null;
  let lastStatus = "";
  let lastHeartbeat = 0;
  let completedBody = null;
  while (true) {
    const body = await queue(`/status/${encodeURIComponent(jobId)}`, credential.key);
    const status = text(body?.status).toUpperCase();
    const now = Date.now();
    if (status !== lastStatus || now - lastHeartbeat >= 30_000) {
      const health = healthSummary(await queue("/health", credential.key));
      console.log(`AVANTIQO_VIDEO_V47_PROGRESS=${JSON.stringify({
        elapsed_seconds: Math.floor((now - submittedAt) / 1000),
        status: status || "UNKNOWN",
        queue: health,
      })}`);
      lastStatus = status;
      lastHeartbeat = now;
    }
    if (status === "IN_PROGRESS" && executionStartedAt === null) executionStartedAt = now;
    if (status === "COMPLETED") {
      completedBody = body;
      break;
    }
    if (["FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) {
      throw new Error(`AVANTIQO_VIDEO_V47_GENERATION_${status}:${redact(body?.error || body?.output?.error || body?.message).slice(0, 1000)}`);
    }
    if (executionStartedAt === null && now - submittedAt > QUEUE_LIMIT_MS) {
      const cancelled = await cancel(jobId, credential.key, "V47_QUEUE_TIMEOUT");
      throw new Error(`AVANTIQO_VIDEO_V47_QUEUE_TIMEOUT:${JSON.stringify(cancelled)}`);
    }
    if (executionStartedAt !== null && now - executionStartedAt > EXECUTION_LIMIT_MS) {
      const cancelled = await cancel(jobId, credential.key, "V47_EXECUTION_TIMEOUT");
      throw new Error(`AVANTIQO_VIDEO_V47_EXECUTION_TIMEOUT:${JSON.stringify(cancelled)}`);
    }
    await sleep(POLL_MS);
  }

  const output = completedBody?.output || {};
  const failures = [
    ["output_status", text(output.status) === "completed"],
    ["provider", text(output.provider) === "avantiqo-video"],
    ["engine_contract", text(output.engine_contract) === ENGINE_CONTRACT],
    ["capability", text(output.capability) === CAPABILITY],
    ["storage_reference", text(output.storage_reference) === storageReference],
    ["foundation_model", text(output.foundation_model) === EXPECTED_T2V],
    ["foundation_source", text(output.foundation_model_source) === "runpod-cache"],
    ["entrypoint", text(output.entrypoint) === EXPECTED_ENTRYPOINT],
    ["entrypoint_revision", text(output.entrypoint_revision) === EXPECTED_ENTRYPOINT_REVISION],
    ["runtime_revision", text(output.runtime_revision) === EXPECTED_RUNTIME_REVISION],
    ["default_routing_applied", output.default_generation_routing_applied === true],
    ["selected_foundation", text(output.foundation_selection?.selected_foundation) === EXPECTED_T2V],
    ["request_override_absent", output.foundation_selection?.request_foundation_override_present === false],
    ["duration", Number(output.duration_seconds) === DURATION_SECONDS],
    ["fps", Number(output.fps) === FPS],
    ["width", Number(output.width) === 1280],
    ["height", Number(output.height) === 704],
    ["frame_count", Number(output.frame_count) >= 17],
    ["size_bytes", Number(output.size_bytes) > 10_000],
    ["generation_seconds", Number(output.generation_seconds) > 0],
    ["seed", Number(output.seed) === SEED],
    ["raw_reasoning_not_persisted", output.raw_reasoning_persisted === false],
  ].filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length) throw new Error(`AVANTIQO_VIDEO_V47_OUTPUT_CONTRACT_FAILED:${failures.join(",")}:${redact(JSON.stringify(output)).slice(0, 1600)}`);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    child_mode: "LEASED_GENERATION",
    endpoint_id: ENDPOINT_ID,
    job_id: jobId,
    generation: {
      capability: text(output.capability),
      foundation_model: text(output.foundation_model),
      foundation_model_source: text(output.foundation_model_source),
      entrypoint: text(output.entrypoint),
      entrypoint_revision: text(output.entrypoint_revision),
      runtime_revision: text(output.runtime_revision),
      duration_seconds: Number(output.duration_seconds),
      fps: Number(output.fps),
      frame_count: Number(output.frame_count),
      width: Number(output.width),
      height: Number(output.height),
      size_bytes: Number(output.size_bytes),
      generation_seconds: Number(output.generation_seconds),
      seed: Number(output.seed),
      storage_reference: text(output.storage_reference),
      default_generation_routing_applied: output.default_generation_routing_applied === true,
    },
    one_generation_submitted: true,
    image_endpoint_mutation: false,
    direct_workers_max_write: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_FIRST_REAL_T2V_V47_CHILD=PASS");
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) throw new Error(`AVANTIQO_VIDEO_V47_NODE20_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
const leased = process.argv.includes("--leased");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    endpoint_id: ENDPOINT_ID,
    capability: CAPABILITY,
    expected_foundation: EXPECTED_T2V,
    foundation_override_present: false,
    duration_seconds: DURATION_SECONDS,
    fps: FPS,
    aspect_ratio: ASPECT_RATIO,
    resolution: RESOLUTION,
    seed: SEED,
    max_provider_jobs: 1,
    safe_lease_required: true,
    requires_clean_resting_0_0_before_start: true,
    stores_one_private_review_asset: true,
    production_deploy_performed: false,
    image_endpoint_mutation: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_FIRST_REAL_T2V_V47_APPLIED=false");
  process.exit(0);
}

if (leased) {
  await runLeased();
  process.exit(0);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const credential = await queueCredential(managementKey);
const before = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
const beforeHealth = healthSummary(await queue("/health", credential.key));
if (text(before.id) !== ENDPOINT_ID || text(before.name) !== ENDPOINT_NAME) throw new Error("AVANTIQO_VIDEO_V47_ENDPOINT_ID_NAME_INVALID");
if (finite(before.workersMin, -1) !== 0 || finite(before.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V47_REQUIRES_V46_CLEANUP_0_0:${finite(before.workersMin)}/${finite(before.workersMax)}`);
}
if (beforeHealth.jobs.in_queue !== 0 || beforeHealth.jobs.in_progress !== 0 || beforeHealth.worker_total !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V47_REQUIRES_CLEAN_QUEUE:${JSON.stringify(beforeHealth)}`);
}
if (!sameOrder(list(before.gpuTypeIds), TARGET_POOL)) throw new Error(`AVANTIQO_VIDEO_V47_REAL_GPU_POOL_REQUIRED:${JSON.stringify(list(before.gpuTypeIds))}`);
if (!sameSet(list(before.allowedCudaVersions), REQUIRED_CUDA)) throw new Error("AVANTIQO_VIDEO_V47_CUDA_CONTRACT_REQUIRED");
if (!sameSet(endpointVolumes(before), REQUIRED_VOLUMES)) throw new Error("AVANTIQO_VIDEO_V47_MULTI_REGION_VOLUMES_REQUIRED");

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const runId = `video-v47-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const storagePath = `benchmark-video-v47/controlled-t2v/${runId}.mp4`;
const storageReference = `storage://${STORAGE_BUCKET}/${storagePath}`;
const { data: upload, error: uploadError } = await supabase.storage
  .from(STORAGE_BUCKET)
  .createSignedUploadUrl(storagePath, { upsert: false });
if (uploadError) throw uploadError;
if (!upload?.signedUrl) throw new Error("AVANTIQO_VIDEO_V47_SIGNED_UPLOAD_REQUIRED");

const cinemaQueueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const env = {
  ...process.env,
  AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
  AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY: cinemaQueueKey,
  AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE: LANE,
  AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_AND_OPEN_HEALTH_LANE: LANE,
  AVANTIQO_VIDEO_V47_SIGNED_UPLOAD_URL: upload.signedUrl,
  AVANTIQO_VIDEO_V47_STORAGE_REFERENCE: storageReference,
};
const child = spawnSync(
  process.execPath,
  [SAFE_LEASE, `--lane=${LANE}`, `--ttl-ms=${LEASE_TTL_MS}`, "--", process.execPath, process.argv[1], "--apply", "--leased"],
  { cwd: process.cwd(), env, stdio: "inherit" },
);
if (child.error) throw child.error;
if (child.status !== 0) {
  console.log(`AVANTIQO_VIDEO_V47_SAFE_LEASE_FAILED=exit=${child.status}`);
  process.exit(child.status || 3);
}

const finalEndpoint = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
const finalHealth = healthSummary(await queue("/health", credential.key));
if (finite(finalEndpoint.workersMin, -1) !== 0 || finite(finalEndpoint.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V47_FINAL_NOT_RESTING_0_0:${finite(finalEndpoint.workersMin)}/${finite(finalEndpoint.workersMax)}`);
}
if (finalHealth.jobs.in_queue !== 0 || finalHealth.jobs.in_progress !== 0 || finalHealth.worker_total !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V47_FINAL_QUEUE_NOT_CLEAN:${JSON.stringify(finalHealth)}`);
}
if (!sameOrder(list(finalEndpoint.gpuTypeIds), TARGET_POOL)) throw new Error("AVANTIQO_VIDEO_V47_FINAL_GPU_POOL_CHANGED");

const folder = storagePath.split("/").slice(0, -1).join("/");
const fileName = storagePath.split("/").at(-1);
const { data: listed, error: listError } = await supabase.storage
  .from(STORAGE_BUCKET)
  .list(folder, { search: fileName, limit: 10 });
if (listError) throw listError;
const stored = list(listed).find((entry) => text(entry?.name) === fileName);
if (!stored) throw new Error("AVANTIQO_VIDEO_V47_STORED_MP4_NOT_FOUND");

const { data: review, error: reviewError } = await supabase.storage
  .from(STORAGE_BUCKET)
  .createSignedUrl(storagePath, 60 * 60);
if (reviewError) throw reviewError;
if (!review?.signedUrl) throw new Error("AVANTIQO_VIDEO_V47_REVIEW_URL_REQUIRED");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_id: ENDPOINT_ID,
  final_workers_min: finite(finalEndpoint.workersMin),
  final_workers_max: finite(finalEndpoint.workersMax),
  final_queue: finalHealth,
  generation_count: 1,
  private_asset_verified: true,
  storage_reference: storageReference,
  stored_object_name: text(stored.name),
  stored_object_size: finite(stored.metadata?.size ?? stored.metadata?.contentLength, null),
  review_url: review.signedUrl,
  review_url_expires_seconds: 3600,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  image_endpoint_mutation: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VIDEO_FIRST_REAL_T2V_V47=PASS");
