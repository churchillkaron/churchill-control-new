import process from "node:process";
import { spawn } from "node:child_process";

const ENDPOINT_ID = String(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID || "").trim();
const MANAGEMENT_KEY = String(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY || "").trim();
const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const EXPECTED_IMAGE_DIGEST = "sha256:fa6559a184998d75fb6430ea9fa303fe7b6c1af0da441e61ac4bd587b2bdf3c6";

if (!ENDPOINT_ID) throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_REQUIRED");
if (!MANAGEMENT_KEY) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");

const redact = (value) => String(value ?? "")
  .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
  .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
  .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");

async function jsonRequest(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${MANAGEMENT_KEY}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`CODE_STARTUP_EVIDENCE_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0,500)}`);
  return body;
}

function parseSseFrame(frame, workerId) {
  const lines = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
  if (!lines.length) return null;
  const payload = lines.join("\n");
  try {
    const parsed = JSON.parse(payload);
    return {
      worker_id: workerId,
      source: String(parsed.source || "unknown"),
      ts: parsed.ts || null,
      line: redact(parsed.line ?? parsed.raw ?? payload).slice(0,4000),
    };
  } catch {
    return { worker_id: workerId, source: "unknown", ts: null, line: redact(payload).slice(0,4000) };
  }
}

async function captureLogs(workerId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const entries = [];
  let buffer = "";
  try {
    const response = await fetch(`${CONTROL_BASE}/serverless/${ENDPOINT_ID}/workers/${encodeURIComponent(workerId)}/logs?tail=1200`, {
      headers: { Authorization: `Bearer ${MANAGEMENT_KEY}`, Accept: "text/event-stream" },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return { status: response.status, entries };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      let chunk;
      try { chunk = await reader.read(); } catch (error) { if (error?.name === "AbortError") break; throw error; }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const parsed = parseSseFrame(frame, workerId);
        if (parsed) entries.push(parsed);
      }
    }
    return { status: response.status, entries };
  } catch (error) {
    if (error?.name === "AbortError") return { status: 200, entries };
    return { status: null, entries, error: redact(error?.message || error).slice(0,500) };
  } finally {
    clearTimeout(timer);
  }
}

async function captureEvidence(childExitCode) {
  try {
    const endpoint = await jsonRequest(`${REST_BASE}/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`);
    const workers = Array.isArray(endpoint?.workers) ? endpoint.workers : [];
    const safeWorkers = workers.slice(0,4).map((worker) => ({
      id: String(worker?.id || "") || null,
      status: String(worker?.status || worker?.workerStatus || worker?.runtimeStatus || "").toUpperCase() || null,
      desired_status: String(worker?.desiredStatus || worker?.desired_status || "").toUpperCase() || null,
      gpu_type_id: String(worker?.gpuTypeId || worker?.gpu?.displayName || worker?.machine?.gpuDisplayName || "") || null,
      data_center_id: String(worker?.dataCenterId || worker?.machine?.dataCenterId || "") || null,
      image: String(worker?.image || "") || null,
    }));
    const captures = [];
    for (const worker of safeWorkers.filter((item) => item.id)) {
      const logs = await captureLogs(worker.id);
      const relevant = logs.entries.filter((entry) => /error|exception|traceback|failed|deep.?gemm|vllm|cuda|oom|out of memory|model ready|start container|create container|pull|download|safetensors|engine|serverless|worker/i.test(entry.line));
      captures.push({
        worker,
        log_status: logs.status,
        error: logs.error || null,
        relevant_log_lines: (relevant.length ? relevant : logs.entries).slice(-140),
      });
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_RUNTIME_STARTUP_EVIDENCE",
      child_exit_code: childExitCode,
      endpoint: {
        id: String(endpoint?.id || ""),
        name: String(endpoint?.name || ""),
        workers_min: Number(endpoint?.workersMin ?? -1),
        workers_max: Number(endpoint?.workersMax ?? -1),
        network_volume_id: String(endpoint?.networkVolumeId || "") || null,
      },
      expected_image_digest: EXPECTED_IMAGE_DIGEST,
      workers: safeWorkers,
      expected_image_seen: safeWorkers.some((worker) => worker.image.includes(EXPECTED_IMAGE_DIGEST)),
      captures,
      generation_performed: false,
      wallet_mutation_performed: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_RUNTIME_STARTUP_EVIDENCE_FAILED",
      child_exit_code: childExitCode,
      error: redact(error?.message || error).slice(0,800),
      generation_performed: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }));
  }
}

const child = spawn(process.execPath, ["scripts/probe-avantiqo-code-runtime.mjs"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(Number.isInteger(code) ? code : 1));
});

await captureEvidence(exitCode);
process.exit(exitCode);
