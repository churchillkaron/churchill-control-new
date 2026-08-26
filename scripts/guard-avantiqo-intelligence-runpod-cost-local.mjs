import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2/serverless";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_RUNPOD_COST_GUARD_V1";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_RUNPOD_COST_GUARD_EXPECTED_MAIN";
const EXPECTED_ACTIVE_INTELLIGENCE_WORKERS = Number(
  process.env.AVANTIQO_INTELLIGENCE_RUNPOD_COST_GUARD_EXPECTED_ACTIVE_INTELLIGENCE_WORKERS || 1,
);
const RESERVED_FREE_SLOTS = Number(
  process.env.AVANTIQO_INTELLIGENCE_RUNPOD_COST_GUARD_RESERVED_FREE_SLOTS || 1,
);
const INTELLIGENCE_NAMES = new Set([
  "avantiqo-intelligence-v1",
  "avantiqo-intelligence-fast-v1",
  "avantiqo-intelligence-fast-replacement-candidate-v1",
  "avantiqo-intelligence-trainer-v1",
]);
const BILLING_RISK = new Set(["INITIALIZING", "RUNNING", "OUTDATED"]);
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
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 1000)}`);
  }
  return text(result.stdout);
}

function validateMain() {
  const expected = text(process.env[EXPECTED_MAIN_ENV]);
  if (expected && !/^[0-9a-f]{40}$/i.test(expected)) throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
  const branch = shell("git", ["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`);
  if (branch !== "main") throw new Error(`${CONTRACT}_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`);
  if (expected) {
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

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 900)}`);
  }
  return body;
}

async function graphql(query, key) {
  const body = await requestJson(GRAPHQL_URL, key, { method: "POST", body: { query } });
  if (body?.errors?.length) throw new Error(`${CONTRACT}_GRAPHQL:${redact(body.errors[0]?.message)}`);
  return body;
}

function normalizeRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return value.endpoints || value.data || value.items || [];
}

function classifyWorker(worker) {
  const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
  const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
  const nonterminal = Boolean((status && !TERMINAL.has(status)) || (desired && !TERMINAL.has(desired)));
  const billingRisk = BILLING_RISK.has(status);
  return { status, desired, nonterminal, billingRisk };
}

if (!Number.isInteger(EXPECTED_ACTIVE_INTELLIGENCE_WORKERS) || EXPECTED_ACTIVE_INTELLIGENCE_WORKERS < 0 || EXPECTED_ACTIVE_INTELLIGENCE_WORKERS > 3) {
  throw new Error(`${CONTRACT}_EXPECTED_ACTIVE_INTELLIGENCE_WORKERS_INVALID`);
}
if (!Number.isInteger(RESERVED_FREE_SLOTS) || RESERVED_FREE_SLOTS < 0 || RESERVED_FREE_SLOTS > 3) {
  throw new Error(`${CONTRACT}_RESERVED_FREE_SLOTS_INVALID`);
}

const main = validateMain();
const key = managementKey();
const [accountBody, endpointsRaw] = await Promise.all([
  graphql(`query { myself { underBalance minBalance maxServerlessConcurrency clientBalance } }`, key),
  requestJson(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`, key),
]);
const account = accountBody?.data?.myself;
if (!account) throw new Error(`${CONTRACT}_ACCOUNT_RESPONSE_INVALID`);
const endpoints = normalizeRows(endpointsRaw);

let totalBillingRisk = 0;
let totalNonterminal = 0;
let intelligenceBillingRisk = 0;
let intelligenceNonterminal = 0;
let readFailures = 0;
const endpointRows = [];
for (const endpoint of endpoints) {
  const endpointId = text(endpoint?.id);
  if (!endpointId) continue;
  try {
    const control = await requestJson(`${CONTROL_BASE}/${encodeURIComponent(endpointId)}/workers`, key, { timeoutMs: 15_000 });
    let billingRisk = 0;
    let nonterminal = 0;
    const statuses = [];
    for (const worker of list(control?.workers)) {
      const c = classifyWorker(worker);
      if (c.nonterminal) nonterminal += 1;
      if (c.billingRisk) billingRisk += 1;
      if (c.status) statuses.push(c.status);
    }
    totalBillingRisk += billingRisk;
    totalNonterminal += nonterminal;
    const isIntelligence = INTELLIGENCE_NAMES.has(text(endpoint?.name));
    if (isIntelligence) {
      intelligenceBillingRisk += billingRisk;
      intelligenceNonterminal += nonterminal;
    }
    if (billingRisk || nonterminal || isIntelligence) {
      endpointRows.push({
        name: text(endpoint?.name) || null,
        workers_min: finite(endpoint?.workersMin, null),
        workers_max: finite(endpoint?.workersMax, null),
        billing_risk_workers: billingRisk,
        nonterminal_worker_records: nonterminal,
        statuses,
      });
    }
  } catch {
    readFailures += 1;
  }
}

const maxConcurrency = finite(account?.maxServerlessConcurrency, null);
const clientBalance = finite(account?.clientBalance, null);
const minBalance = finite(account?.minBalance, null);
const hardBlockers = [];
if (account?.underBalance === true) hardBlockers.push("ACCOUNT_UNDER_BALANCE");
if (clientBalance !== null && clientBalance <= 0) hardBlockers.push("CLIENT_BALANCE_NON_POSITIVE");
if (clientBalance !== null && minBalance !== null && clientBalance < minBalance) hardBlockers.push("CLIENT_BALANCE_BELOW_MINIMUM");
if (readFailures > 0) hardBlockers.push("WORKER_CONTROL_STATE_INCOMPLETE");
if (maxConcurrency === null) hardBlockers.push("SERVERLESS_CONCURRENCY_UNKNOWN");
else if (totalBillingRisk + RESERVED_FREE_SLOTS > maxConcurrency) hardBlockers.push("BILLING_RISK_WORKERS_LEAVE_NO_RESERVED_SLOT");
if (intelligenceBillingRisk > EXPECTED_ACTIVE_INTELLIGENCE_WORKERS) hardBlockers.push("UNEXPECTED_MULTIPLE_BILLING_INTELLIGENCE_WORKERS");

const report = {
  success: hardBlockers.length === 0,
  contract: CONTRACT,
  main_commit: main.head,
  pinned_main: main.pinned,
  account: {
    under_balance: account?.underBalance === true,
    client_balance_usd: clientBalance,
    min_balance_usd: minBalance,
    max_serverless_concurrency: maxConcurrency,
  },
  policy: {
    expected_active_intelligence_workers: EXPECTED_ACTIVE_INTELLIGENCE_WORKERS,
    reserved_free_slots: RESERVED_FREE_SLOTS,
    billing_risk_statuses: [...BILLING_RISK],
    ignored_for_billing_guard: ["IDLE", "THROTTLED"],
  },
  observed: {
    total_billing_risk_workers: totalBillingRisk,
    total_nonterminal_worker_records: totalNonterminal,
    intelligence_billing_risk_workers: intelligenceBillingRisk,
    intelligence_nonterminal_worker_records: intelligenceNonterminal,
    worker_control_read_failures: readFailures,
    endpoints: endpointRows,
  },
  hard_blockers: hardBlockers,
  generation_submitted: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(report, null, 2));
if (hardBlockers.length > 0) {
  console.log(`${CONTRACT}=BLOCKED`);
  process.exit(3);
}
console.log(`${CONTRACT}=PASS`);
