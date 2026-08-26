import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const CONTRACT = "AVANTIQO_CODE_PRECERT_SHARED_SLOT_HANDOFF_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const ALLOWED_SHARED_ENDPOINTS = new Set([
  "avantiqo-intelligence-v1",
  TRAINER_ENDPOINT_NAME,
  "avantiqo-intelligence-candidate-v1",
  CODE_ENDPOINT_NAME,
]);
const POLL_MS = 2000;
const DRAIN_TIMEOUT_MS = 120000;

function text(value) { return String(value ?? "").trim(); }
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}
function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function healthCounters(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}
function activeWorkerCount(health = {}) {
  return Object.values(health.workers || {}).reduce((sum, value) => sum + Math.max(0, number(value)), 0);
}
function peerBusy(health = {}) {
  return health.jobs.in_queue > 0 || health.jobs.in_progress > 0 || activeWorkerCount(health) > 0;
}
function trainerBusy(health = {}) {
  return health.jobs.in_queue > 0 || health.jobs.in_progress > 0 ||
    health.workers.initializing > 0 || health.workers.running > 0 ||
    health.workers.throttled > 0 || health.workers.unhealthy > 0;
}
function runpodErrorDetail(body, raw = "") {
  const candidates = [
    body?.detail,
    body?.message?.detail,
    body?.error?.detail,
    body?.message,
    body?.error?.message,
    body?.error,
    raw,
  ];
  const detail = candidates.map((value) => typeof value === "string" ? value.trim() : "").find(Boolean) || "UNKNOWN";
  const code = text(body?.code || body?.message?.code || body?.error?.code);
  const title = text(body?.title || body?.message?.title || body?.error?.title);
  return [code, title, detail].filter(Boolean).join(":").slice(0, 1200);
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
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${runpodErrorDetail(body, raw)}`);
  return body ?? {};
}
async function endpoints(key) {
  const body = await requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, key);
  if (!Array.isArray(body)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  return body;
}
async function health(endpointId, key) {
  return healthCounters(await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key));
}
async function waitForTrainerDrain(trainerId, managementKey, queueKey) {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [rows, trainerHealth] = await Promise.all([endpoints(managementKey), health(trainerId, queueKey)]);
    const trainer = rows.find((row) => text(row.id) === trainerId);
    if (!trainer) throw new Error("AVANTIQO_CODE_PRECERT_TRAINER_DISAPPEARED");
    const liveWorkers = Array.isArray(trainer.workers) ? trainer.workers.length : 0;
    if (number(trainer.workersMin, -1) === 0 && number(trainer.workersMax, -1) === 0 && liveWorkers === 0 && activeWorkerCount(trainerHealth) === 0 && trainerHealth.jobs.in_progress === 0) {
      return trainerHealth;
    }
    await sleep(POLL_MS);
  }
  throw new Error("AVANTIQO_CODE_PRECERT_TRAINER_DRAIN_TIMEOUT");
}

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) loadEnvFile(envPath);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
const configuredCodeId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const apply = process.argv.includes("--apply");
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
if (!queueKey) throw new Error("RUNPOD_CODE_QUEUE_API_KEY_REQUIRED");
if (apply && !yes(process.env.AVANTIQO_CODE_PRECERT_SLOT_HANDOFF_APPROVED)) {
  throw new Error("AVANTIQO_CODE_PRECERT_SLOT_HANDOFF_APPROVED=YES_REQUIRED");
}

let rows = await endpoints(managementKey);
const codeMatches = configuredCodeId ? rows.filter((row) => text(row.id) === configuredCodeId) : rows.filter((row) => text(row.name) === CODE_ENDPOINT_NAME);
const trainerMatches = rows.filter((row) => text(row.name) === TRAINER_ENDPOINT_NAME);
if (codeMatches.length !== 1 || text(codeMatches[0].name) !== CODE_ENDPOINT_NAME) throw new Error(`AVANTIQO_CODE_PRECERT_CODE_RESOLUTION_FAILED:${codeMatches.length}`);
if (trainerMatches.length !== 1) throw new Error(`AVANTIQO_CODE_PRECERT_TRAINER_RESOLUTION_FAILED:${trainerMatches.length}`);
const code = codeMatches[0];
const trainer = trainerMatches[0];
if (number(code.workersMin, -1) !== 0 || number(code.workersMax, -1) !== 0) throw new Error(`AVANTIQO_CODE_PRECERT_CODE_MUST_BE_PAUSED:min=${code.workersMin}:max=${code.workersMax}`);
if (number(trainer.workersMin, -1) !== 0 || ![0, 1].includes(number(trainer.workersMax, -1))) throw new Error("AVANTIQO_CODE_PRECERT_TRAINER_SCALING_UNSUPPORTED");
const sharedVolumes = endpointVolumeIds(code).filter((id) => endpointVolumeIds(trainer).includes(id));
if (sharedVolumes.length !== 1) throw new Error(`AVANTIQO_CODE_PRECERT_SHARED_VOLUME_REQUIRED:${sharedVolumes.length}`);
const peers = rows.filter((row) => endpointVolumeIds(row).some((id) => sharedVolumes.includes(id)));
for (const peer of peers) if (!ALLOWED_SHARED_ENDPOINTS.has(text(peer.name))) throw new Error(`AVANTIQO_CODE_PRECERT_UNEXPECTED_SHARED_PEER:${text(peer.name)}`);

const healthById = new Map();
for (const peer of peers) healthById.set(text(peer.id), await health(text(peer.id), queueKey));
const codeHealth = healthById.get(text(code.id));
const trainerHealth = healthById.get(text(trainer.id));
if (!codeHealth || !trainerHealth) throw new Error("AVANTIQO_CODE_PRECERT_HEALTH_REQUIRED");
if (codeHealth.jobs.in_queue !== 0 || codeHealth.jobs.in_progress !== 0 || activeWorkerCount(codeHealth) !== 0) throw new Error("AVANTIQO_CODE_PRECERT_CODE_QUEUE_OR_WORKER_NOT_CLEAN");
if (trainerBusy(trainerHealth)) throw new Error("AVANTIQO_CODE_PRECERT_TRAINER_BUSY");
const otherActive = peers.filter((peer) => ![CODE_ENDPOINT_NAME, TRAINER_ENDPOINT_NAME].includes(text(peer.name)) && peerBusy(healthById.get(text(peer.id))));
if (otherActive.length) throw new Error(`AVANTIQO_CODE_PRECERT_OTHER_SHARED_PEER_ACTIVE:${otherActive.map((peer) => text(peer.name)).join("|")}`);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  shared_volume_id: sharedVolumes[0],
  code: { id: text(code.id), workers_min: number(code.workersMin, null), workers_max: number(code.workersMax, null), health: codeHealth },
  trainer: { id: text(trainer.id), workers_min: number(trainer.workersMin, null), workers_max: number(trainer.workersMax, null), health: trainerHealth },
  safe_to_handoff: true,
  provider_job_submitted: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};
if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

rows = await endpoints(managementKey);
const freshCode = rows.find((row) => text(row.id) === text(code.id));
const freshTrainer = rows.find((row) => text(row.id) === text(trainer.id));
if (!freshCode || !freshTrainer) throw new Error("AVANTIQO_CODE_PRECERT_ENDPOINT_CHANGED_BEFORE_WRITE");
const [freshCodeHealth, freshTrainerHealth] = await Promise.all([health(text(code.id), queueKey), health(text(trainer.id), queueKey)]);
if (freshCodeHealth.jobs.in_queue !== 0 || freshCodeHealth.jobs.in_progress !== 0 || activeWorkerCount(freshCodeHealth) !== 0) throw new Error("AVANTIQO_CODE_PRECERT_CODE_CHANGED_BEFORE_WRITE");
if (trainerBusy(freshTrainerHealth)) throw new Error("AVANTIQO_CODE_PRECERT_TRAINER_BECAME_BUSY");
if (number(freshCode.workersMin, -1) !== 0 || number(freshCode.workersMax, -1) !== 0) throw new Error("AVANTIQO_CODE_PRECERT_CODE_SCALING_CHANGED");

if (number(freshTrainer.workersMax, -1) === 1) {
  await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(text(trainer.id))}`, managementKey, { method: "PATCH", body: { workersMin: 0, workersMax: 0 } });
}
await waitForTrainerDrain(text(trainer.id), managementKey, queueKey);
await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(text(code.id))}`, managementKey, { method: "PATCH", body: { workersMin: 0, workersMax: 1 } });

const verifiedRows = await endpoints(managementKey);
const verifiedCode = verifiedRows.find((row) => text(row.id) === text(code.id));
const verifiedTrainer = verifiedRows.find((row) => text(row.id) === text(trainer.id));
if (!verifiedCode || !verifiedTrainer) throw new Error("AVANTIQO_CODE_PRECERT_VERIFY_ENDPOINT_MISSING");
if (number(verifiedCode.workersMin, -1) !== 0 || number(verifiedCode.workersMax, -1) !== 1) throw new Error("AVANTIQO_CODE_PRECERT_CODE_RESUME_VERIFY_FAILED");
if (number(verifiedTrainer.workersMin, -1) !== 0 || number(verifiedTrainer.workersMax, -1) !== 0) throw new Error("AVANTIQO_CODE_PRECERT_TRAINER_PAUSE_VERIFY_FAILED");

console.log(JSON.stringify({
  ...plan,
  success: true,
  mutation_performed: true,
  trainer_paused: true,
  trainer_worker_released: true,
  code_resumed: true,
  code_queue_remained_clean: true,
  restore_trainer_after_code_certification_required: true,
  provider_job_submitted: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));