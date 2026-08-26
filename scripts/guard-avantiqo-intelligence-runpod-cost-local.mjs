import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2/serverless";
const CONTRACT = "AVANTIQO_INTELLIGENCE_RUNPOD_COST_GUARD_V2";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_RUNPOD_COST_GUARD_EXPECTED_MAIN";
const INTELLIGENCE_NAMES = new Set([
  "avantiqo-intelligence-v1",
  "avantiqo-intelligence-fast-v1",
  "avantiqo-intelligence-fast-replacement-candidate-v1",
  "avantiqo-intelligence-trainer-v1",
]);
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), env: process.env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 1000)}`);
  return text(result.stdout);
}

function validateMain() {
  const expected = text(process.env[EXPECTED_MAIN_ENV]);
  const branch = shell("git", ["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`);
  if (branch !== "main") throw new Error(`${CONTRACT}_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`);
  if (expected) {
    if (!/^[0-9a-f]{40}$/i.test(expected)) throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
    if (head !== expected) throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
    return { head, pinned: true };
  }
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const remote = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_GIT_REMOTE_FAILED`);
  if (head !== remote) throw new Error(`${CONTRACT}_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return { head, pinned: false };
}

function managementKey() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

async function requestJson(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 900)}`);
  }
  return body;
}

function normalizeRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return value.endpoints || value.data || value.items || [];
}

function workerActive(worker = {}) {
  const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
  const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
  if (status && !TERMINAL.has(status)) return true;
  if (desired && !TERMINAL.has(desired)) return true;
  return !status && !desired;
}

const main = validateMain();
const key = managementKey();
const endpoints = normalizeRows(await requestJson(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`, key));
const rows = [];
let readFailures = 0;

for (const endpoint of endpoints.filter((entry) => INTELLIGENCE_NAMES.has(text(entry?.name)))) {
  const endpointId = text(endpoint?.id);
  if (!endpointId) continue;
  let controlWorkers = [];
  let controlReadError = null;
  try {
    const control = await requestJson(`${CONTROL_BASE}/${encodeURIComponent(endpointId)}/workers`, key);
    controlWorkers = list(control?.workers).filter(workerActive);
  } catch (error) {
    readFailures += 1;
    controlReadError = redact(error?.message).slice(0, 300);
  }
  const managementWorkers = list(endpoint?.workers).filter(workerActive);
  rows.push({
    endpoint_name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, null),
    workers_max: finite(endpoint?.workersMax, null),
    active_management_workers: managementWorkers.length,
    active_control_workers: controlWorkers.length,
    control_statuses: controlWorkers.map((worker) => text(worker?.status).toUpperCase()).filter(Boolean),
    control_read_error: controlReadError,
  });
}

const violations = [];
for (const row of rows) {
  if (row.workers_min !== 0) violations.push(`${row.endpoint_name}:WORKERS_MIN_NOT_ZERO`);
  if (row.workers_max !== 0) violations.push(`${row.endpoint_name}:WORKERS_MAX_NOT_ZERO`);
  if (row.active_management_workers !== 0) violations.push(`${row.endpoint_name}:ACTIVE_MANAGEMENT_WORKERS`);
  if (row.active_control_workers !== 0) violations.push(`${row.endpoint_name}:ACTIVE_CONTROL_WORKERS`);
  if (row.control_read_error) violations.push(`${row.endpoint_name}:CONTROL_STATE_UNKNOWN`);
}
if (readFailures > 0) violations.push(`CONTROL_WORKER_READ_FAILURES:${readFailures}`);

const report = {
  success: violations.length === 0,
  contract: CONTRACT,
  main_commit: main.head,
  pinned_main: main.pinned,
  policy: {
    resting_workers_min: 0,
    resting_workers_max: 0,
    expected_active_intelligence_workers: 0,
    paid_execution_path: "RUNPOD_SAFE_LEASE_V2_ONLY",
    parallel_work_allowed: true,
    workers_min_one_allowed: false,
  },
  observed: rows,
  hard_blockers: violations,
  generation_submitted: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=${violations.length === 0 ? "PASS" : "BLOCKED"}`);
if (violations.length > 0) process.exit(3);
