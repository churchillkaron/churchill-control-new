const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_LANE_SLOT_MANAGER_V2";
const DEEP_ENDPOINT_NAME = "avantiqo-intelligence-v1";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function requiredCredential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

async function rest(pathname, key) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_INTELLIGENCE_SLOT_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 700)}`);
  }
  return body;
}

const forbiddenActions = ["--activate-fast", "--restore-deep", "--provision"].filter((flag) => process.argv.includes(flag));
if (forbiddenActions.length > 0) {
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    reason: "PERSISTENT_RUNPOD_LANE_ACTIVATION_RETIRED",
    requested_actions: forbiddenActions,
    permanent_rest_state: "DEEP_0_0_FAST_0_0",
    workers_min_one_allowed: false,
    replacement: {
      deep: "AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES node scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs --lane=intelligence-deep -- <command>",
      fast: "AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES node scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs --lane=intelligence-fast -- <command>"
    },
    production_deploy_performed: false,
    secrets_printed: false
  }, null, 2));
  process.exit(3);
}

const key = requiredCredential();
const endpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=true", key);
if (!Array.isArray(endpoints)) throw new Error("AVANTIQO_INTELLIGENCE_SLOT_ENDPOINT_LIST_INVALID");

const rows = [];
for (const name of [DEEP_ENDPOINT_NAME, FAST_ENDPOINT_NAME]) {
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === name);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_INTELLIGENCE_SLOT_ENDPOINT_RESOLUTION_FAILED:${name}:matches=${matches.length}`);
  }
  const endpoint = matches[0];
  rows.push({
    endpoint_name: name,
    endpoint_id_present: Boolean(text(endpoint?.id)),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    active_worker_records: Array.isArray(endpoint?.workers) ? endpoint.workers.length : 0,
    compliant_rest_state: finite(endpoint?.workersMin) === 0 && finite(endpoint?.workersMax) === 0
  });
}

const violations = rows.filter((row) => !row.compliant_rest_state);
console.log(JSON.stringify({
  success: violations.length === 0,
  contract: CONTRACT,
  mode: "READ_ONLY",
  lanes: rows,
  permanent_policy: {
    rest_state: "0/0",
    paid_execution: "SAFE_LEASE_V2_ONLY",
    parallel_work_allowed: true,
    workers_min_one_allowed: false
  },
  violations,
  endpoint_mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false
}, null, 2));
console.log(`${CONTRACT}=${violations.length === 0 ? "PASS" : "BLOCKED"}`);
if (violations.length > 0) process.exit(3);
