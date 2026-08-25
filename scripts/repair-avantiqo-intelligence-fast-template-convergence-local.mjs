import { spawnSync } from "node:child_process";

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

const text = (v) => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const yes = (name) => text(process.env[name]).toUpperCase() === "YES";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shell(name, args, code) {
  const r = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (r.status !== 0) throw new Error(`${code}:${text(r.stderr || r.stdout).slice(0, 700)}`);
  return text(r.stdout);
}

function validateMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_FAST_TEMPLATE_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_FAST_TEMPLATE_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_FAST_TEMPLATE_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_FAST_TEMPLATE_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_FAST_TEMPLATE_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_FAST_TEMPLATE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return head;
}

async function json(response, prefix) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`${prefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(path, key, method = "GET", body = null) {
  return json(await fetch(`${REST}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_FAST_TEMPLATE_REST");
}

async function queue(endpointId, key, path, method = "GET") {
  return json(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_FAST_TEMPLATE_QUEUE");
}

function envMap(value) {
  const pairs = Array.isArray(value)
    ? value.map((e) => [text(e?.key || e?.name), String(e?.value ?? "")])
    : Object.entries(obj(value)).map(([k, v]) => [String(k), String(v ?? "")]);
  return Object.fromEntries(pairs.filter(([k]) => k).sort(([a], [b]) => a.localeCompare(b)));
}

function replaceModel(value) {
  if (typeof value === "string") return value.split(DEEP_MODEL).join(FAST_MODEL);
  if (Array.isArray(value)) return value.map(replaceModel);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceModel(v)]));
  return value;
}

function rawCommand(value) {
  return Array.isArray(value) ? value : [text(value)].filter(Boolean);
}

function command(value) {
  const source = rawCommand(value).map(replaceModel);
  const out = [];
  for (let i = 0; i < source.length; i += 1) {
    const current = text(source[i]);
    if (/^--reasoning-parser(?:=|$)/i.test(current)) {
      if (/^--reasoning-parser$/i.test(current)) i += 1;
      continue;
    }
    out.push(typeof source[i] === "string"
      ? source[i].replace(/\s+--reasoning-parser(?:=\S+|\s+\S+)/gi, "").trim()
      : source[i]);
  }
  return out.filter((v) => text(v));
}

function fastEnv(value) {
  return Object.fromEntries(Object.entries(envMap(value))
    .filter(([k]) => !k.toUpperCase().includes("REASONING_PARSER"))
    .map(([k, v]) => [k, replaceModel(v)]));
}

function assertDeep(template) {
  if (!JSON.stringify(template || {}).includes(DEEP_MODEL)) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_MODEL_BINDING_NOT_FOUND");
}

function assertFastBinding(template, code = "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE") {
  const s = JSON.stringify(template || {});
  if (!s.includes(FAST_MODEL) || s.includes(DEEP_MODEL)) throw new Error(`${code}_MODEL_MISMATCH`);
}

function assertFast(template, code = "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE") {
  assertFastBinding(template, code);
  if (/reasoning[_-]?parser|--reasoning-parser/i.test(JSON.stringify(template || {}))) throw new Error(`${code}_REASONING_PARSER_PRESENT`);
}

function desiredFast(deep) {
  assertDeep(deep);
  const body = {
    containerDiskInGb: Math.max(10, num(deep.containerDiskInGb, 30)),
    dockerEntrypoint: command(deep.dockerEntrypoint),
    dockerStartCmd: command(deep.dockerStartCmd),
    env: fastEnv(deep.env),
    imageName: text(deep.imageName),
    isPublic: false,
    name: FAST_NAME,
    ports: list(deep.ports),
    readme: "Avantiqo-owned fast Intelligence lane. Qwen3-30B-A3B-Instruct-2507; bounded non-thinking decisions only.",
    volumeInGb: Math.max(0, num(deep.volumeInGb, 0)),
    volumeMountPath: text(deep.volumeMountPath) || "/workspace",
    ...(text(deep.containerRegistryAuthId) ? { containerRegistryAuthId: text(deep.containerRegistryAuthId) } : {}),
  };
  if (!body.imageName) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_IMAGE_REQUIRED");
  assertFast(body, "AVANTIQO_INTELLIGENCE_FAST_DESIRED_TEMPLATE");
  return body;
}

function updateBody(template) {
  const body = {
    containerDiskInGb: Math.max(1, num(template.containerDiskInGb, 5)),
    dockerEntrypoint: rawCommand(template.dockerEntrypoint),
    dockerStartCmd: rawCommand(template.dockerStartCmd),
    env: envMap(template.env),
    imageName: text(template.imageName),
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: Math.max(0, num(template.volumeInGb, 0)),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
    ...(text(template.containerRegistryAuthId) ? { containerRegistryAuthId: text(template.containerRegistryAuthId) } : {}),
  };
  if (!body.name || !body.imageName) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_ROLLBACK_BODY_INVALID");
  return body;
}

function runtime(template) {
  return {
    imageName: text(template.imageName),
    containerDiskInGb: num(template.containerDiskInGb, 0),
    dockerEntrypoint: rawCommand(template.dockerEntrypoint),
    dockerStartCmd: rawCommand(template.dockerStartCmd),
    env: envMap(template.env),
    ports: list(template.ports),
    volumeInGb: num(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
    containerRegistryAuthId: text(template.containerRegistryAuthId),
    isPublic: template.isPublic === true,
  };
}

const keyOf = (v) => JSON.stringify(v);
const drift = (current, desired) => {
  const a = runtime(current), b = runtime(desired);
  return Object.keys(b).filter((k) => keyOf(a[k]) !== keyOf(b[k]));
};

function health(value) {
  const jobs = obj(value.jobs), workers = obj(value.workers);
  return {
    jobs: { in_queue: num(jobs.inQueue ?? jobs.in_queue), in_progress: num(jobs.inProgress ?? jobs.in_progress) },
    workers: {
      idle: num(workers.idle), initializing: num(workers.initializing), ready: num(workers.ready),
      running: num(workers.running), throttled: num(workers.throttled), unhealthy: num(workers.unhealthy),
    },
  };
}

const activeManagement = (endpoint) => list(endpoint.workers).filter((w) => text(w?.desiredStatus || w?.desired_status).toUpperCase() !== "EXITED").length;
const workersClear = (h) => Object.values(h.workers).every((v) => v === 0);

async function load(managementKey, queueKey) {
  const [endpoints, templates] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  ]);
  if (!Array.isArray(endpoints) || !Array.isArray(templates)) throw new Error("RUNPOD_INTELLIGENCE_LIST_INVALID");
  const deepMatches = endpoints.filter((e) => text(e?.name) === DEEP_NAME);
  const fastMatches = endpoints.filter((e) => text(e?.name) === FAST_NAME);
  if (deepMatches.length !== 1 || fastMatches.length !== 1) throw new Error(`AVANTIQO_INTELLIGENCE_ENDPOINT_RESOLUTION_FAILED:deep=${deepMatches.length}:fast=${fastMatches.length}`);
  const deep = deepMatches[0], fast = fastMatches[0];
  const deepId = text(deep.templateId || deep.template?.id), fastId = text(fast.templateId || fast.template?.id);
  const deepTemplate = templates.find((t) => text(t?.id) === deepId) || deep.template;
  const fastTemplate = templates.find((t) => text(t?.id) === fastId) || fast.template;
  if (!deepId || !fastId || !deepTemplate || !fastTemplate) throw new Error("AVANTIQO_INTELLIGENCE_BOUND_TEMPLATE_REQUIRED");
  assertDeep(deepTemplate);
  assertFastBinding(fastTemplate);
  const [deepHealth, fastHealth] = await Promise.all([queue(deep.id, queueKey, "/health"), queue(fast.id, queueKey, "/health")]);
  return { endpoints, deep, fast, deepTemplate, fastTemplate, deepHealth: health(deepHealth), fastHealth: health(fastHealth) };
}

const scalingParked = (s) => num(s.deep.workersMin, -1) === 0 && num(s.deep.workersMax, -1) === 1 && num(s.fast.workersMin, -1) === 0 && num(s.fast.workersMax, -1) === 0;
const fullyParked = (s) => scalingParked(s)
  && s.deepHealth.jobs.in_queue === 0 && s.deepHealth.jobs.in_progress === 0
  && s.fastHealth.jobs.in_queue === 0 && s.fastHealth.jobs.in_progress === 0
  && activeManagement(s.deep) === 0 && activeManagement(s.fast) === 0
  && workersClear(s.deepHealth) && workersClear(s.fastHealth);

function exclusive(s) {
  const id = text(s.fastTemplate.id);
  const consumers = s.endpoints.filter((e) => text(e?.templateId || e?.template?.id) === id);
  return { ok: consumers.length === 1 && text(consumers[0]?.id) === text(s.fast.id), count: consumers.length };
}

async function waitFor(managementKey, queueKey, predicate, event, timeoutCode) {
  const timeout = Math.max(30_000, Math.min(15 * 60_000, num(process.env.AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_WAIT_TIMEOUT_MS, 10 * 60_000)));
  const poll = Math.max(1_000, Math.min(15_000, num(process.env.AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_POLL_MS, 5_000)));
  const start = Date.now();
  let state = await load(managementKey, queueKey), stable = 0;
  while (Date.now() - start <= timeout) {
    if (predicate(state)) {
      stable += 1;
      if (stable >= 2) return state;
    } else stable = 0;
    console.log(JSON.stringify({ event, elapsed_seconds: Math.floor((Date.now() - start) / 1000), deep_workers_max: num(state.deep.workersMax, -1), fast_workers_max: num(state.fast.workersMax, -1), deep_health: state.deepHealth, fast_health: state.fastHealth }));
    await sleep(poll);
    state = await load(managementKey, queueKey);
  }
  throw new Error(timeoutCode);
}

function endpointState(e) {
  return {
    id: text(e.id), name: text(e.name), template_id: text(e.templateId || e.template?.id),
    workers_min: num(e.workersMin, -1), workers_max: num(e.workersMax, -1),
    compute_type: text(e.computeType), execution_timeout_ms: num(e.executionTimeoutMs),
    flashboot: e.flashboot !== false, gpu_count: num(e.gpuCount),
    gpu_type_ids: list(e.gpuTypeIds).map(text).filter(Boolean), idle_timeout: num(e.idleTimeout),
    scaler_type: text(e.scalerType), scaler_value: num(e.scalerValue), network_volume_id: text(e.networkVolumeId),
  };
}

function safeEndpoint(e) {
  return { name: text(e.name), workers_min: num(e.workersMin, -1), workers_max: num(e.workersMax, -1), active_management_workers: activeManagement(e), template_id_present: Boolean(text(e.templateId || e.template?.id)) };
}

const apply = process.argv.includes("--apply");
if (apply && !yes("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_APPROVED")) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_APPROVED=YES_REQUIRED");
const mainCommit = validateMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;

console.log(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_SECRETS_PRINTED=false");

let state = await load(managementKey, queueKey);
const desiredInitial = desiredFast(state.deepTemplate);
const initialDrift = drift(state.fastTemplate, desiredInitial);
const sharing = exclusive(state);
const plan = {
  success: sharing.ok, contract: CONTRACT, mode: apply ? "APPLY" : "PLAN", main_commit: mainCommit,
  deep_endpoint: safeEndpoint(state.deep), fast_endpoint: safeEndpoint(state.fast),
  parked_scaling: scalingParked(state), fully_parked: fullyParked(state),
  fast_template_exclusive: sharing.ok, fast_template_consumer_count: sharing.count,
  drift_fields: initialDrift, mutation_required: initialDrift.length > 0,
  stale_fast_queue_jobs: state.fastHealth.jobs.in_queue,
  generation_submitted: false, production_deploy_performed: false, secrets_in_output: false,
};
if (!apply) { console.log(JSON.stringify(plan, null, 2)); if (!sharing.ok) process.exitCode = 2; process.exit(); }
if (!sharing.ok) throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_SHARED_BLOCKED:consumers=${sharing.count}`);

state = await waitFor(managementKey, queueKey, scalingParked, "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_WAITING_FOR_PARKED_SCALING", "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_PARKED_SCALING_TIMEOUT");
let purged = 0;
if (state.fastHealth.jobs.in_queue > 0) {
  if (state.fastHealth.jobs.in_progress !== 0 || activeManagement(state.fast) !== 0 || state.fastHealth.workers.running !== 0 || state.fastHealth.workers.initializing !== 0) throw new Error("AVANTIQO_INTELLIGENCE_FAST_QUEUE_PURGE_ACTIVE_WORK_BLOCKED");
  purged = state.fastHealth.jobs.in_queue;
  await queue(state.fast.id, queueKey, "/purge-queue", "POST");
}
state = await waitFor(managementKey, queueKey, fullyParked, "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_WAITING_FOR_FULL_PARK", "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_FULL_PARK_TIMEOUT");
validateMain();
state = await load(managementKey, queueKey);
if (!fullyParked(state)) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_PARKED_STATE_CHANGED_REPLAN_REQUIRED");
const freshSharing = exclusive(state);
if (!freshSharing.ok) throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_SHARING_CHANGED:consumers=${freshSharing.count}`);

const desired = desiredFast(state.deepTemplate);
const fields = drift(state.fastTemplate, desired);
if (fields.length === 0) {
  console.log(JSON.stringify({ ...plan, success: true, mode: "APPLY", fully_parked: true, drift_fields: [], mutation_required: false, mutation_performed: false, fast_queue_jobs_purged: purged, verification_passed: true, next_action: "RUN_FAST_FIRST_RESPONSE_ONCE" }, null, 2));
  process.exit();
}

const fastTemplateId = text(state.fastTemplate.id);
const originalFast = state.fastTemplate;
const deepRuntimeBefore = keyOf(runtime(state.deepTemplate));
const deepEndpointBefore = keyOf(endpointState(state.deep));
const fastEndpointBefore = keyOf(endpointState(state.fast));
let mutated = false;
try {
  await rest(`/templates/${encodeURIComponent(fastTemplateId)}/update`, managementKey, "POST", desired);
  mutated = true;
  const verified = await load(managementKey, queueKey);
  const remaining = drift(verified.fastTemplate, desired);
  if (remaining.length) throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_VERIFY_DRIFT_REMAINS:${remaining.join(",")}`);
  assertFast(verified.fastTemplate, "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_VERIFIED");
  if (keyOf(runtime(verified.deepTemplate)) !== deepRuntimeBefore) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_VERIFY_DEEP_TEMPLATE_CHANGED");
  if (keyOf(endpointState(verified.deep)) !== deepEndpointBefore) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_VERIFY_DEEP_ENDPOINT_CHANGED");
  if (keyOf(endpointState(verified.fast)) !== fastEndpointBefore) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_VERIFY_FAST_ENDPOINT_CHANGED");
  if (!exclusive(verified).ok) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_VERIFY_SHARING_CHANGED");
  if (!fullyParked(verified)) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_VERIFY_NOT_PARKED");
  console.log(JSON.stringify({ ...plan, success: true, mode: "APPLY", drift_fields_before: fields, drift_fields_after: [], mutation_required: true, mutation_performed: true, fast_queue_jobs_purged: purged, deep_template_changed: false, deep_endpoint_changed: false, fast_endpoint_changed: false, fully_parked: true, verification_passed: true, next_action: "RUN_FAST_FIRST_RESPONSE_ONCE" }, null, 2));
} catch (error) {
  const rollbackErrors = [];
  if (mutated) {
    try { await rest(`/templates/${encodeURIComponent(fastTemplateId)}/update`, managementKey, "POST", updateBody(originalFast)); }
    catch (rollbackError) { rollbackErrors.push(text(rollbackError?.message || rollbackError).slice(0, 500)); }
  }
  console.error(JSON.stringify({ success: false, contract: CONTRACT, error: text(error?.message || error), rollback_attempted: mutated, rollback_errors: rollbackErrors, fast_queue_jobs_purged: purged, generation_submitted: false, production_deploy_performed: false, secrets_in_output: false }));
  throw error;
}
