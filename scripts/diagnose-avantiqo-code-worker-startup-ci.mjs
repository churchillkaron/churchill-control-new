import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_WORKER_STARTUP_DIAGNOSTIC_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const CAPTURE_MS = 12_000;
const LOG_TAIL = 2500;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}
async function jsonRequest(url, credential) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0,900)}`);
  return body;
}
function safeWorker(worker = {}) {
  return {
    id: text(worker.id || worker.workerId) || null,
    status: text(worker.status || worker.workerStatus || worker.runtimeStatus || worker.desiredStatus).toUpperCase() || null,
    desired_status: text(worker.desiredStatus || worker.desired_status).toUpperCase() || null,
    gpu_type_id: text(worker.gpuTypeId || worker.gpu?.displayName || worker.machine?.gpuDisplayName) || null,
    data_center_id: text(worker.dataCenterId || worker.machine?.dataCenterId) || null,
    image: text(worker.image) || null,
    started_at: text(worker.startedAt || worker.started_at || worker.createdAt || worker.created_at) || null,
    updated_at: text(worker.updatedAt || worker.updated_at || worker.stoppedAt || worker.stopped_at) || null,
    is_stale: worker.isStale === true,
  };
}
function parseFrame(frame, workerId) {
  const lines = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
  if (!lines.length) return null;
  const payload = lines.join("\n");
  try {
    const parsed = JSON.parse(payload);
    return { worker_id: workerId, source: text(parsed.source) || "unknown", ts: text(parsed.ts) || null, line: redact(parsed.line ?? parsed.raw ?? payload).slice(0,5000) };
  } catch {
    return { worker_id: workerId, source: "unknown", ts: null, line: redact(payload).slice(0,5000) };
  }
}
async function capture(workerId, credential) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAPTURE_MS);
  const url = `${CONTROL_BASE}/serverless/${ENDPOINT_ID}/workers/${encodeURIComponent(workerId)}/logs?tail=${LOG_TAIL}`;
  const entries = [];
  let status = null;
  let contentType = null;
  let buffer = "";
  let error = null;
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${credential}`, Accept: "text/event-stream" }, signal: controller.signal });
    status = response.status;
    contentType = text(response.headers.get("content-type")) || null;
    if (!response.ok) {
      error = `RUNPOD_LOG_HTTP_${response.status}:${redact(await response.text()).slice(0,900)}`;
      return { entries, status, content_type: contentType, error };
    }
    if (!response.body) return { entries, status, content_type: contentType, error: "RUNPOD_LOG_STREAM_BODY_REQUIRED" };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      let chunk;
      try { chunk = await reader.read(); } catch (readError) { if (readError?.name === "AbortError") break; throw readError; }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const parsed = parseFrame(frame, workerId);
        if (parsed) entries.push(parsed);
      }
    }
  } catch (captureError) {
    if (captureError?.name !== "AbortError") error = redact(captureError?.message || captureError).slice(0,900);
  } finally {
    clearTimeout(timer);
  }
  if (buffer.trim()) {
    const parsed = parseFrame(buffer, workerId);
    if (parsed) entries.push(parsed);
  }
  return { entries, status, content_type: contentType, error };
}
const important = /traceback|exception|error|fatal|failed|runtimeerror|importerror|modulenotfound|cuda|nvidia|driver|device|fitness|unhealthy|heartbeat|torch|transformers|vllm|python|handler|runpod|oom|out of memory|killed|sigkill|exit code|exited|container|permission denied|no space left|cache|safetensors|model/i;
function classify(entries) {
  const joined = entries.map((entry) => entry.line).join("\n");
  const causes = [];
  if (/cuda.*driver|driver.*cuda|cuda driver version is insufficient|failed call to cuinit|libcuda/i.test(joined)) causes.push("CUDA_DRIVER_RUNTIME_FAILURE");
  if (/out of memory|\boom\b|exit code 137|sigkill|killed process/i.test(joined)) causes.push("MEMORY_OR_OOM_FAILURE");
  if (/no space left on device|disk quota exceeded|insufficient disk/i.test(joined)) causes.push("CONTAINER_DISK_FAILURE");
  if (/pull access denied|authentication required|manifest unknown|unauthorized/i.test(joined)) causes.push("IMAGE_PULL_OR_REGISTRY_FAILURE");
  if (/cached model required|snapshot not found|huggingface-cache|runpod-volume/i.test(joined)) causes.push("MODEL_CACHE_OR_VOLUME_FAILURE");
  if (/traceback|runtimeerror|exception:|importerror|modulenotfounderror/i.test(joined)) causes.push("PYTHON_OR_VLLM_STARTUP_FAILURE");
  if (/fitness.*fail|worker is unhealthy|health check.*fail/i.test(joined)) causes.push("WORKER_FITNESS_FAILURE");
  if (!causes.length && !entries.length) causes.push("NO_LOG_LINES_RETURNED");
  return [...new Set(causes)];
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpoint, workersBody] = await Promise.all([
  jsonRequest(`${REST_BASE}/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  jsonRequest(`${CONTROL_BASE}/serverless/${ENDPOINT_ID}/workers`, managementKey),
]);
const workers = list(workersBody?.workers).map(safeWorker);
const candidates = workers.filter((worker) => worker.id).slice(0,8);
if (!candidates.length) throw new Error(`${CONTRACT}_WORKER_HISTORY_REQUIRED`);
const captures = [];
for (const worker of candidates) {
  const captured = await capture(worker.id, managementKey);
  captures.push({
    worker,
    response_status: captured.status,
    content_type: captured.content_type,
    entry_count: captured.entries.length,
    likely_causes: classify(captured.entries),
    relevant_log_lines: (captured.entries.filter((entry) => important.test(entry.line)).length
      ? captured.entries.filter((entry) => important.test(entry.line))
      : captured.entries).slice(-180),
    error: captured.error,
  });
}
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint: {
    id: text(endpoint.id),
    name: text(endpoint.name),
    workers_min: Number(endpoint.workersMin ?? -1),
    workers_max: Number(endpoint.workersMax ?? -1),
    network_volume_id: text(endpoint.networkVolumeId) || null,
  },
  worker_count: workers.length,
  workers,
  captures,
  read_only: true,
  generation_submitted: false,
  endpoint_mutation_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
