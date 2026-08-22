import {
  getAvantiqoIntelligenceEndpointHealth,
  probeAvantiqoIntelligenceRuntime,
} from "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const MAX_WAIT_MS = 180000;
const POLL_MS = 2000;

function text(value) {
  return String(value ?? "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function environment() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!endpointId) throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_REQUIRED");
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  return { endpointId, apiKey };
}

async function requestJson(url, { apiKey, method = "GET", body = undefined, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await response.text();
    let parsed = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = {};
    }
    if (!response.ok) {
      throw new Error(
        `RUNPOD_DIAGNOSTIC_REQUEST_FAILED:${response.status}:${text(parsed?.error?.message || parsed?.error || raw).slice(0, 800)}`,
      );
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function statusName(payload = {}) {
  return text(payload?.status || payload?.state).toUpperCase();
}

const { endpointId, apiKey } = environment();
const apiBase = `${RUNPOD_API_BASE}/${endpointId}`;
const startedAt = Date.now();

const initialHealth = await getAvantiqoIntelligenceEndpointHealth();
console.log(
  `AVANTIQO_COLDSTART_INITIAL_HEALTH latency_ms=${initialHealth.latency_ms} workers_running=${Number(initialHealth.workers?.running || 0)} workers_idle=${Number(initialHealth.workers?.idle || 0)} jobs_in_progress=${Number(initialHealth.jobs?.inProgress || 0)} jobs_in_queue=${Number(initialHealth.jobs?.inQueue || 0)}`,
);

const warmup = await requestJson(`${apiBase}/run`, {
  apiKey,
  method: "POST",
  timeoutMs: 20000,
  body: {
    input: {
      route: "/v1/chat/completions",
      method: "POST",
      body: {
        model: MODEL,
        messages: [
          { role: "user", content: "Reply with the single word READY." },
        ],
        temperature: 0,
        max_tokens: 16,
      },
    },
  },
});

const jobId = text(warmup?.id);
if (!jobId) throw new Error("RUNPOD_WARMUP_JOB_ID_MISSING");
console.log("AVANTIQO_COLDSTART_WARMUP_QUEUED=true");

let finalStatus = null;
let firstWorkerSeenMs = null;
let firstProgressSeenMs = null;

while (Date.now() - startedAt < MAX_WAIT_MS) {
  let health = null;
  try {
    health = await getAvantiqoIntelligenceEndpointHealth();
    const running = Number(health.workers?.running || 0);
    const idle = Number(health.workers?.idle || 0);
    const inProgress = Number(health.jobs?.inProgress || 0);
    if (firstWorkerSeenMs === null && running + idle > 0) {
      firstWorkerSeenMs = Date.now() - startedAt;
      console.log(
        `AVANTIQO_COLDSTART_WORKER_VISIBLE elapsed_ms=${firstWorkerSeenMs} running=${running} idle=${idle}`,
      );
    }
    if (firstProgressSeenMs === null && inProgress > 0) {
      firstProgressSeenMs = Date.now() - startedAt;
      console.log(
        `AVANTIQO_COLDSTART_JOB_STARTED elapsed_ms=${firstProgressSeenMs}`,
      );
    }
  } catch (error) {
    console.log(
      `AVANTIQO_COLDSTART_HEALTH_POLL_ERROR=${text(error?.message || error).slice(0, 300)}`,
    );
  }

  try {
    finalStatus = await requestJson(`${apiBase}/status/${encodeURIComponent(jobId)}`, {
      apiKey,
      timeoutMs: 15000,
    });
    const state = statusName(finalStatus);
    if (["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(state)) {
      break;
    }
  } catch (error) {
    console.log(
      `AVANTIQO_COLDSTART_STATUS_POLL_ERROR=${text(error?.message || error).slice(0, 300)}`,
    );
  }

  await sleep(POLL_MS);
}

if (!finalStatus) throw new Error("RUNPOD_WARMUP_STATUS_UNAVAILABLE");
const finalState = statusName(finalStatus);
const coldStartMs = Date.now() - startedAt;
console.log(
  `AVANTIQO_COLDSTART_WARMUP_FINISHED state=${finalState || "UNKNOWN"} elapsed_ms=${coldStartMs} delay_ms=${Number(finalStatus?.delayTime || 0)} execution_ms=${Number(finalStatus?.executionTime || 0)} first_worker_ms=${firstWorkerSeenMs ?? -1} first_progress_ms=${firstProgressSeenMs ?? -1}`,
);

if (finalState !== "COMPLETED") {
  throw new Error(
    `RUNPOD_WARMUP_JOB_${finalState || "UNKNOWN"}:${text(finalStatus?.error).slice(0, 1000)}`,
  );
}

const warmHealth = await getAvantiqoIntelligenceEndpointHealth();
console.log(
  `AVANTIQO_COLDSTART_WARM_HEALTH workers_running=${Number(warmHealth.workers?.running || 0)} workers_idle=${Number(warmHealth.workers?.idle || 0)} jobs_in_progress=${Number(warmHealth.jobs?.inProgress || 0)} jobs_in_queue=${Number(warmHealth.jobs?.inQueue || 0)}`,
);

const probe = await probeAvantiqoIntelligenceRuntime({ health: warmHealth });
console.log(
  `AVANTIQO_COLDSTART_CERTIFICATION success=${probe.success} structured_output=${probe.structured_output_ok} native_tool_call=${probe.native_tool_call_ok} reasoning_transport_detected=${probe.reasoning_transport_detected} completion_latency_ms=${probe.completion_latency_ms} tool_latency_ms=${probe.tool_latency_ms} input_tokens=${probe.usage?.input_tokens || 0} output_tokens=${probe.usage?.output_tokens || 0}`,
);

if (!probe.success) {
  throw new Error("AVANTIQO_WARM_RUNTIME_CERTIFICATION_FAILED");
}

console.log("AVANTIQO_INTELLIGENCE_COLDSTART_DIAGNOSTIC=PASS");
