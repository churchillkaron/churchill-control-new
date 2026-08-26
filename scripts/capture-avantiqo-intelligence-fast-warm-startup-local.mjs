import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_WARM_STARTUP_CAPTURE_V1";
const APPROVAL = "AVANTIQO_INTELLIGENCE_FAST_STARTUP_CAPTURE_APPROVED";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const SLOT_MANAGER = "scripts/manage-avantiqo-intelligence-lane-slot-local.mjs";
const REPORT_PATH = "/tmp/avantiqo-intelligence-fast-warm-startup-capture.json";
const WAIT_TIMEOUT_MS = 210_000;
const POLL_MS = 5_000;
const LOG_CAPTURE_MS = 15_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi,
      "$1[REDACTED]",
    );
}

function shell(name, args, code, options = {}) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${code}:${redact(text(result.stderr || result.stdout)).slice(0, 900)}`,
    );
  }
  return text(result.stdout);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_FAST_STARTUP_GIT_FETCH_FAILED");
  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_FAST_STARTUP_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(`AVANTIQO_FAST_STARTUP_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_FAST_STARTUP_GIT_HEAD_FAILED",
  );
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    "AVANTIQO_FAST_STARTUP_GIT_REMOTE_FAILED",
  );
  if (head === remote) return head;

  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    "AVANTIQO_FAST_STARTUP_GIT_STATUS_FAILED",
  );
  if (dirty) {
    throw new Error("AVANTIQO_FAST_STARTUP_CURRENT_MAIN_DIRTY_CHECKOUT");
  }
  shell(
    "git",
    ["merge", "--ff-only", "origin/main"],
    "AVANTIQO_FAST_STARTUP_GIT_FAST_FORWARD_FAILED",
  );
  const converged = shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_FAST_STARTUP_GIT_CONVERGED_HEAD_FAILED",
  );
  if (converged !== remote) {
    throw new Error(
      `AVANTIQO_FAST_STARTUP_MAIN_CONVERGENCE_FAILED:head=${converged}:origin_main=${remote}`,
    );
  }
  console.log(`AVANTIQO_INTELLIGENCE_FAST_STARTUP_MAIN_CONVERGED=${converged}`);
  return converged;
}

function requiredCredential() {
  const value = text(
    process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  );
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
}

async function request(url, credential, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: options.accept || "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal || AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return response;
}

async function requestJson(url, credential, options = {}) {
  const response = await request(url, credential, options);
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = redact(
      text(body?.message || body?.error || body?.detail || raw),
    ).slice(0, 900);
    throw new Error(
      `RUNPOD_FAST_STARTUP_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  return body ?? {};
}

async function optionalJson(url, credential) {
  try {
    return { ok: true, body: await requestJson(url, credential), error: null };
  } catch (error) {
    return {
      ok: false,
      body: null,
      error: redact(text(error?.message || error)).slice(0, 900),
    };
  }
}

function resolveOne(endpoints, name, code) {
  const matches = list(endpoints).filter((endpoint) => text(endpoint?.name) === name);
  if (matches.length !== 1) throw new Error(`${code}:matches=${matches.length}`);
  return matches[0];
}

function healthSummary(value = {}) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
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

function safeWorker(worker = {}) {
  return {
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    version: finite(worker?.version),
    is_stale: worker?.isStale === true,
    gpu_count: finite(worker?.gpuCount),
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    started_at: text(worker?.startedAt) || null,
  };
}

function safeReleases(value = {}) {
  const rollout = object(value?.rollout);
  return {
    endpoint_version: finite(value?.endpointVersion),
    rollout: {
      in_progress: rollout?.inProgress === true,
      workers_on_latest: finite(rollout?.workersOnLatest),
      workers_total: finite(rollout?.workersTotal),
      percent_on_latest: finite(rollout?.percentOnLatest),
    },
    releases: list(value?.releases).slice(0, 12).map((release) => ({
      id: text(release?.id) || null,
      version: finite(release?.version),
      source: text(release?.source) || null,
      build_id_present: Boolean(text(release?.buildId)),
      worker_count: finite(release?.workerCount),
      created_at: text(release?.createdAt) || null,
      changed_fields: list(release?.diff)
        .map((entry) => text(entry?.field))
        .filter(Boolean),
    })),
  };
}

function runSlotManager(mode, approvalName) {
  const output = shell(
    process.execPath,
    ["--env-file=.env.local", SLOT_MANAGER, mode],
    `AVANTIQO_FAST_STARTUP_SLOT_MANAGER_${mode.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}_FAILED`,
    { env: { ...process.env, [approvalName]: "YES" } },
  );
  if (output) console.log(output);
  return output;
}

async function endpoints(managementKey) {
  return requestJson(
    `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
}

async function patchWorkers(endpointId, managementKey, workersMin, workersMax) {
  await requestJson(
    `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}`,
    managementKey,
    {
      method: "PATCH",
      body: { workersMin, workersMax },
    },
  );
  const verified = await requestJson(
    `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeWorkers=true`,
    managementKey,
  );
  if (
    finite(verified?.workersMin, -1) !== workersMin ||
    finite(verified?.workersMax, -1) !== workersMax
  ) {
    throw new Error(
      `AVANTIQO_FAST_STARTUP_WORKER_PATCH_VERIFY_FAILED:min=${finite(verified?.workersMin)}:max=${finite(verified?.workersMax)}:expected_min=${workersMin}:expected_max=${workersMax}`,
    );
  }
  return verified;
}

function parseSseFrame(frame, workerId) {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (!data.length) return null;
  const payload = data.join("\n");
  try {
    const parsed = JSON.parse(payload);
    return {
      worker_id: workerId,
      source: text(parsed?.source) || "unknown",
      ts: text(parsed?.ts) || null,
      line: redact(parsed?.line ?? parsed?.raw ?? payload).slice(0, 4000),
    };
  } catch {
    return {
      worker_id: workerId,
      source: "unknown",
      ts: null,
      line: redact(payload).slice(0, 4000),
    };
  }
}

async function captureWorkerLogs(endpointId, workerId, credential) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOG_CAPTURE_MS);
  const entries = [];
  let buffer = "";
  let status = null;
  let error = null;

  try {
    const response = await request(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=1500`,
      credential,
      { accept: "text/event-stream", signal: controller.signal },
    );
    status = response.status;
    if (!response.ok) {
      error = `RUNPOD_FAST_STARTUP_LOG_HTTP_${response.status}:${redact(await response.text()).slice(0, 900)}`;
      return { worker_id: workerId, response_status: status, entries, error };
    }
    if (!response.body) {
      error = "RUNPOD_FAST_STARTUP_LOG_STREAM_BODY_REQUIRED";
      return { worker_id: workerId, response_status: status, entries, error };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (readError) {
        if (readError?.name === "AbortError") break;
        throw readError;
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const entry = parseSseFrame(frame, workerId);
        if (entry) entries.push(entry);
      }
    }
  } catch (captureError) {
    if (captureError?.name !== "AbortError") {
      error = redact(text(captureError?.message || captureError)).slice(0, 900);
    }
  } finally {
    clearTimeout(timeout);
  }

  if (buffer.trim()) {
    const entry = parseSseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }
  return { worker_id: workerId, response_status: status, entries, error };
}

function signals(entries) {
  const joined = entries.map((entry) => entry.line).join("\n");
  const has = (pattern) => pattern.test(joined);
  return {
    serverless_worker_started: has(/Starting Serverless Worker/i),
    application_startup_complete: has(/Application startup complete/i),
    handler_signal_present: has(/handler/i),
    vllm_signal_present: has(/\bvllm\b/i),
    model_signal_present: has(/model/i),
    cuda_or_nvidia_failure: has(
      /cuda.*(?:error|failed)|nvidia.*(?:error|failed)|libcuda|cudnn.*(?:error|failed)/i,
    ),
    python_startup_failure: has(
      /Traceback|ModuleNotFoundError|ImportError|RuntimeError|Exception:/i,
    ),
    memory_failure: has(
      /out of memory|\boom\b|exit code 137|sigkill|killed process/i,
    ),
    auth_or_control_plane_failure: has(
      /unauthorized|forbidden|authentication.*failed|failed.*ping|ping.*failed/i,
    ),
  };
}

function relevantEntries(entries) {
  const important =
    /serverless|handler|application startup|vllm|engine|model|cuda|nvidia|traceback|exception|runtimeerror|error|failed|fatal|out of memory|oom|killed|exit code|unauthorized|forbidden|connection|timeout/i;
  const matched = entries.filter((entry) => important.test(entry.line));
  return (matched.length ? matched : entries).slice(-160);
}

function diagnosis(workerSeen, laneSignals, captures) {
  if (!workerSeen) return "NO_WORKER_PROVISIONED_DURING_WARM_LEASE";
  if (captures.length && captures.every((capture) => capture.error)) {
    return "WORKER_STARTED_BUT_LOG_CAPTURE_UNAVAILABLE";
  }
  if (laneSignals.cuda_or_nvidia_failure) return "CUDA_OR_NVIDIA_STARTUP_FAILURE";
  if (laneSignals.memory_failure) return "MEMORY_OR_PROCESS_TERMINATION_FAILURE";
  if (laneSignals.python_startup_failure) return "PYTHON_OR_VLLM_STARTUP_FAILURE";
  if (laneSignals.auth_or_control_plane_failure) {
    return "RUNPOD_HANDLER_CONTROL_PLANE_FAILURE";
  }
  if (
    laneSignals.application_startup_complete &&
    !laneSignals.serverless_worker_started
  ) {
    return "VLLM_STARTED_BUT_SERVERLESS_HANDLER_NOT_STARTED";
  }
  if (laneSignals.serverless_worker_started) {
    return "SERVERLESS_HANDLER_STARTED_WITHOUT_INFERENCE_JOB";
  }
  return "WORKER_STARTED_STARTUP_LOGS_INCONCLUSIVE";
}

if (text(process.env[APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL}=YES_REQUIRED`);
}

const mainCommit = validateCurrentMain();
const managementKey = requiredCredential();
const runtimeKey = runtimeCredential(managementKey);
let fastActivated = false;
let fastId = null;
let report = null;
let cleanup = { fast_min_zero: false, deep_restored: false, error: null };
let stopSignal = null;
const requestStop = (signal) => {
  stopSignal ||= signal;
  console.error(
    `AVANTIQO_INTELLIGENCE_FAST_STARTUP_CAPTURE_STOP_REQUESTED=${signal}:cleanup_will_run`,
  );
};
const onSigint = () => requestStop("SIGINT");
const onSigterm = () => requestStop("SIGTERM");
process.on("SIGINT", onSigint);
process.on("SIGTERM", onSigterm);

try {
  runSlotManager(
    "--provision",
    "AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED",
  );
  let state = await endpoints(managementKey);
  let deep = resolveOne(
    state,
    DEEP_NAME,
    "AVANTIQO_FAST_STARTUP_DEEP_ENDPOINT_RESOLUTION_FAILED",
  );
  let fast = resolveOne(
    state,
    FAST_NAME,
    "AVANTIQO_FAST_STARTUP_FAST_ENDPOINT_RESOLUTION_FAILED",
  );
  fastId = text(fast?.id);
  const preexistingFastActive =
    finite(deep?.workersMin, -1) === 0 &&
    finite(deep?.workersMax, -1) === 0 &&
    finite(fast?.workersMin, -1) >= 0 &&
    finite(fast?.workersMax, -1) === 1;
  if (preexistingFastActive) {
    // Register cleanup before any health request or state assertion can fail.
    // Setting Fast min=0 and restoring Deep lets any existing job drain without
    // cancelling it while preventing the warm lease from remaining enabled.
    fastActivated = true;
    console.log(
      "AVANTIQO_INTELLIGENCE_FAST_PREEXISTING_ACTIVE_STATE_RECOVERY=true",
    );
  }
  const [deepHealth, fastHealth] = await Promise.all([
    requestJson(`${QUEUE_BASE}/${encodeURIComponent(text(deep?.id))}/health`, runtimeKey),
    requestJson(`${QUEUE_BASE}/${encodeURIComponent(text(fast?.id))}/health`, runtimeKey),
  ]);
  const beforeHealth = {
    deep: healthSummary(deepHealth),
    fast: healthSummary(fastHealth),
  };
  if (
    beforeHealth.deep.jobs.in_queue !== 0 ||
    beforeHealth.deep.jobs.in_progress !== 0 ||
    beforeHealth.fast.jobs.in_queue !== 0 ||
    beforeHealth.fast.jobs.in_progress !== 0
  ) {
    throw new Error("AVANTIQO_FAST_STARTUP_ACTIVE_JOB_BLOCKED");
  }
  if (preexistingFastActive) {
    throw new Error(
      "AVANTIQO_FAST_STARTUP_PREEXISTING_ACTIVE_STATE_RESTORING_DEEP",
    );
  }
  if (
    finite(deep?.workersMin, -1) !== 0 ||
    finite(deep?.workersMax, -1) !== 1 ||
    finite(fast?.workersMin, -1) !== 0 ||
    finite(fast?.workersMax, -1) !== 0
  ) {
    throw new Error("AVANTIQO_FAST_STARTUP_SAFE_PARKED_STATE_REQUIRED");
  }

  runSlotManager(
    "--activate-fast",
    "AVANTIQO_INTELLIGENCE_FAST_SLOT_SWAP_APPROVED",
  );
  fastActivated = true;
  state = await endpoints(managementKey);
  deep = resolveOne(
    state,
    DEEP_NAME,
    "AVANTIQO_FAST_STARTUP_DEEP_ENDPOINT_RESOLUTION_FAILED",
  );
  fast = resolveOne(
    state,
    FAST_NAME,
    "AVANTIQO_FAST_STARTUP_FAST_ENDPOINT_RESOLUTION_FAILED",
  );
  fastId = text(fast?.id);
  if (
    finite(deep?.workersMax, -1) !== 0 ||
    finite(fast?.workersMax, -1) !== 1 ||
    !fastId
  ) {
    throw new Error("AVANTIQO_FAST_STARTUP_SLOT_ACTIVATION_VERIFY_FAILED");
  }

  await patchWorkers(fastId, managementKey, 1, 1);
  console.log("AVANTIQO_INTELLIGENCE_FAST_WARM_WORKER_REQUESTED=true");
  console.log("AVANTIQO_INTELLIGENCE_FAST_GENERATION_SUBMITTED=false");

  const startedAt = Date.now();
  let workersResult = { ok: true, body: { workers: [] }, error: null };
  let releaseResult = { ok: true, body: null, error: null };
  let lastHealth = {};
  let workers = [];
  while (!stopSignal && Date.now() - startedAt <= WAIT_TIMEOUT_MS) {
    [workersResult, releaseResult, lastHealth] = await Promise.all([
      optionalJson(
        `${CONTROL_BASE}/serverless/${encodeURIComponent(fastId)}/workers`,
        managementKey,
      ),
      optionalJson(
        `${CONTROL_BASE}/serverless/${encodeURIComponent(fastId)}/releases`,
        managementKey,
      ),
      requestJson(`${QUEUE_BASE}/${encodeURIComponent(fastId)}/health`, runtimeKey),
    ]);
    workers = list(workersResult.body?.workers).map(safeWorker);
    console.log(
      JSON.stringify({
        event: "AVANTIQO_INTELLIGENCE_FAST_WARM_STARTUP_PROGRESS",
        elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
        workers,
        health: healthSummary(lastHealth),
      }),
    );
    if (workers.length) break;
    await sleep(POLL_MS);
  }

  const captures = [];
  for (const worker of workers) {
    if (!worker.id) continue;
    captures.push(await captureWorkerLogs(fastId, worker.id, managementKey));
  }
  const entries = captures.flatMap((capture) => capture.entries);
  const laneSignals = signals(entries);
  const classified = stopSignal
    ? `CAPTURE_INTERRUPTED_${stopSignal}`
    : diagnosis(workers.length > 0, laneSignals, captures);
  report = {
    success: true,
    contract: CONTRACT,
    mode: "CAPTURE_ONE_WARM_STARTUP_NO_INFERENCE",
    main_commit: mainCommit,
    fast_endpoint_id_present: Boolean(fastId),
    before_health: beforeHealth,
    worker_seen: workers.length > 0,
    workers,
    workers_request_error: workersResult.error,
    endpoint_release: releaseResult.ok ? safeReleases(releaseResult.body) : null,
    endpoint_release_error: releaseResult.error,
    final_fast_health: healthSummary(lastHealth),
    signals: laneSignals,
    diagnosis: classified,
    log_capture_errors: captures
      .filter((capture) => capture.error)
      .map((capture) => ({
        worker_id: capture.worker_id,
        error: capture.error,
      })),
    relevant_logs: relevantEntries(entries),
    warm_worker_requested: true,
    generation_submitted: false,
    inference_job_submitted: false,
    endpoint_mutation_performed: true,
    production_deploy_performed: false,
    secrets_in_output: false,
  };
} finally {
  if (fastActivated && fastId) {
    try {
      await patchWorkers(fastId, managementKey, 0, 1);
      cleanup.fast_min_zero = true;
    } catch (error) {
      cleanup.error = redact(text(error?.message || error)).slice(0, 900);
    }
  }
  if (fastActivated) {
    try {
      runSlotManager(
        "--restore-deep",
        "AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED",
      );
      cleanup.deep_restored = true;
      fastActivated = false;
    } catch (error) {
      cleanup.error = [cleanup.error, redact(text(error?.message || error)).slice(0, 900)]
        .filter(Boolean)
        .join(" | ");
    }
  }
}

if (!report) {
  throw new Error(
    `AVANTIQO_FAST_STARTUP_CAPTURE_FAILED_BEFORE_REPORT:cleanup=${JSON.stringify(cleanup)}`,
  );
}
report.cleanup = cleanup;
report.interrupted_signal = stopSignal;
report.success = !stopSignal && cleanup.fast_min_zero && cleanup.deep_restored;
report.next_action =
  report.diagnosis === "NO_WORKER_PROVISIONED_DURING_WARM_LEASE"
    ? "ESCALATE_RUNPOD_SERVERLESS_SCHEDULER_OR_ACCOUNT_CONSTRAINT_WITH_ENDPOINT_RELEASE_EVIDENCE"
    : report.diagnosis === "VLLM_STARTED_BUT_SERVERLESS_HANDLER_NOT_STARTED"
      ? "REPAIR_FAST_CONTAINER_HANDLER_STARTUP"
      : report.diagnosis === "SERVERLESS_HANDLER_STARTED_WITHOUT_INFERENCE_JOB"
        ? "RUN_ONE_FAST_FIRST_RESPONSE_WITH_LIVE_LOG_CAPTURE"
        : "REPAIR_FAST_WORKER_STARTUP_FROM_CAPTURED_LOGS";

const reportPath = resolve(
  process.env.AVANTIQO_INTELLIGENCE_FAST_STARTUP_CAPTURE_OUTPUT || REPORT_PATH,
);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
console.log(`AVANTIQO_INTELLIGENCE_FAST_WARM_STARTUP_CAPTURE_REPORT=${reportPath}`);
console.log(
  `AVANTIQO_INTELLIGENCE_FAST_WARM_STARTUP_CAPTURE=${report.success ? "PASS" : "FAIL"}`,
);
process.off("SIGINT", onSigint);
process.off("SIGTERM", onSigterm);
if (stopSignal === "SIGINT") process.exitCode = 130;
else if (stopSignal === "SIGTERM") process.exitCode = 143;
else if (!report.success) process.exitCode = 1;
