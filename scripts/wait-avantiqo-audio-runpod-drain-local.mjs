const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_V1";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_MS = 5_000;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function clamp(value, min, max, fallback) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function summarizeHealth(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  const summary = {
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
  summary.active_worker_count = Object.values(summary.workers).reduce(
    (total, value) => total + finite(value, 0),
    0,
  );
  summary.drained =
    summary.jobs.in_queue === 0 &&
    summary.jobs.in_progress === 0 &&
    summary.active_worker_count === 0;
  return summary;
}

async function readHealth(endpointId, apiKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || raw).slice(0, 300);
    throw new Error(`RUNPOD_AUDIO_DRAIN_HEALTH_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return summarizeHealth(body || {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const apiKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const timeoutMs = clamp(
  process.env.AVANTIQO_AUDIO_RUNPOD_DRAIN_TIMEOUT_MS,
  30_000,
  30 * 60 * 1000,
  DEFAULT_TIMEOUT_MS,
);
const pollMs = clamp(
  process.env.AVANTIQO_AUDIO_RUNPOD_DRAIN_POLL_MS,
  1_000,
  30_000,
  DEFAULT_POLL_MS,
);
const startedAt = Date.now();
const deadline = startedAt + timeoutMs;
let latest = await readHealth(endpointId, apiKey);

console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_READ_ONLY=true");
console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_PRODUCTION_DEPLOY=false");
console.log(JSON.stringify({ event: "AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_START", health: latest }));

while (!latest.drained && Date.now() < deadline) {
  await sleep(pollMs);
  latest = await readHealth(endpointId, apiKey);
  console.log(
    JSON.stringify({
      event: "AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_PROGRESS",
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
      health: latest,
    }),
  );
}

if (!latest.drained) {
  console.error(
    JSON.stringify({
      success: false,
      contract: CONTRACT,
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
      final_health: latest,
      mutation_performed: false,
      generation_submitted: false,
      production_deploy_performed: false,
      next_action: "INSPECT_AUDIO_WORKER_DRAIN_BLOCKER",
    }),
  );
  process.exit(2);
}

console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN=COMPLETE");
console.log(
  JSON.stringify(
    {
      success: true,
      contract: CONTRACT,
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
      final_health: latest,
      mutation_performed: false,
      generation_submitted: false,
      production_deploy_performed: false,
      next_action: "SAFE_TO_APPLY_AUDIO_STORAGE_AND_TEMPLATE_REPAIR",
    },
    null,
    2,
  ),
);
