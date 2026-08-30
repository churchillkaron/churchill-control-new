import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V2";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V2_APPROVED";
const SELF_PATH = "scripts/run-avantiqo-intelligence-fast-ephemeral-pod-models-proof-v2-local.mjs";
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const NETWORK_VOLUME_ID = "7obluigbr0";
const NETWORK_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const DATA_CENTER_ID = "US-CA-2";
const CACHE_ROOT = "/workspace/intelligence-fast-hf";
const POD_PORT = 8000;
const POLL_MS = 5000;
const POD_START_TIMEOUT_MS = 8 * 60_000;
const MODEL_ROUTE_TIMEOUT_MS = 8 * 60_000;
const CLEANUP_TIMEOUT_MS = 3 * 60_000;
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED", "FAILED"]);

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const finite = (v, f = null) => Number.isFinite(Number(v)) ? Number(v) : f;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unique = (xs) => [...new Set(list(xs).map(text).filter(Boolean))];
const yes = (v) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(v).toUpperCase());

function redact(v) {
  return text(v).slice(0, 2500)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const r = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${code}:${r.status}:${redact(r.stderr || r.stdout)}`);
  return text(r.stdout);
}

function sourceGate() {
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_FETCH_FAILED`);
  const origin = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_FAILED`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_HEAD_FAILED`);
  const dirty = shell("git", ["status", "--porcelain", "--untracked-files=no"], `${CONTRACT}_STATUS_FAILED`);
  if (dirty) throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);

  if (head !== origin) {
    shell("git", ["merge-base", "--is-ancestor", head, origin], `${CONTRACT}_PINNED_HEAD_NOT_ANCESTOR_OF_MAIN`);
    const changed = shell("git", ["diff", "--name-only", `${head}..${origin}`, "--", SELF_PATH], `${CONTRACT}_SELF_DIFF_FAILED`);
    if (changed) throw new Error(`${CONTRACT}_PROOF_CHANGED_ON_NEWEST_MAIN:${head}:${origin}`);
    console.log(JSON.stringify({
      event: "AVANTIQO_INTELLIGENCE_FAST_POD_SOURCE_GATE",
      pinned_head: head,
      newest_main: origin,
      newest_main_advanced: true,
      proof_file_unchanged: true,
      unrelated_parallel_commits_allowed: true,
      secrets_printed: false,
    }));
  }

  return head;
}

async function readJson(response, code, { allow404 = false } = {}) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (allow404 && response.status === 404) return { __not_found: true };
  if (!response.ok) throw new Error(`${code}_HTTP_${response.status}:${redact(body?.message || body?.error || raw)}`);
  return body ?? {};
}

async function rest(path, key, options = {}) {
  const response = await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  return readJson(response, `${CONTRACT}_REST`, { allow404: options.allow404 === true });
}

async function health(endpointId, key) {
  const response = await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  return readJson(response, `${CONTRACT}_HEALTH`);
}

const endpointRows = (v) => Array.isArray(v) ? v : list(v?.endpoints || v?.data || v?.items || v?.results);
const templateRows = (v) => Array.isArray(v) ? v : list(v?.templates || v?.data || v?.items || v?.results);
const podRows = (v) => Array.isArray(v) ? v : list(v?.pods || v?.data || v?.items || v?.results);
const volumeRows = (v) => Array.isArray(v) ? v : list(v?.data || v?.items || v?.results);
const envObject = (v) => Array.isArray(v) ? Object.fromEntries(v.map((e) => [text(e?.key || e?.name), String(e?.value ?? "")]).filter(([k]) => k)) : { ...object(v) };
const templateId = (e) => text(e?.templateId || e?.template?.id);
const podVolumeId = (p) => text(p?.networkVolume?.id || p?.networkVolumeId);

function activeStatus(row = {}) {
  const desired = text(row?.desiredStatus ?? row?.desired_status).toUpperCase();
  const status = text(row?.status ?? row?.runtimeStatus ?? row?.workerStatus).toUpperCase();
  if (desired) return !TERMINAL.has(desired);
  if (status) return !TERMINAL.has(status);
  return true;
}

function counters(body = {}) {
  const j = object(body.jobs), w = object(body.workers);
  return {
    jobs: { in_queue: finite(j.inQueue ?? j.in_queue, 0), in_progress: finite(j.inProgress ?? j.in_progress, 0) },
    workers: { idle: finite(w.idle, 0), initializing: finite(w.initializing, 0), ready: finite(w.ready, 0), running: finite(w.running, 0), throttled: finite(w.throttled, 0), unhealthy: finite(w.unhealthy, 0) },
  };
}

function podStartCommand() {
  return [
    `mkdir -p ${CACHE_ROOT}`,
    `export HF_HOME=${CACHE_ROOT}`,
    `export HUGGINGFACE_HUB_CACHE=${CACHE_ROOT}/hub`,
    "exec python3 -m vllm.entrypoints.openai.api_server",
    `--model ${FAST_MODEL}`,
    `--served-model-name ${FAST_MODEL}`,
    "--host 0.0.0.0",
    `--port ${POD_PORT}`,
    "--trust-remote-code",
    "--enable-auto-tool-choice",
    "--tool-call-parser hermes",
  ].join(" && ");
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const repoHead = sourceGate();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !runtimeKey) throw new Error(`${CONTRACT}_CREDENTIAL_REQUIRED`);

let endpoint = null;
let template = null;
let endpointId = "";
let ownedPodName = "";
let createdPodId = "";
let deletePerformed = false;
let deleteVerified = false;
let modelRoutePassed = false;
let interrupted = false;
const abortController = new AbortController();

async function resolveRuntime() {
  const [eraw, traw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  ]);
  const matches = endpointRows(eraw).filter((e) => text(e?.name) === FAST_ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_FAST_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  endpoint = matches[0]; endpointId = text(endpoint?.id);
  const id = templateId(endpoint);
  template = templateRows(traw).find((t) => text(t?.id) === id) || endpoint?.template || null;
  if (!endpointId || !id || !text(template?.imageName)) throw new Error(`${CONTRACT}_FAST_TEMPLATE_REQUIRED`);
}

async function baseline(stage) {
  await resolveRuntime();
  const [hraw, praw, vraw, allEndpoints] = await Promise.all([
    health(endpointId, runtimeKey),
    rest("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey),
    rest("/networkvolumes", managementKey),
    rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
  ]);
  const c = counters(hraw);
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) throw new Error(`${CONTRACT}_${stage}_FAST_SERVERLESS_NOT_0_0`);
  if (c.jobs.in_queue || c.jobs.in_progress || Object.values(c.workers).some((v) => v !== 0)) throw new Error(`${CONTRACT}_${stage}_FAST_SERVERLESS_BUSY`);
  const volume = volumeRows(vraw).find((v) => text(v?.id) === NETWORK_VOLUME_ID);
  if (!volume || text(volume?.name) !== NETWORK_VOLUME_NAME || text(volume?.dataCenterId ?? volume?.data_center_id) !== DATA_CENTER_ID) throw new Error(`${CONTRACT}_${stage}_SHARED_VOLUME_CONTRACT_MISMATCH`);
  const conflictingPods = podRows(praw).filter((p) => activeStatus(p) && podVolumeId(p) === NETWORK_VOLUME_ID && (!ownedPodName || text(p?.name) !== ownedPodName));
  if (conflictingPods.length) throw new Error(`${CONTRACT}_${stage}_SHARED_VOLUME_FOREIGN_POD_ACTIVE:${conflictingPods.map((p) => text(p?.name || p?.id)).join(",")}`);
  const conflictingEndpoints = endpointRows(allEndpoints).filter((e) => {
    const ids = unique([e?.networkVolumeId, ...list(e?.networkVolumeIds).map((x) => typeof x === "string" ? x : x?.networkVolumeId)]);
    return ids.includes(NETWORK_VOLUME_ID) && list(e?.workers).some(activeStatus);
  });
  if (conflictingEndpoints.length) throw new Error(`${CONTRACT}_${stage}_SHARED_VOLUME_ENDPOINT_ACTIVE:${conflictingEndpoints.map((e) => text(e?.name || e?.id)).join(",")}`);
  const gpuTypeIds = unique(endpoint?.gpuTypeIds).filter((id) => /H100|H200|B200|RTX PRO 6000 Blackwell Server Edition/i.test(id));
  if (!gpuTypeIds.length) throw new Error(`${CONTRACT}_${stage}_NO_COMPATIBLE_GPU_TYPES`);
  return { gpuTypeIds, volumeSizeGb: finite(volume?.size ?? volume?.sizeGb) };
}

async function ownedPods() {
  if (!ownedPodName) return [];
  const raw = await rest("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey);
  return podRows(raw).filter((p) => text(p?.name) === ownedPodName);
}

async function cleanup() {
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const matches = await ownedPods().catch(() => []);
    if (!matches.length) { deleteVerified = true; return; }
    for (const p of matches) {
      const id = text(p?.id); if (!id) continue;
      try { await rest(`/pods/${encodeURIComponent(id)}`, managementKey, { method: "DELETE" }); deletePerformed = true; } catch {}
    }
    await sleep(3000);
  }
  const left = await ownedPods().catch(() => []);
  if (!left.length) { deleteVerified = true; return; }
  throw new Error(`${CONTRACT}_POD_DELETE_NOT_VERIFIED:${left.length}`);
}

async function interrupt(signal) {
  if (interrupted) return;
  interrupted = true;
  abortController.abort(new Error(signal));
  console.error(`${CONTRACT}_INTERRUPT=${signal}`);
  try { await cleanup(); } catch (e) { console.error(`${CONTRACT}_INTERRUPT_CLEANUP_ERROR=${redact(e?.message)}`); }
  process.exitCode = signal === "SIGINT" ? 130 : 143;
}
process.on("SIGINT", () => { void interrupt("SIGINT"); });
process.on("SIGTERM", () => { void interrupt("SIGTERM"); });

async function createPod(gpuTypeIds) {
  const env = { ...envObject(template?.env), MODEL_NAME: FAST_MODEL, SERVED_MODEL_NAME: FAST_MODEL, HF_HOME: CACHE_ROOT, HUGGINGFACE_HUB_CACHE: `${CACHE_ROOT}/hub`, ENABLE_AUTO_TOOL_CHOICE: "true", TOOL_CALL_PARSER: "hermes" };
  delete env.REASONING_PARSER;
  const body = {
    name: ownedPodName, templateId: templateId(endpoint), cloudType: "SECURE", computeType: "GPU", gpuCount: 1,
    gpuTypeIds, gpuTypePriority: "availability", allowedCudaVersions: unique(endpoint?.allowedCudaVersions),
    dataCenterIds: [DATA_CENTER_ID], dataCenterPriority: "availability",
    containerDiskInGb: Math.max(50, finite(template?.containerDiskInGb, 50)),
    dockerEntrypoint: ["bash", "-lc"], dockerStartCmd: [podStartCommand()], env,
    ports: [`${POD_PORT}/http`], supportPublicIp: true, interruptible: false, locked: false,
    networkVolumeId: NETWORK_VOLUME_ID, volumeMountPath: "/workspace",
  };
  if (text(template?.containerRegistryAuthId)) body.containerRegistryAuthId = text(template.containerRegistryAuthId);
  const created = await rest("/pods", managementKey, { method: "POST", body, timeoutMs: 60000 });
  const id = text(created?.id) || text((await ownedPods())[0]?.id);
  if (!id) throw new Error(`${CONTRACT}_CREATED_POD_ID_REQUIRED`);
  return id;
}

async function waitRunning(podId) {
  const deadline = Date.now() + POD_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error(`${CONTRACT}_INTERRUPTED`);
    const p = await rest(`/pods/${encodeURIComponent(podId)}?includeMachine=true&includeNetworkVolume=true`, managementKey, { allow404: true });
    if (p?.__not_found) throw new Error(`${CONTRACT}_POD_DISAPPEARED`);
    const desired = text(p?.desiredStatus).toUpperCase(), status = text(p?.status ?? p?.runtimeStatus).toUpperCase();
    console.log(JSON.stringify({ event: "AVANTIQO_INTELLIGENCE_FAST_POD_PROGRESS", phase: "POD_START", desired_status: desired || null, runtime_status: status || null, machine_assigned: Boolean(text(p?.machineId || p?.machine?.id)), cost_per_hour_present: finite(p?.costPerHr ?? p?.machine?.costPerHr, null) !== null }));
    if (TERMINAL.has(desired) || TERMINAL.has(status)) throw new Error(`${CONTRACT}_POD_TERMINAL:${desired || status}`);
    if ((desired === "RUNNING" || status === "RUNNING") && text(p?.machineId || p?.machine?.id)) return p;
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_POD_START_TIMEOUT`);
}

async function waitModels(podId) {
  const url = `https://${podId}-${POD_PORT}.proxy.runpod.net/v1/models`;
  const deadline = Date.now() + MODEL_ROUTE_TIMEOUT_MS;
  let attempt = 0, last = "";
  while (Date.now() < deadline) {
    if (interrupted) throw new Error(`${CONTRACT}_INTERRUPTED`);
    attempt += 1;
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.any([abortController.signal, AbortSignal.timeout(15000)]) });
      const raw = await response.text();
      last = `http=${response.status}:${raw.slice(0, 180)}`;
      if (response.ok) {
        const body = JSON.parse(raw);
        const ids = list(body?.data).map((r) => text(r?.id)).filter(Boolean);
        if (ids.includes(FAST_MODEL)) { modelRoutePassed = true; return ids; }
        last = `expected_model_missing:${ids.join(",")}`;
      }
    } catch (e) { last = redact(e?.message); }
    console.log(JSON.stringify({ event: "AVANTIQO_INTELLIGENCE_FAST_POD_PROGRESS", phase: "MODEL_ROUTE_WAIT", attempt, elapsed_seconds: Math.floor((MODEL_ROUTE_TIMEOUT_MS - Math.max(0, deadline - Date.now())) / 1000), last_status: last.slice(0, 220), secrets_printed: false }));
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_MODEL_ROUTE_TIMEOUT:${last}`);
}

const initial = await baseline("PRECHECK");
ownedPodName = `avantiqo-intelligence-fast-v2-${randomBytes(6).toString("hex")}`;

if (!apply) {
  console.log(JSON.stringify({ success: true, contract: CONTRACT, mode: "PLAN", repository_head: repoHead, endpoint_name: FAST_ENDPOINT_NAME, expected_model: FAST_MODEL, shared_cache: { id: NETWORK_VOLUME_ID, name: NETWORK_VOLUME_NAME, data_center_id: DATA_CENTER_ID, size_gb: initial.volumeSizeGb, dedicated_fast_cache_path: CACHE_ROOT, idle_verified: true }, gpu_type_ids: initial.gpuTypeIds, paid_startup_deadline_seconds: MODEL_ROUTE_TIMEOUT_MS / 1000, pod_created: false, inference_performed: false, production_deploy_performed: false, secrets_printed: false }, null, 2));
  console.log(`${CONTRACT}=PLAN_READY`);
} else {
  let failure = null; let running = null; let ids = [];
  try { createdPodId = await createPod(initial.gpuTypeIds); running = await waitRunning(createdPodId); ids = await waitModels(createdPodId); }
  catch (e) { failure = e; }
  finally { try { await cleanup(); } catch (e) { if (!failure) failure = e; } }
  let finalBaseline = null;
  try { finalBaseline = await baseline("POSTCHECK"); } catch (e) { if (!failure) failure = e; }
  const success = !failure && modelRoutePassed && deleteVerified && Boolean(finalBaseline);
  console.log(JSON.stringify({ success, contract: CONTRACT, mode: "APPLY", repository_head: repoHead, endpoint_name: FAST_ENDPOINT_NAME, expected_model: FAST_MODEL, pod_machine_assigned: Boolean(text(running?.machineId || running?.machine?.id)), model_route_passed: modelRoutePassed, expected_model_served: ids.includes(FAST_MODEL), returned_model_count: ids.length, shared_cache_attached: true, dedicated_fast_cache_path: CACHE_ROOT, pod_delete_performed: deletePerformed, pod_delete_verified: deleteVerified, final_serverless_resting_0_0: Boolean(finalBaseline), completion_request_performed: false, token_generation_performed: false, inference_performed: false, production_deploy_performed: false, secrets_printed: false, failure: failure ? redact(failure?.message) : null }, null, 2));
  console.log(`${CONTRACT}=${success ? "PASS" : "FAIL"}`);
  if (!success) process.exitCode = 1;
}