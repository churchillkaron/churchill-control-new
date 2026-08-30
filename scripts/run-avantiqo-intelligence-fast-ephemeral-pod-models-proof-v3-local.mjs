import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V3";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V3_APPROVED";
const SOURCE_PATH = "scripts/run-avantiqo-intelligence-fast-ephemeral-pod-models-proof-v3-local.mjs";
const REST = "https://rest.runpod.io/v1";
const GRAPHQL = "https://api.runpod.io/graphql";
const SERVERLESS = "https://api.runpod.ai/v2";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const NETWORK_VOLUME_ID = "7obluigbr0";
const NETWORK_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const DATA_CENTER_ID = "US-CA-2";
const CACHE_ROOT = "/workspace/intelligence-fast-hf";
const VLLM_CACHE_ROOT = "/workspace/intelligence-fast-vllm-cache";
const STARTUP_LOG = "/workspace/intelligence-fast-vllm-startup.log";
const STATUS_PORT = 7999;
const VLLM_PORT = 8000;
const MAX_MODEL_LEN = 32768;
const GPU_MEMORY_UTILIZATION = 0.90;
const POLL_MS = 5000;
const RUNTIME_TELEMETRY_TIMEOUT_MS = 3 * 60_000;
const STATUS_ROUTE_TIMEOUT_MS = 30_000;
const MODEL_ROUTE_TIMEOUT_MS = 7 * 60_000;
const CLEANUP_TIMEOUT_MS = 3 * 60_000;
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED", "FAILED"]);
const FATAL_STARTUP = /(ModuleNotFoundError|No module named|unrecognized arguments|CUDA out of memory|OutOfMemoryError|Traceback \(most recent call last\)|RuntimeError:|ValueError:.*(?:memory|model|dtype|quant|context|cuda))/i;

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unique = (xs) => [...new Set(list(xs).map(text).filter(Boolean))];
const yes = (v) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(v).toUpperCase());

function redact(v) {
  return text(v).slice(0, 3000)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/\bhf_[A-Za-z0-9]{8,}\b/g, "hf_[REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code, { allowFailure = false } = {}) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (allowFailure) return result;
  if (result.signal) throw new Error(`${code}_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${code}_RC:${result.status}:${redact(result.stderr || result.stdout)}`);
  return text(result.stdout);
}

function sourceGate() {
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_FETCH_FAILED`);
  const origin = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_FAILED`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_HEAD_FAILED`);
  const dirty = shell("git", ["status", "--porcelain", "--untracked-files=no"], `${CONTRACT}_STATUS_FAILED`);
  if (dirty) throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);

  if (head !== origin) {
    const ancestor = shell("git", ["merge-base", "--is-ancestor", head, origin], `${CONTRACT}_ANCESTOR_CHECK`, { allowFailure: true });
    if (ancestor.status !== 0) throw new Error(`${CONTRACT}_PINNED_HEAD_NOT_ANCESTOR_OF_NEWEST_MAIN:${head}:${origin}`);
    const changed = shell("git", ["diff", "--name-only", `${head}..${origin}`, "--", SOURCE_PATH], `${CONTRACT}_PROOF_DIFF_FAILED`);
    if (text(changed)) throw new Error(`${CONTRACT}_PROOF_FILE_CHANGED_ON_NEWEST_MAIN:${head}:${origin}`);
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_INTELLIGENCE_FAST_POD_SOURCE_GATE",
    pinned_head: head,
    newest_main: origin,
    newest_main_advanced: head !== origin,
    proof_file_unchanged: true,
    unrelated_parallel_commits_allowed: true,
    secrets_printed: false,
  }));
  return head;
}

async function readJson(response, code, { allow404 = false } = {}) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (allow404 && response.status === 404) return { __not_found: true };
  if (!response.ok) throw new Error(`${code}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  return body ?? {};
}

async function rest(path, key, options = {}) {
  const response = await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  return readJson(response, `${CONTRACT}_REST`, { allow404: options.allow404 === true });
}

async function graphql(query, key) {
  const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${CONTRACT}_GRAPHQL_HTTP_${response.status}:${redact(raw)}`);
  if (list(body?.errors).length) {
    throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${redact(list(body.errors).map((entry) => entry?.message).filter(Boolean).join(" | "))}`);
  }
  return object(body?.data);
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
const envObject = (v) => Array.isArray(v)
  ? Object.fromEntries(v.map((e) => [text(e?.key || e?.name), String(e?.value ?? "")]).filter(([k]) => k))
  : { ...object(v) };
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
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function statusServerSource() {
  return `import http.server\nimport json\nimport os\nimport re\nimport shutil\nimport socket\nimport socketserver\nimport time\n\nSTART=time.time()\nROOT=os.environ.get("HF_HOME", "${CACHE_ROOT}")\nLOG=os.environ.get("AVANTIQO_FAST_STARTUP_LOG", "${STARTUP_LOG}")\n\ndef cache_stats():\n    total=0\n    files=0\n    try:\n        for base, _, names in os.walk(ROOT):\n            for name in names:\n                try:\n                    total += os.path.getsize(os.path.join(base, name))\n                    files += 1\n                except OSError:\n                    pass\n    except Exception:\n        pass\n    return total, files\n\ndef port_open(port):\n    s=socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n    s.settimeout(0.2)\n    try:\n        return s.connect_ex(("127.0.0.1", port)) == 0\n    finally:\n        s.close()\n\ndef safe_tail():\n    try:\n        with open(LOG, "rb") as f:\n            f.seek(0, 2)\n            size=f.tell()\n            f.seek(max(0, size-5000))\n            value=f.read().decode("utf-8", "replace")[-2400:]\n    except Exception:\n        value=""\n    value=re.sub(r"Bearer\\s+[A-Za-z0-9._~+\\/-]{8,}", "Bearer [REDACTED]", value, flags=re.I)\n    value=re.sub(r"\\bhf_[A-Za-z0-9]{8,}\\b", "hf_[REDACTED]", value)\n    value=re.sub(r"((?:api[_-]?key|token|password|secret|authorization)\\s*[=:]\\s*)[^\\s,;]+", r"\\1[REDACTED]", value, flags=re.I)\n    return value\n\nclass Handler(http.server.BaseHTTPRequestHandler):\n    def do_GET(self):\n        total, files=cache_stats()\n        try:\n            usage=shutil.disk_usage("/workspace")\n            free_gb=round(usage.free/(1024**3), 3)\n            total_gb=round(usage.total/(1024**3), 3)\n        except Exception:\n            free_gb=None\n            total_gb=None\n        body=json.dumps({\n            "ok": True,\n            "uptime_seconds": int(time.time()-START),\n            "cache_bytes": total,\n            "cache_gb": round(total/(1024**3), 3),\n            "cache_files": files,\n            "workspace_free_gb": free_gb,\n            "workspace_total_gb": total_gb,\n            "vllm_port_open": port_open(${VLLM_PORT}),\n            "startup_log_tail": safe_tail(),\n            "secrets_printed": False,\n        }).encode("utf-8")\n        self.send_response(200)\n        self.send_header("Content-Type", "application/json")\n        self.send_header("Content-Length", str(len(body)))\n        self.end_headers()\n        self.wfile.write(body)\n    def log_message(self, *args):\n        return\n\nsocketserver.TCPServer.allow_reuse_address=True\nwith socketserver.TCPServer(("0.0.0.0", ${STATUS_PORT}), Handler) as server:\n    server.serve_forever()\n`;
}

function podStartCommand() {
  const statusB64 = Buffer.from(statusServerSource(), "utf8").toString("base64");
  return [
    `mkdir -p ${CACHE_ROOT} ${VLLM_CACHE_ROOT}`,
    `export HF_HOME=${CACHE_ROOT}`,
    `export HUGGINGFACE_HUB_CACHE=${CACHE_ROOT}/hub`,
    `export VLLM_CACHE_ROOT=${VLLM_CACHE_ROOT}`,
    `export SAFETENSORS_LOAD_STRATEGY=prefetch`,
    `export AVANTIQO_FAST_STARTUP_LOG=${STARTUP_LOG}`,
    `printf '%s' '${statusB64}' | base64 -d > /tmp/avantiqo-fast-status.py`,
    `: > ${STARTUP_LOG}`,
    `python3 /tmp/avantiqo-fast-status.py >/tmp/avantiqo-fast-status.stdout 2>/tmp/avantiqo-fast-status.stderr &`,
    `exec python3 -m vllm.entrypoints.openai.api_server --model ${FAST_MODEL} --served-model-name ${FAST_MODEL} --host 0.0.0.0 --port ${VLLM_PORT} --trust-remote-code --enable-auto-tool-choice --tool-call-parser hermes --max-model-len ${MAX_MODEL_LEN} --gpu-memory-utilization ${GPU_MEMORY_UTILIZATION} > >(tee -a ${STARTUP_LOG}) 2>&1`,
  ].join("; ");
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
let podCreatePerformed = false;
let deletePerformed = false;
let deleteVerified = false;
let runtimeTelemetryPassed = false;
let statusRoutePassed = false;
let modelRoutePassed = false;
let interrupted = false;
const abortController = new AbortController();

async function resolveRuntime() {
  const [endpointsRaw, templatesRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  ]);
  const matches = endpointRows(endpointsRaw).filter((e) => text(e?.name) === FAST_ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_FAST_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  endpoint = matches[0];
  endpointId = text(endpoint?.id);
  const id = templateId(endpoint);
  template = templateRows(templatesRaw).find((t) => text(t?.id) === id) || endpoint?.template || null;
  if (!endpointId || !id || !text(template?.imageName)) throw new Error(`${CONTRACT}_FAST_TEMPLATE_REQUIRED`);
}

async function baseline(stage) {
  await resolveRuntime();
  const [healthRaw, podsRaw, volumesRaw, allEndpoints] = await Promise.all([
    health(endpointId, runtimeKey),
    rest("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey),
    rest("/networkvolumes", managementKey),
    rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
  ]);
  const c = counters(healthRaw);
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) throw new Error(`${CONTRACT}_${stage}_FAST_SERVERLESS_NOT_0_0`);
  if (c.jobs.in_queue || c.jobs.in_progress || Object.values(c.workers).some((v) => v !== 0)) throw new Error(`${CONTRACT}_${stage}_FAST_SERVERLESS_BUSY`);

  const volume = volumeRows(volumesRaw).find((v) => text(v?.id) === NETWORK_VOLUME_ID);
  if (!volume || text(volume?.name) !== NETWORK_VOLUME_NAME || text(volume?.dataCenterId ?? volume?.data_center_id) !== DATA_CENTER_ID) {
    throw new Error(`${CONTRACT}_${stage}_SHARED_VOLUME_CONTRACT_MISMATCH`);
  }

  const conflictingPods = podRows(podsRaw).filter((p) => activeStatus(p) && podVolumeId(p) === NETWORK_VOLUME_ID && (!ownedPodName || text(p?.name) !== ownedPodName));
  if (conflictingPods.length) throw new Error(`${CONTRACT}_${stage}_SHARED_VOLUME_FOREIGN_POD_ACTIVE:${conflictingPods.map((p) => text(p?.name || p?.id)).join(",")}`);

  const conflictingEndpoints = endpointRows(allEndpoints).filter((e) => {
    const ids = unique([e?.networkVolumeId, ...list(e?.networkVolumeIds).map((x) => typeof x === "string" ? x : x?.networkVolumeId)]);
    return ids.includes(NETWORK_VOLUME_ID) && list(e?.workers).some(activeStatus);
  });
  if (conflictingEndpoints.length) throw new Error(`${CONTRACT}_${stage}_SHARED_VOLUME_ENDPOINT_ACTIVE:${conflictingEndpoints.map((e) => text(e?.name || e?.id)).join(",")}`);

  const gpuTypeIds = unique(endpoint?.gpuTypeIds).filter((id) => /H100|H200|B200|RTX PRO 6000 Blackwell Server Edition/i.test(id));
  if (!gpuTypeIds.length) throw new Error(`${CONTRACT}_${stage}_NO_COMPATIBLE_GPU_TYPES`);

  return {
    gpuTypeIds,
    volumeSizeGb: finite(volume?.size ?? volume?.sizeGb),
    imageName: text(template?.imageName),
  };
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
    if (!matches.length) {
      deleteVerified = true;
      return;
    }
    for (const p of matches) {
      const id = text(p?.id);
      if (!id) continue;
      try {
        await rest(`/pods/${encodeURIComponent(id)}`, managementKey, { method: "DELETE" });
        deletePerformed = true;
      } catch {}
    }
    await sleep(3000);
  }
  const left = await ownedPods().catch(() => []);
  if (!left.length) {
    deleteVerified = true;
    return;
  }
  throw new Error(`${CONTRACT}_POD_DELETE_NOT_VERIFIED:${left.length}`);
}

async function interrupt(signal) {
  if (interrupted) return;
  interrupted = true;
  abortController.abort(new Error(signal));
  console.error(`${CONTRACT}_INTERRUPT=${signal}`);
  try { await cleanup(); } catch (error) { console.error(`${CONTRACT}_INTERRUPT_CLEANUP_ERROR=${redact(error?.message)}`); }
  process.exitCode = signal === "SIGINT" ? 130 : 143;
}
process.on("SIGINT", () => { void interrupt("SIGINT"); });
process.on("SIGTERM", () => { void interrupt("SIGTERM"); });

async function createPod(gpuTypeIds) {
  const env = {
    ...envObject(template?.env),
    MODEL_NAME: FAST_MODEL,
    SERVED_MODEL_NAME: FAST_MODEL,
    HF_HOME: CACHE_ROOT,
    HUGGINGFACE_HUB_CACHE: `${CACHE_ROOT}/hub`,
    VLLM_CACHE_ROOT,
    SAFETENSORS_LOAD_STRATEGY: "prefetch",
    AVANTIQO_FAST_STARTUP_LOG: STARTUP_LOG,
    ENABLE_AUTO_TOOL_CHOICE: "true",
    TOOL_CALL_PARSER: "hermes",
  };
  delete env.REASONING_PARSER;
  delete env.RUNPOD_ENDPOINT_ID;
  delete env.RUNPOD_AI_API_ID;
  delete env.RUNPOD_POD_ID;

  const body = {
    name: ownedPodName,
    imageName: text(template?.imageName),
    cloudType: "SECURE",
    computeType: "GPU",
    gpuCount: 1,
    gpuTypeIds,
    gpuTypePriority: "availability",
    allowedCudaVersions: unique(endpoint?.allowedCudaVersions),
    dataCenterIds: [DATA_CENTER_ID],
    dataCenterPriority: "availability",
    containerDiskInGb: Math.max(50, finite(template?.containerDiskInGb, 50)),
    dockerEntrypoint: ["bash", "-lc"],
    dockerStartCmd: [podStartCommand()],
    env,
    ports: [`${STATUS_PORT}/http`, `${VLLM_PORT}/http`],
    supportPublicIp: true,
    interruptible: false,
    locked: false,
    networkVolumeId: NETWORK_VOLUME_ID,
    volumeMountPath: "/workspace",
  };
  if (text(template?.containerRegistryAuthId)) body.containerRegistryAuthId = text(template.containerRegistryAuthId);

  const created = await rest("/pods", managementKey, { method: "POST", body, timeoutMs: 60000 });
  podCreatePerformed = true;
  const id = text(created?.id) || text((await ownedPods())[0]?.id);
  if (!id) throw new Error(`${CONTRACT}_CREATED_POD_ID_REQUIRED`);
  return id;
}

async function podState(podId) {
  const p = await rest(`/pods/${encodeURIComponent(podId)}?includeMachine=true&includeNetworkVolume=true`, managementKey, { allow404: true });
  if (p?.__not_found) throw new Error(`${CONTRACT}_POD_DISAPPEARED`);
  const desired = text(p?.desiredStatus ?? p?.desired_status).toUpperCase();
  const status = text(p?.status ?? p?.runtimeStatus).toUpperCase();
  if (TERMINAL.has(desired) || TERMINAL.has(status)) throw new Error(`${CONTRACT}_POD_TERMINAL:${desired || status}`);
  return { pod: p, desired, status };
}

async function podRuntimeTelemetry(podId) {
  const safeId = text(podId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeId || safeId !== text(podId)) throw new Error(`${CONTRACT}_POD_ID_INVALID`);
  const data = await graphql(`query { pod(input: {podId: "${safeId}"}) { id desiredStatus runtime { uptimeInSeconds ports { privatePort publicPort type isIpPublic } gpus { gpuUtilPercent memoryUtilPercent } container { cpuPercent memoryPercent } } } }`, managementKey);
  const pod = object(data?.pod);
  return { pod, runtime: object(pod?.runtime) };
}

async function waitRunning(podId) {
  const started = Date.now();
  const deadline = started + RUNTIME_TELEMETRY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error(`${CONTRACT}_INTERRUPTED`);
    const state = await podState(podId);
    const machineAssigned = Boolean(text(state.pod?.machineId || state.pod?.machine?.id));
    let telemetry = { pod: {}, runtime: {} };
    let telemetryError = null;
    try {
      telemetry = await podRuntimeTelemetry(podId);
    } catch (error) {
      telemetryError = redact(error?.message);
      if (/HTTP_(401|403)|unauthoriz|api.?key/i.test(telemetryError)) {
        throw new Error(`${CONTRACT}_RUNTIME_TELEMETRY_AUTH_FAILED:${telemetryError}`);
      }
    }
    const runtime = object(telemetry.runtime);
    const uptime = runtime?.uptimeInSeconds == null ? null : finite(runtime.uptimeInSeconds, null);
    const ports = list(runtime?.ports);
    const statusPortRegistered = ports.some((port) => finite(port?.privatePort, -1) === STATUS_PORT);
    const vllmPortRegistered = ports.some((port) => finite(port?.privatePort, -1) === VLLM_PORT);
    const elapsedMs = Date.now() - started;
    const costPerHr = finite(state.pod?.costPerHr ?? state.pod?.adjustedCostPerHr ?? state.pod?.machine?.costPerHr, null);
    const estimatedSpendUsd = costPerHr == null ? null : Number((costPerHr * elapsedMs / 3_600_000).toFixed(4));

    console.log(JSON.stringify({
      event: "AVANTIQO_INTELLIGENCE_FAST_POD_PROGRESS",
      phase: "POD_RUNTIME_WAIT",
      desired_status: state.desired || null,
      rest_runtime_status: state.status || null,
      machine_assigned: machineAssigned,
      last_started_at: text(state.pod?.lastStartedAt) || null,
      runtime_telemetry_present: uptime !== null,
      runtime_uptime_seconds: uptime,
      status_port_registered: statusPortRegistered,
      vllm_port_registered: vllmPortRegistered,
      runtime_port_count: ports.length,
      telemetry_error: telemetryError,
      cost_per_hour_present: costPerHr !== null,
      estimated_spend_usd: estimatedSpendUsd,
      secrets_printed: false,
    }));

    if (machineAssigned && uptime !== null && statusPortRegistered) {
      runtimeTelemetryPassed = true;
      return { ...state.pod, runtime };
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_POD_RUNTIME_TELEMETRY_TIMEOUT`);
}

async function fetchStatus(podId) {
  const url = `https://${podId}-${STATUS_PORT}.proxy.runpod.net/`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.any([abortController.signal, AbortSignal.timeout(8000)]),
  });
  const raw = await response.text();
  if (!response.ok) return { ok: false, http: response.status, raw: redact(raw).slice(0, 300) };
  try {
    const body = JSON.parse(raw);
    return {
      ok: body?.ok === true,
      http: response.status,
      cache_gb: finite(body?.cache_gb, 0),
      cache_files: finite(body?.cache_files, 0),
      workspace_free_gb: finite(body?.workspace_free_gb),
      workspace_total_gb: finite(body?.workspace_total_gb),
      vllm_port_open: body?.vllm_port_open === true,
      startup_log_tail: redact(body?.startup_log_tail).slice(-1000),
    };
  } catch {
    return { ok: false, http: response.status, raw: redact(raw).slice(0, 300) };
  }
}

async function waitStatusRoute(podId) {
  const deadline = Date.now() + STATUS_ROUTE_TIMEOUT_MS;
  let attempt = 0;
  let last = null;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error(`${CONTRACT}_INTERRUPTED`);
    attempt += 1;
    await podState(podId);
    try { last = await fetchStatus(podId); }
    catch (error) { last = { ok: false, error: redact(error?.message) }; }
    console.log(JSON.stringify({
      event: "AVANTIQO_INTELLIGENCE_FAST_POD_PROGRESS",
      phase: "STATUS_ROUTE_WAIT",
      attempt,
      status_http: last?.http ?? null,
      status_route_ok: last?.ok === true,
      cache_gb: last?.cache_gb ?? null,
      workspace_free_gb: last?.workspace_free_gb ?? null,
      vllm_port_open: last?.vllm_port_open === true,
      startup_log_tail: text(last?.startup_log_tail).slice(-500) || null,
      secrets_printed: false,
    }));
    if (last?.ok === true) {
      statusRoutePassed = true;
      return last;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_STATUS_ROUTE_TIMEOUT:${redact(JSON.stringify(last))}`);
}

async function fetchModels(podId) {
  const url = `https://${podId}-${VLLM_PORT}.proxy.runpod.net/v1/models`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.any([abortController.signal, AbortSignal.timeout(10000)]),
  });
  const raw = await response.text();
  if (!response.ok) return { ok: false, http: response.status, raw: redact(raw).slice(0, 250), ids: [] };
  let body = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  const ids = list(body?.data).map((row) => text(row?.id)).filter(Boolean);
  return { ok: true, http: response.status, ids };
}

async function waitModels(podId, initialStatus) {
  const deadline = Date.now() + MODEL_ROUTE_TIMEOUT_MS;
  let attempt = 0;
  let previousCacheGb = finite(initialStatus?.cache_gb, 0);
  let lastModels = null;
  let lastStatus = initialStatus;

  while (Date.now() < deadline) {
    if (interrupted) throw new Error(`${CONTRACT}_INTERRUPTED`);
    attempt += 1;
    await podState(podId);

    try { lastStatus = await fetchStatus(podId); }
    catch (error) { lastStatus = { ok: false, error: redact(error?.message) }; }
    try { lastModels = await fetchModels(podId); }
    catch (error) { lastModels = { ok: false, http: null, raw: redact(error?.message), ids: [] }; }

    const cacheGb = finite(lastStatus?.cache_gb, previousCacheGb);
    const cacheDeltaMb = Math.round((cacheGb - previousCacheGb) * 1024);
    previousCacheGb = cacheGb;
    const logTail = text(lastStatus?.startup_log_tail).slice(-800);

    console.log(JSON.stringify({
      event: "AVANTIQO_INTELLIGENCE_FAST_POD_PROGRESS",
      phase: "MODEL_STARTUP",
      attempt,
      elapsed_seconds: Math.floor((MODEL_ROUTE_TIMEOUT_MS - Math.max(0, deadline - Date.now())) / 1000),
      status_route_ok: lastStatus?.ok === true,
      cache_gb: cacheGb,
      cache_delta_mb: cacheDeltaMb,
      cache_files: lastStatus?.cache_files ?? null,
      workspace_free_gb: lastStatus?.workspace_free_gb ?? null,
      vllm_port_open: lastStatus?.vllm_port_open === true,
      models_http: lastModels?.http ?? null,
      startup_log_tail: logTail || null,
      secrets_printed: false,
    }));

    if (lastModels?.ok === true && lastModels.ids.includes(FAST_MODEL)) {
      modelRoutePassed = true;
      return { ids: lastModels.ids, status: lastStatus };
    }

    if (logTail && FATAL_STARTUP.test(logTail)) {
      throw new Error(`${CONTRACT}_VLLM_FATAL_STARTUP:${redact(logTail)}`);
    }

    await sleep(POLL_MS);
  }

  throw new Error(`${CONTRACT}_MODEL_ROUTE_TIMEOUT:status=${redact(JSON.stringify(lastStatus))}:models=${redact(JSON.stringify(lastModels))}`);
}

const initial = await baseline("PRECHECK");
ownedPodName = `avantiqo-intelligence-fast-v3-${randomBytes(6).toString("hex")}`;

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    repository_head: repoHead,
    endpoint_name: FAST_ENDPOINT_NAME,
    expected_model: FAST_MODEL,
    pod_runtime: {
      image_name: initial.imageName,
      source: "BOUND_FAST_IMAGE_WITHOUT_SERVERLESS_TEMPLATE",
      explicit_pod_native_entrypoint: true,
      readiness_source: "RUNPOD_GRAPHQL_RUNTIME_TELEMETRY",
      status_port: STATUS_PORT,
      vllm_port: VLLM_PORT,
      max_model_len: MAX_MODEL_LEN,
      gpu_memory_utilization: GPU_MEMORY_UTILIZATION,
    },
    shared_cache: {
      id: NETWORK_VOLUME_ID,
      name: NETWORK_VOLUME_NAME,
      data_center_id: DATA_CENTER_ID,
      size_gb: initial.volumeSizeGb,
      huggingface_cache_path: CACHE_ROOT,
      vllm_compile_cache_path: VLLM_CACHE_ROOT,
      idle_verified: true,
    },
    gpu_type_ids: initial.gpuTypeIds,
    runtime_telemetry_deadline_seconds: RUNTIME_TELEMETRY_TIMEOUT_MS / 1000,
    status_route_deadline_seconds: STATUS_ROUTE_TIMEOUT_MS / 1000,
    model_route_deadline_seconds: MODEL_ROUTE_TIMEOUT_MS / 1000,
    chat_completion_submitted: false,
    token_generation_performed: false,
    pod_created: false,
    inference_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=PLAN_READY`);
} else {
  let failure = null;
  let running = null;
  let status = null;
  let models = { ids: [], status: null };

  try {
    createdPodId = await createPod(initial.gpuTypeIds);
    running = await waitRunning(createdPodId);
    status = await waitStatusRoute(createdPodId);
    models = await waitModels(createdPodId, status);
  } catch (error) {
    failure = error;
  } finally {
    try { await cleanup(); } catch (error) { if (!failure) failure = error; }
  }

  let finalBaseline = null;
  try { finalBaseline = await baseline("POSTCHECK"); } catch (error) { if (!failure) failure = error; }

  const success = !failure && podCreatePerformed && runtimeTelemetryPassed && statusRoutePassed && modelRoutePassed && deleteVerified && Boolean(finalBaseline);
  const finalStatus = models?.status || status || {};
  console.log(JSON.stringify({
    success,
    contract: CONTRACT,
    mode: "APPLY",
    repository_head: repoHead,
    endpoint_name: FAST_ENDPOINT_NAME,
    expected_model: FAST_MODEL,
    pod_created: podCreatePerformed,
    pod_machine_assigned: Boolean(text(running?.machineId || running?.machine?.id)),
    pod_runtime_telemetry_passed: runtimeTelemetryPassed,
    pod_runtime_uptime_seconds_at_ready: running?.runtime?.uptimeInSeconds == null ? null : finite(running.runtime.uptimeInSeconds, null),
    pod_native_image_only: true,
    serverless_template_used_for_pod_creation: false,
    status_route_passed: statusRoutePassed,
    final_cache_gb: finite(finalStatus?.cache_gb),
    final_workspace_free_gb: finite(finalStatus?.workspace_free_gb),
    vllm_port_open: finalStatus?.vllm_port_open === true,
    max_model_len: MAX_MODEL_LEN,
    model_route_passed: modelRoutePassed,
    expected_model_served: list(models?.ids).includes(FAST_MODEL),
    returned_model_count: list(models?.ids).length,
    shared_cache_attached: true,
    huggingface_cache_path: CACHE_ROOT,
    vllm_compile_cache_path: VLLM_CACHE_ROOT,
    pod_delete_performed: deletePerformed,
    pod_delete_verified: deleteVerified,
    final_serverless_resting_0_0: Boolean(finalBaseline),
    completion_request_performed: false,
    chat_completion_submitted: false,
    token_generation_performed: false,
    inference_performed: false,
    wallet_mutation_performed: false,
    database_mutation_performed: false,
    serverless_workers_max_mutated: false,
    production_deploy_performed: false,
    secrets_printed: false,
    failure: failure ? redact(failure?.message) : null,
  }, null, 2));
  console.log(`${CONTRACT}=${success ? "PASS" : "FAIL"}`);
  if (!success) process.exitCode = 1;
}
