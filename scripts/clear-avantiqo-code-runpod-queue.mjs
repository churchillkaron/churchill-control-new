const QUEUE_BASE = "https://api.runpod.ai/v2";
const APPROVAL = "YES";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function json(response) {
  return response.json().catch(() => ({}));
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
if (text(process.env.AVANTIQO_CODE_QUEUE_PURGE_APPROVED).toUpperCase() !== APPROVAL) {
  throw new Error("AVANTIQO_CODE_QUEUE_PURGE_APPROVED_YES_REQUIRED");
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function healthSnapshot() {
  const response = await fetch(`${QUEUE_BASE}/${endpointId}/health`, { headers });
  const body = await json(response);
  if (!response.ok) {
    throw new Error(`RUNPOD_ENDPOINT_HEALTH_HTTP_${response.status}:${text(body?.error || body?.message)}`);
  }
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  return {
    jobs: {
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      in_progress: number(jobs.inProgress),
      in_queue: number(jobs.inQueue),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}

const before = await healthSnapshot();
if (before.jobs.in_progress > 0 || before.workers.running > 0) {
  throw new Error(
    `AVANTIQO_CODE_QUEUE_PURGE_REFUSED_ACTIVE_WORK:${JSON.stringify({
      in_progress: before.jobs.in_progress,
      running: before.workers.running,
    })}`,
  );
}

if (before.jobs.in_queue === 0) {
  console.log(JSON.stringify({
    success: true,
    contract: "AVANTIQO_CODE_RUNPOD_QUEUE_PURGE_V1",
    endpoint_id: endpointId,
    mutation_performed: false,
    reason: "QUEUE_ALREADY_CLEAN",
    before,
    after: before,
    provider_job_submitted: false,
    generation_performed: false,
  }, null, 2));
  process.exit(0);
}

const purgeResponse = await fetch(`${QUEUE_BASE}/${endpointId}/purge-queue`, {
  method: "POST",
  headers,
});
const purgeBody = await json(purgeResponse);
if (!purgeResponse.ok) {
  throw new Error(
    `RUNPOD_PURGE_QUEUE_HTTP_${purgeResponse.status}:${text(purgeBody?.error || purgeBody?.message)}`,
  );
}

await new Promise((resolve) => setTimeout(resolve, 1500));
const after = await healthSnapshot();
const success = after.jobs.in_queue === 0;

console.log(JSON.stringify({
  success,
  contract: "AVANTIQO_CODE_RUNPOD_QUEUE_PURGE_V1",
  endpoint_id: endpointId,
  mutation_performed: true,
  purged_pending_jobs: before.jobs.in_queue,
  before,
  purge_response: {
    status: text(purgeBody?.status) || null,
  },
  after,
  provider_job_submitted: false,
  generation_performed: false,
}, null, 2));

if (!success) process.exitCode = 1;
