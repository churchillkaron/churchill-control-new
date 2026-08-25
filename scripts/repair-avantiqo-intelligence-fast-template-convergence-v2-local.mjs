import { spawnSync } from "node:child_process";

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_V2";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const SOURCE_PATH = "scripts/repair-avantiqo-intelligence-fast-template-convergence-v2-local.mjs";

const text = (v) => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
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

function validatePinnedMain(expectedHead) {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_FAST_TEMPLATE_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_FAST_TEMPLATE_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_FAST_TEMPLATE_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_FAST_TEMPLATE_GIT_HEAD_FAILED");
  if (head !== expectedHead) {
    throw new Error(`AVANTIQO_FAST_TEMPLATE_LOCAL_MAIN_CHANGED_DURING_RUN:start=${expectedHead}:head=${head}`);
  }
  const sourceChanged = shell(
    "git",
    ["diff", "--name-only", expectedHead, "origin/main", "--", SOURCE_PATH],
    "AVANTIQO_FAST_TEMPLATE_REMOTE_SOURCE_DIFF_FAILED",
  );
  if (sourceChanged) {
    throw new Error(`AVANTIQO_FAST_TEMPLATE_SOURCE_CHANGED_ON_REMOTE:${sourceChanged}`);
  }
  return head;
}

async function readJson(response, prefix) {
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
  return readJson(await fetch(`${REST}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_FAST_TEMPLATE_REST");
}

async function queue(endpointId, key, path, method = "GET") {
  return readJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${path}`, {
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

function command(value) {
  const source = (Array.isArray(value) ? value : [text(value)].filter(Boolean)).map(replaceModel);
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

function runtime(template) {
  return {
    imageName: text(template.imageName),
    containerDiskInGb: num(template.containerDiskInGb, 0),
    dockerEntrypoint: Array.isArray(template.dockerEntrypoint) ? template.dockerEntrypoint : [text(template.dockerEntrypoint)].filter(Boolean),
    dockerStartCmd: Array.isArray(template.dockerStartCmd) ? template.dockerStartCmd : [text(template.dockerStartCmd)].filter(Boolean),
    env: envMap(template.env),
    ports: list(template.ports),
    volumeInGb: num(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
    containerRegistryAuthId: text(template.containerRegistryAuthId),
    isPublic: template.isPublic === true,
  };
}

function desiredFast(deep) {
  if (!JSON.stringify(deep || {}).includes(DEEP_MODEL)) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_MODEL_BINDING_NOT_FOUND");
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
  const serialized = JSON.stringify(body);
  if (!body.imageName || !serialized.includes(FAST_MODEL) || serialized.includes(DEEP_MODEL) || /reasoning[_-]?parser|--reasoning-parser/i.test(serialized)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_DESIRED_TEMPLATE_INVALID");
  }
  return body;
}

function health(value) {
  const jobs = obj(value.jobs), workers = obj(value.workers);
  return {
    jobs: { in_queue: num(jobs.inQueue ?? jobs.in_queue), in_progress: num(jobs.inProgress ?? jobs.in_progress) },
    workers: { initializing: num(workers.initializing), running: num(workers.running), unhealthy: num(workers.unhealthy) },
  };
}

const activeManagement = (endpoint) => list(endpoint?.workers).filter((worker) => {
  const desired = text(worker?.desiredStatus || worker?.desired_status).toUpperCase();
  return desired !== "EXITED";
}).length;

async function load(managementKey, queueKey) {
  const [endpoints, templates] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  ]);
  const deep = list(endpoints).filter((e) => text(e?.name) === DEEP_NAME);
  const fast = list(endpoints).filter((e) => text(e?.name) === FAST_NAME);
  if (deep.length !== 1 || fast.length !== 1) throw new Error(`AVANTIQO_INTELLIGENCE_ENDPOINT_RESOLUTION_FAILED:deep=${deep.length}:fast=${fast.length}`);
  const d = deep[0], f = fast[0];
  const dtid = text(d.templateId || d.template?.id), ftid = text(f.templateId || f.template?.id);
  const dt = list(templates).find((t) => text(t?.id) === dtid) || d.template;
  const ft = list(templates).find((t) => text(t?.id) === ftid) || f.template;
  if (!dtid || !ftid || !dt || !ft) throw new Error("AVANTIQO_INTELLIGENCE_BOUND_TEMPLATE_REQUIRED");
  const fh = health(await queue(f.id, queueKey, "/health"));
  return { endpoints, deep: d, fast: f, deepTemplate: dt, fastTemplate: ft, fastHealth: fh };
}

const parkedScaling = (state) =>
  num(state.deep.workersMin, -1) === 0 && num(state.deep.workersMax, -1) === 1 &&
  num(state.fast.workersMin, -1) === 0 && num(state.fast.workersMax, -1) === 0;

const fastActiveScaling = (state) =>
  num(state.deep.workersMin, -1) === 0 && num(state.deep.workersMax, -1) === 0 &&
  num(state.fast.workersMin, -1) === 0 && num(state.fast.workersMax, -1) === 1;

function assertParkedFastSafe(state) {
  if (!parkedScaling(state)) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_PARKED_SCALING_REQUIRED:deep_max=${num(state.deep.workersMax, -1)}:fast_max=${num(state.fast.workersMax, -1)}`);
  }
  if (state.fastHealth.jobs.in_progress !== 0) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_EXECUTING_JOB_PRESENT");
  if (state.fastHealth.workers.initializing !== 0 || state.fastHealth.workers.running !== 0 || state.fastHealth.workers.unhealthy !== 0 || activeManagement(state.fast) !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_ACTIVE_RUNTIME_PRESENT");
  }
}

async function purgeUnclaimedFastQueue(state, queueKey) {
  if (state.fastHealth.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_EXECUTING_JOB_PRESENT");
  }
  const queued = state.fastHealth.jobs.in_queue;
  if (queued > 0) await queue(state.fast.id, queueKey, "/purge-queue", "POST");
  return queued;
}

async function patchWorkers(endpointId, workersMax, managementKey) {
  const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, "PATCH", {
    workersMin: 0,
    workersMax,
  });
  if (num(verified.workersMin, -1) !== 0 || num(verified.workersMax, -1) !== workersMax) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_SLOT_PATCH_VERIFY_FAILED:endpoint=${text(verified.name)}:max=${num(verified.workersMax, -1)}:expected=${workersMax}`);
  }
}

async function waitForParkedFastSafe(managementKey, queueKey) {
  const timeoutMs = Math.max(30_000, Math.min(180_000, num(process.env.AVANTIQO_INTELLIGENCE_FAST_RECOVERY_TIMEOUT_MS, 120_000)));
  const startedAt = Date.now();
  let state = await load(managementKey, queueKey);
  while (Date.now() - startedAt <= timeoutMs) {
    if (!parkedScaling(state)) {
      throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_RECOVERY_SLOT_CHANGED:deep_max=${num(state.deep.workersMax, -1)}:fast_max=${num(state.fast.workersMax, -1)}`);
    }
    if (state.fastHealth.jobs.in_progress !== 0) {
      throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_RECOVERY_JOB_BECAME_IN_PROGRESS");
    }
    if (
      state.fastHealth.jobs.in_queue === 0 &&
      state.fastHealth.workers.initializing === 0 &&
      state.fastHealth.workers.running === 0 &&
      state.fastHealth.workers.unhealthy === 0 &&
      activeManagement(state.fast) === 0
    ) {
      return state;
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_WAITING_FOR_FAST_PARKED_SAFE",
      elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
      deep_workers_max: num(state.deep.workersMax, -1),
      fast_workers_max: num(state.fast.workersMax, -1),
      fast_health: state.fastHealth,
      fast_active_management_workers: activeManagement(state.fast),
    }));
    await sleep(2_000);
    state = await load(managementKey, queueKey);
  }
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_RECOVERY_TIMEOUT");
}

async function recoverStaleFastActive(state, managementKey, queueKey) {
  if (!fastActiveScaling(state)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_STALE_ACTIVE_STATE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_RECOVER_STALE_ACTIVE_APPROVED).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_RECOVER_STALE_ACTIVE_APPROVED=YES_REQUIRED");
  }
  if (state.fastHealth.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_RECOVERY_EXECUTING_JOB_BLOCKED");
  }

  const purged = await purgeUnclaimedFastQueue(state, queueKey);
  let afterPurge = await load(managementKey, queueKey);
  if (afterPurge.fastHealth.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_RECOVERY_JOB_BECAME_IN_PROGRESS");
  }
  if (afterPurge.fastHealth.jobs.in_queue !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_RECOVERY_QUEUE_PURGE_VERIFY_FAILED");
  }

  await patchWorkers(afterPurge.fast.id, 0, managementKey);
  afterPurge = await load(managementKey, queueKey);
  if (afterPurge.fastHealth.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_RECOVERY_JOB_BECAME_IN_PROGRESS");
  }
  await patchWorkers(afterPurge.deep.id, 1, managementKey);
  return { state: await waitForParkedFastSafe(managementKey, queueKey), purged };
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_APPROVED=YES_REQUIRED");
}
const mainCommit = validateMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !queueKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

console.log(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_SECRETS_PRINTED=false");

let state = await load(managementKey, queueKey);
const initialFastActive = fastActiveScaling(state);
if (!parkedScaling(state) && !initialFastActive) {
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_SLOT_STATE_UNSUPPORTED:deep_max=${num(state.deep.workersMax, -1)}:fast_max=${num(state.fast.workersMax, -1)}`);
}

const desiredInitial = desiredFast(state.deepTemplate);
const currentInitialRuntime = runtime(state.fastTemplate);
const desiredInitialRuntime = runtime(desiredInitial);
const initialFields = Object.keys(desiredInitialRuntime).filter((k) => JSON.stringify(currentInitialRuntime[k]) !== JSON.stringify(desiredInitialRuntime[k]));

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    main_commit: mainCommit,
    stale_fast_active_recovery_required: initialFastActive,
    stale_fast_queue_jobs: state.fastHealth.jobs.in_queue,
    fast_job_in_progress: state.fastHealth.jobs.in_progress,
    drift_fields: initialFields,
    mutation_required: initialFields.length > 0,
    generation_submitted: false,
    production_deploy_performed: false,
    secrets_in_output: false,
  }, null, 2));
  process.exit();
}

let recoveredStaleFastActive = false;
let purged = 0;
if (initialFastActive) {
  const recovered = await recoverStaleFastActive(state, managementKey, queueKey);
  state = recovered.state;
  purged += recovered.purged;
  recoveredStaleFastActive = true;
} else {
  if (state.fastHealth.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_EXECUTING_JOB_PRESENT");
  }
  purged += await purgeUnclaimedFastQueue(state, queueKey);
  state = await waitForParkedFastSafe(managementKey, queueKey);
}
assertParkedFastSafe(state);

const desired = desiredFast(state.deepTemplate);
const currentRuntime = runtime(state.fastTemplate);
const desiredRuntime = runtime(desired);
const fields = Object.keys(desiredRuntime).filter((k) => JSON.stringify(currentRuntime[k]) !== JSON.stringify(desiredRuntime[k]));
const consumers = list(state.endpoints).filter((e) => text(e?.templateId || e?.template?.id) === text(state.fastTemplate.id));
if (consumers.length !== 1 || text(consumers[0]?.id) !== text(state.fast.id)) throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_SHARED_BLOCKED:consumers=${consumers.length}`);

validatePinnedMain(mainCommit);
state = await load(managementKey, queueKey);
assertParkedFastSafe(state);
const deepRuntimeBefore = JSON.stringify(runtime(state.deepTemplate));
const fastEndpointBefore = JSON.stringify({ id: text(state.fast.id), templateId: text(state.fast.templateId || state.fast.template?.id), workersMin: num(state.fast.workersMin, -1), workersMax: num(state.fast.workersMax, -1) });
const freshDesired = desiredFast(state.deepTemplate);
const freshCurrent = runtime(state.fastTemplate);
const freshDesiredRuntime = runtime(freshDesired);
const freshFields = Object.keys(freshDesiredRuntime).filter((k) => JSON.stringify(freshCurrent[k]) !== JSON.stringify(freshDesiredRuntime[k]));

if (freshFields.length > 0) {
  await rest(`/templates/${encodeURIComponent(text(state.fastTemplate.id))}/update`, managementKey, "POST", freshDesired);
}

const verified = await load(managementKey, queueKey);
assertParkedFastSafe(verified);
const remaining = Object.keys(freshDesiredRuntime).filter((k) => JSON.stringify(runtime(verified.fastTemplate)[k]) !== JSON.stringify(freshDesiredRuntime[k]));
if (remaining.length) throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_VERIFY_DRIFT_REMAINS:${remaining.join(",")}`);
if (JSON.stringify(runtime(verified.deepTemplate)) !== deepRuntimeBefore) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_VERIFY_DEEP_TEMPLATE_CHANGED");
if (JSON.stringify({ id: text(verified.fast.id), templateId: text(verified.fast.templateId || verified.fast.template?.id), workersMin: num(verified.fast.workersMin, -1), workersMax: num(verified.fast.workersMax, -1) }) !== fastEndpointBefore) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_VERIFY_FAST_ENDPOINT_CHANGED");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  main_commit: mainCommit,
  recovered_stale_fast_active: recoveredStaleFastActive,
  drift_fields_before: freshFields,
  drift_fields_after: [],
  mutation_required: freshFields.length > 0,
  mutation_performed: freshFields.length > 0,
  fast_queue_jobs_purged: purged,
  fast_parked_safe: true,
  verification_passed: true,
  next_action: "RUN_ENDPOINT_PARITY_DIAGNOSTIC",
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_in_output: false,
}, null, 2));
