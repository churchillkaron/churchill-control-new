import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_RUNPOD_SCALE_TO_ZERO_ENFORCER_V1";
const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 700)}`);
  return text(result.stdout);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_RUNPOD_SCALE_ZERO_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_RUNPOD_SCALE_ZERO_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_RUNPOD_SCALE_ZERO_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_RUNPOD_SCALE_ZERO_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_RUNPOD_SCALE_ZERO_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_RUNPOD_SCALE_ZERO_LOCAL_MAIN_NOT_CURRENT:${head}:${remote}`);
  return head;
}

async function request(path, token, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`AVANTIQO_RUNPOD_SCALE_ZERO_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  return body ?? {};
}

function endpointRows(payload) {
  if (Array.isArray(payload)) return payload;
  return list(payload?.endpoints || payload?.data || payload?.items);
}

const mainCommit = validateCurrentMain();
const apply = process.argv.includes("--apply");
if (apply && !approved(process.env.AVANTIQO_RUNPOD_SCALE_TO_ZERO_APPROVED)) {
  throw new Error("AVANTIQO_RUNPOD_SCALE_TO_ZERO_APPROVED=YES_REQUIRED");
}
const token = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!token) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const initialPayload = await request("/endpoints?includeTemplate=false&includeWorkers=false", token);
const initial = endpointRows(initialPayload);
if (!initial.length) throw new Error("AVANTIQO_RUNPOD_SCALE_ZERO_ENDPOINT_LIST_EMPTY");

const violations = initial
  .filter((endpoint) => finite(endpoint?.workersMin, 0) > 0)
  .map((endpoint) => ({
    id: text(endpoint?.id),
    name: text(endpoint?.name) || null,
    workers_min_before: finite(endpoint?.workersMin, 0),
    workers_max: finite(endpoint?.workersMax, 0),
  }));

const mutations = [];
if (apply) {
  for (const endpoint of violations) {
    if (!endpoint.id) continue;
    await request(`/endpoints/${encodeURIComponent(endpoint.id)}`, token, {
      method: "PATCH",
      body: { workersMin: 0 },
    });
    mutations.push({ endpoint_id: endpoint.id, endpoint_name: endpoint.name, workers_min_before: endpoint.workers_min_before, workers_min_after: 0 });
  }
}

const finalPayload = apply
  ? await request("/endpoints?includeTemplate=false&includeWorkers=false", token)
  : initialPayload;
const finalRows = endpointRows(finalPayload);
const remainingViolations = finalRows
  .filter((endpoint) => finite(endpoint?.workersMin, 0) > 0)
  .map((endpoint) => ({ id: text(endpoint?.id), name: text(endpoint?.name) || null, workers_min: finite(endpoint?.workersMin, 0), workers_max: finite(endpoint?.workersMax, 0) }));

if (apply && remainingViolations.length) {
  throw new Error(`AVANTIQO_RUNPOD_SCALE_ZERO_VERIFY_FAILED:${JSON.stringify(remainingViolations)}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: mainCommit,
  endpoint_count: finalRows.length,
  violations_before: violations,
  mutations,
  violations_after: remainingViolations,
  policy: {
    workers_min_required: 0,
    workers_max_unchanged: true,
    templates_unchanged: true,
    gpu_pools_unchanged: true,
    queue_mutation_performed: false,
    active_jobs_cancelled: false,
  },
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
