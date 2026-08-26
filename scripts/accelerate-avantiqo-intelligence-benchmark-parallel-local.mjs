import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_BENCHMARK_PARALLEL_ACCELERATION_V1";
const BENCHMARK_SCOPE = "platform_model_benchmark_runs";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const TARGET_WORKERS_MAX = 2;
const STABILITY_DELAY_MS = 1000;
const START_POLL_MS = 10_000;
const START_MAX_POLLS = 180;
const MAX_SERVERLESS_CONCURRENCY = 10;
const ALLOWED_SHARED_ENDPOINT_NAMES = new Set([
  "avantiqo-intelligence-v1",
  TRAINER_ENDPOINT_NAME,
  "avantiqo-intelligence-candidate-v1",
  "avantiqo-code-v1",
]);
const ACTIVE_RUN_STATUSES = new Set(["BENCHMARK_SUBMITTED", "BENCHMARK_RUNNING"]);
const EXITED_WORKER_STATES = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function unique(values) {
  return [...new Set(values.map((value) => text(value, 240)).filter(Boolean))];
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint?.networkVolumeId, ...list(endpoint?.networkVolumeIds)]);
}
function shell(name, args, label) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${label}:${text(result.stderr || result.stdout, 1000)}`);
  }
  return text(result.stdout, 1200);
}
function validateMain() {
  shell("git", ["fetch", "origin", "main"], "BENCHMARK_PARALLEL_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "BENCHMARK_PARALLEL_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`BENCHMARK_PARALLEL_MAIN_REQUIRED:${branch || "DETACHED"}`);
  let head = shell("git", ["rev-parse", "HEAD"], "BENCHMARK_PARALLEL_GIT_HEAD_FAILED");
  let remote = shell("git", ["rev-parse", "origin/main"], "BENCHMARK_PARALLEL_GIT_REMOTE_FAILED");
  if (head !== remote) {
    const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", head, remote], {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    });
    if (ancestry.status !== 0) {
      throw new Error(`BENCHMARK_PARALLEL_MAIN_DIVERGED:head=${head}:origin_main=${remote}`);
    }
    const changed = shell(
      "git",
      ["diff", "--name-only", `${head}..${remote}`],
      "BENCHMARK_PARALLEL_MAIN_DRIFT_DIFF_FAILED",
    ).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const protectedPaths = new Set([
      "scripts/accelerate-avantiqo-intelligence-benchmark-parallel-local.mjs",
      "lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime.js",
      "lib/intelligence/runtime/AvantiqoSharedTrainerReservationGuard.js",
      "services/avantiqo-intelligence-benchmark/handler.py",
    ]);
    const protectedMovement = changed.filter((path) => protectedPaths.has(path));
    if (protectedMovement.length) {
      throw new Error(`BENCHMARK_PARALLEL_RELEVANT_MAIN_MOVEMENT:${protectedMovement.join(",")}`);
    }
    shell("git", ["merge", "--ff-only", "origin/main"], "BENCHMARK_PARALLEL_MAIN_FAST_FORWARD_FAILED");
    head = shell("git", ["rev-parse", "HEAD"], "BENCHMARK_PARALLEL_GIT_HEAD_AFTER_FAST_FORWARD_FAILED");
    remote = shell("git", ["rev-parse", "origin/main"], "BENCHMARK_PARALLEL_GIT_REMOTE_AFTER_FAST_FORWARD_FAILED");
    if (head !== remote) {
      throw new Error(`BENCHMARK_PARALLEL_MAIN_FAST_FORWARD_VERIFY_FAILED:head=${head}:origin_main=${remote}`);
    }
    console.log(JSON.stringify({
      contract: CONTRACT,
      event: "AVANTIQO_INTELLIGENCE_BENCHMARK_PARALLEL_UNRELATED_MAIN_MOVEMENT_TOLERATED",
      changed_paths: changed,
      main_commit: head,
      provider_jobs_submitted: false,
      endpoint_mutation_performed: false,
      secrets_printed: false,
    }, null, 2));
  }
  return head;
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY, 4000) || text(process.env.RUNPOD_API_KEY, 4000);
const queueKey = text(process.env.RUNPOD_API_KEY, 4000) || managementKey;
const benchmarkEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID, 240);
const trainerEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID, 240);
if (!yes(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_PARALLEL_APPROVED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_PARALLEL_APPROVED=YES_REQUIRED");
}
if (!yes(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED=YES_REQUIRED");
}
if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
  throw new Error("BENCHMARK_PARALLEL_DEVELOPMENT_ENV_REQUIRED");
}
if (!managementKey) throw new Error("BENCHMARK_PARALLEL_MANAGEMENT_KEY_REQUIRED");
if (!queueKey) throw new Error("BENCHMARK_PARALLEL_QUEUE_KEY_REQUIRED");
if (!benchmarkEndpointId) throw new Error("BENCHMARK_PARALLEL_ENDPOINT_ID_REQUIRED");
if (!trainerEndpointId || trainerEndpointId !== benchmarkEndpointId) {
  throw new Error("BENCHMARK_PARALLEL_ENDPOINT_TRAINER_ID_MISMATCH");
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.detail || body?.message || body?.error?.message || body?.error || raw, 1000);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}
async function rest(path, options = {}) {
  return readJson(
    await fetch(`${REST_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    }),
    "BENCHMARK_PARALLEL_REST",
  );
}
async function queue(path) {
  return readJson(
    await fetch(`${QUEUE_BASE}/${path}`, {
      headers: { Authorization: `Bearer ${queueKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }),
    "BENCHMARK_PARALLEL_QUEUE",
  );
}
function healthCounters(raw = {}) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}
function activeQueueWorkerCount(health = {}) {
  return Object.values(object(health.workers)).reduce((sum, value) => sum + Math.max(0, finite(value)), 0);
}
function liveManagementWorkers(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 80).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 80).toUpperCase();
    if (desired && !EXITED_WORKER_STATES.has(desired)) return true;
    return Boolean(status && !EXITED_WORKER_STATES.has(status));
  }).length;
}
async function accountConcurrencySnapshot() {
  const endpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=true");
  if (!Array.isArray(endpoints)) throw new Error("BENCHMARK_PARALLEL_ACCOUNT_ENDPOINT_LIST_INVALID");
  const active = endpoints
    .map((endpoint) => ({
      name: text(endpoint?.name, 240),
      active_workers: liveManagementWorkers(endpoint),
    }))
    .filter((entry) => entry.active_workers > 0);
  return {
    max_serverless_concurrency: MAX_SERVERLESS_CONCURRENCY,
    active_control_workers: active.reduce((sum, entry) => sum + entry.active_workers, 0),
    concurrency_remaining: Math.max(
      0,
      MAX_SERVERLESS_CONCURRENCY - active.reduce((sum, entry) => sum + entry.active_workers, 0),
    ),
    active_endpoints: active,
  };
}
function normalizedProviderStatus(body = {}) {
  const status = text(body?.status, 80).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) return "completed";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) return "failed";
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(status)) return "queued";
  if (["IN_PROGRESS", "RUNNING", "PROCESSING"].includes(status)) return "processing";
  return status.toLowerCase() || "unknown";
}
async function providerStatus(jobId) {
  return normalizedProviderStatus(
    await queue(`${encodeURIComponent(benchmarkEndpointId)}/status/${encodeURIComponent(jobId)}`),
  );
}

const mainCommit = validateMain();
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { ensureAvantiqoLearningOrganizationEnvironment } = await import(
  "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime"
);
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const organization = await ensureAvantiqoLearningOrganizationEnvironment();

const runResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", BENCHMARK_SCOPE)
  .eq("active", true)
  .order("updated_at", { ascending: false })
  .limit(10);
if (runResult.error) throw runResult.error;
const activeRuns = list(runResult.data).filter((row) =>
  ACTIVE_RUN_STATUSES.has(text(object(row.metadata).status, 80)),
);
if (activeRuns.length !== 1) {
  throw new Error(`BENCHMARK_PARALLEL_ACTIVE_RUN_RESOLUTION_FAILED:${activeRuns.length}`);
}
const run = activeRuns[0];
const runMetadata = object(run.metadata);
const baselineJobId = text(runMetadata.baseline_provider_job_id, 240);
const candidateJobId = text(runMetadata.candidate_provider_job_id, 240);
if (!baselineJobId || !candidateJobId) throw new Error("BENCHMARK_PARALLEL_PROVIDER_JOB_IDS_REQUIRED");

const [baselineStatus, candidateStatus] = await Promise.all([
  providerStatus(baselineJobId),
  providerStatus(candidateJobId),
]);
if (baselineStatus === "failed" || candidateStatus === "failed") {
  throw new Error(`BENCHMARK_PARALLEL_JOB_FAILED:baseline=${baselineStatus}:candidate=${candidateStatus}`);
}
if (candidateStatus === "completed") {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    event: "AVANTIQO_INTELLIGENCE_BENCHMARK_PARALLEL_NOT_NEEDED",
    main_commit: mainCommit,
    benchmark_run_subject: text(run.subject, 240),
    baseline_status: baselineStatus,
    candidate_status: candidateStatus,
    provider_jobs_submitted: false,
    provider_jobs_cancelled: false,
    endpoint_mutation_performed: false,
    production_model_promoted: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_PARALLEL=NOT_NEEDED");
  process.exit(0);
}

async function inspectSharedState() {
  const endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true");
  if (!Array.isArray(endpoints)) throw new Error("BENCHMARK_PARALLEL_ENDPOINT_LIST_INVALID");
  const matches = endpoints.filter((endpoint) => text(endpoint?.id, 240) === benchmarkEndpointId);
  if (matches.length !== 1) throw new Error(`BENCHMARK_PARALLEL_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  if (text(endpoint?.name, 240) !== TRAINER_ENDPOINT_NAME) {
    throw new Error("BENCHMARK_PARALLEL_ENDPOINT_NAME_MISMATCH");
  }
  const template = object(endpoint?.template);
  if (text(template?.env?.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED, 40).toLowerCase() !== "true") {
    throw new Error("BENCHMARK_PARALLEL_BENCHMARK_TEMPLATE_NOT_ENABLED");
  }
  if (text(template?.env?.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED, 40).toLowerCase() === "true") {
    throw new Error("BENCHMARK_PARALLEL_TRAINER_TEMPLATE_ENABLED");
  }
  if (finite(endpoint?.workersMin, -1) !== 0) {
    throw new Error(`BENCHMARK_PARALLEL_WORKERS_MIN_INVALID:${finite(endpoint?.workersMin, -1)}`);
  }
  if (![1, TARGET_WORKERS_MAX].includes(finite(endpoint?.workersMax, -1))) {
    throw new Error(`BENCHMARK_PARALLEL_WORKERS_MAX_INVALID:${finite(endpoint?.workersMax, -1)}`);
  }
  const sharedVolumeIds = endpointVolumeIds(endpoint);
  if (!sharedVolumeIds.length) throw new Error("BENCHMARK_PARALLEL_SHARED_VOLUME_REQUIRED");
  const peers = endpoints.filter((peer) =>
    endpointVolumeIds(peer).some((id) => sharedVolumeIds.includes(id)),
  );
  if (peers.length < 2) throw new Error(`BENCHMARK_PARALLEL_SHARED_PEERS_REQUIRED:${peers.length}`);
  const snapshots = [];
  for (const peer of peers) {
    const peerName = text(peer?.name, 240);
    const peerId = text(peer?.id, 240);
    if (!ALLOWED_SHARED_ENDPOINT_NAMES.has(peerName)) {
      throw new Error(`BENCHMARK_PARALLEL_UNEXPECTED_SHARED_PEER:${peerName || "UNKNOWN"}`);
    }
    if (!peerId) throw new Error("BENCHMARK_PARALLEL_SHARED_PEER_ID_REQUIRED");
    const health = healthCounters(await queue(`${encodeURIComponent(peerId)}/health`));
    const liveWorkers = liveManagementWorkers(peer);
    if (peerId !== benchmarkEndpointId) {
      if (finite(peer?.workersMin, -1) !== 0 || finite(peer?.workersMax, -1) !== 0) {
        throw new Error(`BENCHMARK_PARALLEL_PEER_NOT_PARKED:${peerName}:min=${finite(peer?.workersMin, -1)}:max=${finite(peer?.workersMax, -1)}`);
      }
      if (liveWorkers > 0 || health.jobs.in_queue > 0 || health.jobs.in_progress > 0 || activeQueueWorkerCount(health) > 0) {
        throw new Error(`BENCHMARK_PARALLEL_PEER_BUSY:${peerName}`);
      }
    } else {
      if (health.jobs.in_queue + health.jobs.in_progress > 2) {
        throw new Error(`BENCHMARK_PARALLEL_UNEXPECTED_BENCHMARK_JOB_COUNT:${health.jobs.in_queue + health.jobs.in_progress}`);
      }
      if (health.workers.unhealthy > 0 || health.workers.throttled > 0) {
        throw new Error(`BENCHMARK_PARALLEL_BENCHMARK_RUNTIME_UNHEALTHY:unhealthy=${health.workers.unhealthy}:throttled=${health.workers.throttled}`);
      }
    }
    snapshots.push({
      id: peerId,
      name: peerName,
      workers_min: finite(peer?.workersMin, -1),
      workers_max: finite(peer?.workersMax, -1),
      live_management_workers: liveWorkers,
      health,
    });
  }
  snapshots.sort((left, right) => left.name.localeCompare(right.name));
  return { endpoint, sharedVolumeIds, peers: snapshots };
}

const first = await inspectSharedState();
await sleep(STABILITY_DELAY_MS);
const second = await inspectSharedState();
const nonBenchmarkFirst = first.peers.filter((peer) => peer.id !== benchmarkEndpointId);
const nonBenchmarkSecond = second.peers.filter((peer) => peer.id !== benchmarkEndpointId);
if (JSON.stringify(nonBenchmarkFirst) !== JSON.stringify(nonBenchmarkSecond)) {
  throw new Error("BENCHMARK_PARALLEL_SHARED_PEER_STATE_NOT_STABLE");
}

const before = second.endpoint;
const beforeTemplateId = text(before?.templateId || before?.template?.id, 240);
const beforeVolumeId = text(before?.networkVolumeId, 240);
const beforeGpuTypeIds = list(before?.gpuTypeIds);
const beforeWorkersMax = finite(before?.workersMax, -1);
const accountBefore = await accountConcurrencySnapshot();

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_BENCHMARK_PARALLEL_PREFLIGHT",
  main_commit: mainCommit,
  benchmark_run_subject: text(run.subject, 240),
  baseline_status: baselineStatus,
  candidate_status: candidateStatus,
  current_workers_max: beforeWorkersMax,
  target_workers_max: TARGET_WORKERS_MAX,
  shared_peer_count: second.peers.length,
  non_benchmark_peers_parked_and_idle: true,
  stable_shared_peer_observations: 2,
  account_concurrency: accountBefore,
  provider_jobs_submitted: false,
  provider_jobs_cancelled: false,
  production_model_promoted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (beforeWorkersMax !== TARGET_WORKERS_MAX) {
  await rest(`/endpoints/${encodeURIComponent(benchmarkEndpointId)}`, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: TARGET_WORKERS_MAX },
  });
}
const verified = await rest(`/endpoints/${encodeURIComponent(benchmarkEndpointId)}?includeTemplate=true&includeWorkers=true`);
if (finite(verified?.workersMin, -1) !== 0 || finite(verified?.workersMax, -1) !== TARGET_WORKERS_MAX) {
  throw new Error(`BENCHMARK_PARALLEL_SCALE_VERIFY_FAILED:min=${finite(verified?.workersMin, -1)}:max=${finite(verified?.workersMax, -1)}`);
}
if (text(verified?.templateId || verified?.template?.id, 240) !== beforeTemplateId) {
  throw new Error("BENCHMARK_PARALLEL_TEMPLATE_CHANGED");
}
if (text(verified?.networkVolumeId, 240) !== beforeVolumeId) {
  throw new Error("BENCHMARK_PARALLEL_VOLUME_CHANGED");
}
if (JSON.stringify(list(verified?.gpuTypeIds)) !== JSON.stringify(beforeGpuTypeIds)) {
  throw new Error("BENCHMARK_PARALLEL_GPU_POOL_CHANGED");
}

let observedBaseline = baselineStatus;
let observedCandidate = candidateStatus;
let lastConcurrency = accountBefore;
for (let poll = 1; poll <= START_MAX_POLLS; poll += 1) {
  [observedBaseline, observedCandidate] = await Promise.all([
    providerStatus(baselineJobId),
    providerStatus(candidateJobId),
  ]);
  if (poll === 1 || poll % 3 === 0 || observedCandidate !== "queued") {
    lastConcurrency = await accountConcurrencySnapshot();
    console.log(JSON.stringify({
      contract: CONTRACT,
      event: "AVANTIQO_INTELLIGENCE_BENCHMARK_PARALLEL_PROGRESS",
      poll,
      workers_max: TARGET_WORKERS_MAX,
      baseline_status: observedBaseline,
      candidate_status: observedCandidate,
      account_concurrency: lastConcurrency,
      provider_jobs_submitted: false,
      provider_jobs_cancelled: false,
      secrets_printed: false,
    }, null, 2));
  }
  if (observedBaseline === "failed" || observedCandidate === "failed") {
    throw new Error(`BENCHMARK_PARALLEL_JOB_FAILED_AFTER_SCALE:baseline=${observedBaseline}:candidate=${observedCandidate}`);
  }
  if (observedCandidate !== "queued") break;
  if (poll < START_MAX_POLLS) await sleep(START_POLL_MS);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_BENCHMARK_PARALLEL_APPLIED",
  benchmark_run_subject: text(run.subject, 240),
  workers_min: 0,
  workers_max: TARGET_WORKERS_MAX,
  baseline_status: observedBaseline,
  candidate_status: observedCandidate,
  second_worker_started: observedCandidate !== "queued",
  account_concurrency: lastConcurrency,
  provider_jobs_submitted: false,
  provider_jobs_cancelled: false,
  endpoint_mutation_performed: beforeWorkersMax !== TARGET_WORKERS_MAX,
  production_model_promoted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_PARALLEL=PASS");
