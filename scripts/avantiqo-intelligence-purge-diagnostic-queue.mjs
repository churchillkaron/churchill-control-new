import {
  getAvantiqoIntelligenceEndpointHealth,
} from "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";

function text(value) {
  return String(value ?? "").trim();
}

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID);
const apiKey = text(process.env.RUNPOD_API_KEY);
if (!endpointId) throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_REQUIRED");
if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");

const before = await getAvantiqoIntelligenceEndpointHealth();
const queued = n(before?.jobs?.inQueue);
const inProgress = n(before?.jobs?.inProgress);
console.log(
  `AVANTIQO_DIAGNOSTIC_QUEUE_BEFORE workers_running=${n(before?.workers?.running)} workers_idle=${n(before?.workers?.idle)} jobs_in_queue=${queued} jobs_in_progress=${inProgress}`,
);

if (inProgress > 0) {
  throw new Error("AVANTIQO_DIAGNOSTIC_QUEUE_CLEANUP_REFUSED_IN_PROGRESS_JOB_PRESENT");
}

if (queued > 0) {
  const response = await fetch(`${RUNPOD_API_BASE}/${endpointId}/purge-queue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`RUNPOD_PURGE_QUEUE_FAILED:${response.status}:${text(raw).slice(0, 500)}`);
  }
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  console.log(`AVANTIQO_DIAGNOSTIC_QUEUE_PURGED removed=${n(body?.removed)}`);
}

const after = await getAvantiqoIntelligenceEndpointHealth();
console.log(
  `AVANTIQO_DIAGNOSTIC_QUEUE_AFTER workers_running=${n(after?.workers?.running)} workers_idle=${n(after?.workers?.idle)} jobs_in_queue=${n(after?.jobs?.inQueue)} jobs_in_progress=${n(after?.jobs?.inProgress)}`,
);

if (n(after?.jobs?.inQueue) !== 0 || n(after?.jobs?.inProgress) !== 0) {
  throw new Error("AVANTIQO_DIAGNOSTIC_QUEUE_NOT_CLEAN");
}

console.log("AVANTIQO_INTELLIGENCE_DIAGNOSTIC_QUEUE_CLEANUP=PASS");
