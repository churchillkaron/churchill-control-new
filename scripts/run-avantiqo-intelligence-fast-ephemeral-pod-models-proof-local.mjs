import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V1";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_APPROVED";
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const POD_PORT = 8000;
const POLL_MS = 5_000;
const POD_START_TIMEOUT_MS = 15 * 60_000;
const MODEL_ROUTE_TIMEOUT_MS = 20 * 60_000;
const CLEANUP_TIMEOUT_MS = 3 * 60_000;
const TERMINAL_POD = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED", "FAILED"]);
const TERMINAL_WORKER = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED", "FAILED"]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unique = (values) => [...new Set(list(values).map(text).filter(Boolean))];
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function redact(value) {
  return text(value)
    .slice(0, 2500)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${code}_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${code}_RC:${result.status}:${redact(result.stderr || result.stdout)}`);
  return text(result.stdout);
}

function sourceGate() {
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const originMain = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_MAIN_FAILED`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_HEAD_FAILED`);
  if (head !== originMain) throw new Error(`${CONTRACT}_HEAD_NOT_NEWEST_MAIN:${head}:${originMain}`);
  const dirty = shell("git", ["status", "--porcelain", "--untracked-files=no"], `${CONTRACT}_STATUS_FAILED`);
  if (dirty) throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);
  return head;
}

async function readJsonResponse(response, code, { allow404 = false } = {}) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (allow404 && response.status === 404) return { __not_found: true };
  if (!response.ok) throw new Error(`${code}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  if (body === null) throw new Error(`${code}_INVALID_JSON`);
  return body;
}

async function restGet(pathname, key, { allow404 = false, timeoutMs = 30_000 } = {}) {
  const response = await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return readJsonResponse(response, `${CONTRACT}_REST_GET`, { allow404 });
}

async function restDelete(pathname, key) {
  const response = await fetch(`${REST}${pathname}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404 || response.status === 204) return { success: true, status: response.status };
  return readJsonResponse(response, `${CONTRACT}_REST_DELETE`);
}

async function queueHealth(endpointId, key) {
  const response = await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  return readJsonResponse(response, `${CONTRACT}_SERVERLESS_HEALTH`);
}

function endpointList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.endpoints || raw?.data || raw?.items || raw?.results);
}
function podList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.pods || raw?.data || raw?.items || raw?.results);
}
function templateList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.templates || raw?.data || raw?.items || raw?.results);
}
function activeWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    if (worker?.isStale === true) return false;
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    if (desired) return !TERMINAL_WORKER.has(desired);
    if (status) return !TERMINAL_WORKER.has(status);
    return false;
  });
}
function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: finite(workers.idle, 0), initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0), running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0), unhealthy: finite(workers.unhealthy, 0),
    },
  };
}
function activePod(pod = {}) {
  const desired = text(pod?.desiredStatus ?? pod?.desired_status).toUpperCase();
  const status = text(pod?.status ?? pod?.runtimeStatus).toUpperCase();
  if (desired) return !TERMINAL_POD.has(desired);
  if (status) return !TERMINAL_POD.has(status);
  return true;
}
function templateId(endpoint = {}) {
  return text(endpoint?.templateId || endpoint?.template?.id);
}
function envObject(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => key));
  }
  return { ...object(value) };
}
function safeTemplateSummary(template = {}) {
  return {
    id_present: Boolean(text(template.id)), image_name_present: Boolean(text(template.imageName)),
    image_name: text(template.imageName) || null, container_disk_gb: finite(template.containerDiskInGb),
    volume_gb: finite(template.volumeInGb), volume_mount_path: text(template.volumeMountPath) || null,
    registry_auth_present: Boolean(text(template.containerRegistryAuthId)),
    env_keys: Object.keys(envObject(template.env)).sort(), env_values_printed: false,
  };
}
function podStartCommand() {
  return [
    "exec python3 -m vllm.entrypoints.openai.api_server",
    `--model ${FAST_MODEL}`,
    `--served-model-name ${FAST_MODEL}`,
    "--host 0.0.0.0",
    `--port ${POD_PORT}`,
    "--trust-remote-code",
    "--enable-auto-tool-choice",
    "--tool-call-parser hermes",
  ].join(" ");
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const repositoryHead = sourceGate();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey) throw new Error(`${CONTRACT}_MANAGEMENT_CREDENTIAL_REQUIRED`);
if (!runtimeKey) throw new Error(`${CONTRACT}_FAST_RUNTIME_CREDENTIAL_REQUIRED`);

let endpoint = null;
let template = null;
let endpointId = "";
let ownedPodName = "";
let createdPodId = "";
let podCreatePerformed = false;
let podDeletePerformed = false;
let podDeleteVerified = false;
let modelRoutePerformed = false;
let modelRoutePassed = false;
let cleanupStarted = false;
let signalCleanupStarted = false;

async function ownedPods() {
  if (!ownedPodName) return [];
  const raw = await restGet("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey);
  return podList(raw).filter((pod) => text(pod?.name) === ownedPodName);
}
async function cleanupOwnedPod() {
  if (cleanupStarted || !ownedPodName) return;
  cleanupStarted = true;
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    let matches = [];
    try { matches = await ownedPods(); }
    catch (error) { lastError = error; await sleep(2_000); continue; }
    if (!matches.length) { podDeleteVerified = true; return; }
    for (const pod of matches) {
      const id = text(pod?.id);
      if (!id) continue;
      try { await restDelete(`/pods/${encodeURIComponent(id)}`, managementKey); podDeletePerformed = true; }
      catch (error) { lastError = error; }
    }
    await sleep(3_000);
  }
  const remaining = await ownedPods().catch(() => []);
  if (!remaining.length) { podDeleteVerified = true; return; }
  throw new Error(`${CONTRACT}_POD_DELETE_NOT_VERIFIED:${remaining.length}:${redact(lastError?.message)}`);
}
async function signalCleanup(signal) {
  if (signalCleanupStarted) return;
  signalCleanupStarted = true;
  console.error(`${CONTRACT}_SIGNAL=${signal}`);
  try { await cleanupOwnedPod(); } catch (error) { console.error(`${CONTRACT}_SIGNAL_CLEANUP_ERROR=${redact(error?.message)}`); }
  process.exitCode = signal === "SIGINT" ? 130 : 143;
}
process.on("SIGINT", () => { void signalCleanup("SIGINT"); });
process.on("SIGTERM", () => { void signalCleanup("SIGTERM"); });

async function resolveFastRuntime() {
  const [endpointsRaw, templatesRaw] = await Promise.all([
    restGet("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    restGet("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  ]);
  const matches = endpointList(endpointsRaw).filter((row) => text(row?.name) === FAST_ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_FAST_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  endpoint = matches[0];
  endpointId = text(endpoint?.id);
  if (!endpointId) throw new Error(`${CONTRACT}_FAST_ENDPOINT_ID_REQUIRED`);
  const id = templateId(endpoint);
  template = templateList(templatesRaw).find((row) => text(row?.id) === id) || endpoint?.template || null;
  if (!id || !template) throw new Error(`${CONTRACT}_FAST_BOUND_TEMPLATE_REQUIRED`);
  if (!text(template?.imageName)) throw new Error(`${CONTRACT}_FAST_TEMPLATE_IMAGE_REQUIRED`);
}

async function assertSafeBaseline(stage) {
  await resolveFastRuntime();
  const [healthRaw, podsRaw] = await Promise.all([
    queueHealth(endpointId, runtimeKey),
    restGet("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey),
  ]);
  const health = healthCounters(healthRaw);
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) throw new Error(`${CONTRACT}_${stage}_SERVERLESS_NOT_0_0`);
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) throw new Error(`${CONTRACT}_${stage}_SERVERLESS_QUEUE_NOT_EMPTY:${health.jobs.in_queue}:${health.jobs.in_progress}`);
  if (Object.values(health.workers).some((value) => finite(value, 0) !== 0) || activeWorkers(endpoint).length !== 0) throw new Error(`${CONTRACT}_${stage}_SERVERLESS_WORKER_PRESENT`);
  const conflicting = podList(podsRaw).filter((pod) => {
    if (!activePod(pod)) return false;
    const name = text(pod?.name).toLowerCase();
    if (ownedPodName && text(pod?.name) === ownedPodName) return false;
    return name.includes("avantiqo-intelligence") || name.includes("intelligence-fast") || name.includes("intelligence-deep");
  });
  if (conflicting.length) throw new Error(`${CONTRACT}_${stage}_FOREIGN_INTELLIGENCE_POD_ACTIVE:${conflicting.map((pod) => text(pod?.name || pod?.id)).join(",")}`);
  const gpuTypeIds = unique(endpoint?.gpuTypeIds);
  if (!gpuTypeIds.length || gpuTypeIds.length > 3) throw new Error(`${CONTRACT}_${stage}_FAST_GPU_POOL_INVALID:${gpuTypeIds.length}`);
  return { health, gpuTypeIds };
}

async function createPod(gpuTypeIds) {
  const mergedEnv = {
    ...envObject(template?.env),
    MODEL_NAME: FAST_MODEL,
    SERVED_MODEL_NAME: FAST_MODEL,
    ENABLE_AUTO_TOOL_CHOICE: "true",
    TOOL_CALL_PARSER: "hermes",
  };
  delete mergedEnv.REASONING_PARSER;
  delete mergedEnv.RUNPOD_ENDPOINT_ID;
  delete mergedEnv.RUNPOD_AI_API_ID;
  delete mergedEnv.RUNPOD_POD_ID;
  const body = {
    name: ownedPodName,
    templateId: templateId(endpoint),
    cloudType: "SECURE",
    computeType: "GPU",
    gpuCount: 1,
    gpuTypeIds,
    gpuTypePriority: "availability",
    allowedCudaVersions: unique(endpoint?.allowedCudaVersions),
    containerDiskInGb: Math.max(50, finite(template?.containerDiskInGb, 50)),
    dockerEntrypoint: ["bash", "-lc"],
    dockerStartCmd: [podStartCommand()],
    env: mergedEnv,
    ports: [`${POD_PORT}/http`],
    supportPublicIp: true,
    interruptible: false,
    locked: false,
    volumeInGb: Math.max(20, finite(template?.volumeInGb, 20)),
    volumeMountPath: text(template?.volumeMountPath) || "/workspace",
  };
  if (text(template?.containerRegistryAuthId)) body.containerRegistryAuthId = text(template.containerRegistryAuthId);
  const response = await fetch(`${REST}/pods`, {
    method: "POST",
    headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const parsed = await readJsonResponse(response, `${CONTRACT}_POD_CREATE`);
  podCreatePerformed = true;
  const id = text(parsed?.id);
  if (!id) {
    const discovered = await ownedPods();
    if (discovered.length !== 1 || !text(discovered[0]?.id)) throw new Error(`${CONTRACT}_CREATED_POD_ID_REQUIRED`);
    return discovered[0];
  }
  return parsed;
}

async function waitForRunningPod(podId) {
  const deadline = Date.now() + POD_START_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    const pod = await restGet(`/pods/${encodeURIComponent(podId)}?includeMachine=true&includeNetworkVolume=true`, managementKey, { allow404: true });
    if (pod?.__not_found) throw new Error(`${CONTRACT}_POD_DISAPPEARED_DURING_START`);
    last = pod;
    const desired = text(pod?.desiredStatus ?? pod?.desired_status).toUpperCase();
    const status = text(pod?.status ?? pod?.runtimeStatus).toUpperCase();
    console.log(JSON.stringify({ event: "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_PROGRESS", phase: "POD_START", desired_status: desired || null, runtime_status: status || null, machine_assigned: Boolean(text(pod?.machineId || pod?.machine?.id)), cost_per_hour_present: finite(pod?.costPerHr ?? pod?.machine?.costPerHr, null) !== null, pod_id_printed: false, secrets_printed: false }));
    if (TERMINAL_POD.has(desired) || TERMINAL_POD.has(status)) throw new Error(`${CONTRACT}_POD_TERMINAL_BEFORE_MODEL_ROUTE:${desired || status}`);
    if ((desired === "RUNNING" || status === "RUNNING") && text(pod?.machineId || pod?.machine?.id)) return pod;
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_POD_START_TIMEOUT:${text(last?.desiredStatus || last?.status)}`);
}

async function waitForModels(podId) {
  const url = `https://${podId}-${POD_PORT}.proxy.runpod.net/v1/models`;
  const deadline = Date.now() + MODEL_ROUTE_TIMEOUT_MS;
  let last = "";
  while (Date.now() < deadline) {
    try {
      modelRoutePerformed = true;
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      const raw = await response.text();
      last = `http=${response.status}:${raw.slice(0, 300)}`;
      if (response.ok) {
        let body = null;
        try { body = JSON.parse(raw); } catch { body = null; }
        const ids = list(body?.data).map((row) => text(row?.id)).filter(Boolean);
        if (ids.includes(FAST_MODEL)) {
          modelRoutePassed = true;
          return { model_ids: ids, expected_model_served: true };
        }
        if (body !== null) last = `expected_model_missing:${ids.join(",")}`;
      }
    } catch (error) { last = redact(error?.message); }
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_MODEL_ROUTE_TIMEOUT:${redact(last)}`);
}

const initial = await assertSafeBaseline("PRECHECK");
ownedPodName = `avantiqo-intelligence-fast-proof-${randomBytes(6).toString("hex")}`;
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  repository_head: repositoryHead,
  endpoint_name: FAST_ENDPOINT_NAME,
  expected_model: FAST_MODEL,
  serverless_resting_0_0: true,
  serverless_queue_empty: true,
  foreign_intelligence_pod_active: false,
  gpu_type_ids: initial.gpuTypeIds,
  template: safeTemplateSummary(template),
  pod_runtime: { image_source: "BOUND_FAST_TEMPLATE_IMAGE", explicit_vllm_startup_override: true, exposed_http_port: POD_PORT, only_runtime_route: "/v1/models", chat_completion_submitted: false, token_generation_performed: false },
  pod_created: false,
  inference_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  console.log(`${CONTRACT}=PLAN_READY`);
} else {
  let failure = null;
  let models = null;
  let runningPod = null;
  try {
    const created = await createPod(initial.gpuTypeIds);
    createdPodId = text(created?.id) || text((await ownedPods())[0]?.id);
    if (!createdPodId) throw new Error(`${CONTRACT}_CREATED_POD_ID_REQUIRED`);
    runningPod = await waitForRunningPod(createdPodId);
    models = await waitForModels(createdPodId);
  } catch (error) {
    failure = error;
  } finally {
    try { await cleanupOwnedPod(); } catch (error) { if (!failure) failure = error; }
  }
  let finalBaseline = null;
  try { finalBaseline = await assertSafeBaseline("POSTCHECK"); } catch (error) { if (!failure) failure = error; }
  const success = !failure && modelRoutePassed && podDeleteVerified && finalBaseline;
  const result = {
    success: Boolean(success), contract: CONTRACT, mode: "APPLY", repository_head: repositoryHead,
    endpoint_name: FAST_ENDPOINT_NAME, expected_model: FAST_MODEL, pod_created: podCreatePerformed,
    pod_machine_assigned: Boolean(text(runningPod?.machineId || runningPod?.machine?.id)), pod_id_printed: false,
    model_route_performed: modelRoutePerformed, model_route: "/v1/models", model_route_passed: modelRoutePassed,
    expected_model_served: models?.expected_model_served === true, returned_model_count: list(models?.model_ids).length,
    completion_request_performed: false, chat_completion_submitted: false, token_generation_performed: false,
    inference_performed: false, wallet_mutation_performed: false, database_mutation_performed: false,
    serverless_workers_max_mutated: false, pod_delete_performed: podDeletePerformed, pod_delete_verified: podDeleteVerified,
    final_serverless_resting_0_0: Boolean(finalBaseline), final_serverless_queue_empty: Boolean(finalBaseline),
    production_deploy_performed: false, secrets_printed: false, failure: failure ? redact(failure?.message) : null,
  };
  console.log(JSON.stringify(result, null, 2));
  console.log(`${CONTRACT}=${result.success ? "PASS" : "FAIL"}`);
  if (!result.success) process.exitCode = 1;
}
