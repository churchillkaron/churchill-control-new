import { fileURLToPath } from "node:url";

const QUEUE_BASE = "https://api.runpod.ai/v2";
const SELF_URL = new URL(import.meta.url).href;
const PRELOAD_ONLY = process.env.AVANTIQO_IMAGE_CACHE_STABILIZER_PRELOAD_ONLY === "1";
const QUIESCENCE_TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.AVANTIQO_IMAGE_CACHE_STABILIZER_TIMEOUT_MS || 3 * 60 * 1000),
);
const QUIESCENCE_POLL_MS = Math.max(
  1_000,
  Number(process.env.AVANTIQO_IMAGE_CACHE_STABILIZER_POLL_MS || 3_000),
);

const baseFetch = globalThis.fetch.bind(globalThis);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function healthCounters(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}

function blockingActivity(counters) {
  return (
    counters.jobs.in_queue +
    counters.jobs.in_progress +
    counters.workers.initializing +
    counters.workers.running +
    counters.workers.throttled +
    counters.workers.unhealthy
  );
}

function isHealthUrl(url) {
  return url.startsWith(`${QUEUE_BASE}/`) && /\/health(?:\?|$)/.test(url);
}

async function parseJson(response) {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function responseWithBody(response, body) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizeHarmlessWorkers(body = {}) {
  return {
    ...body,
    workers: {
      ...(body?.workers || {}),
      idle: 0,
      ready: 0,
    },
  };
}

async function stableHealth(input, init, initialResponse) {
  let response = initialResponse;
  let body = await parseJson(response);
  if (!response.ok || !body) return response;

  const deadline = Date.now() + QUIESCENCE_TIMEOUT_MS;
  let lastPrinted = 0;
  let consecutiveSafeReads = 0;

  while (true) {
    const counters = healthCounters(body);
    const blocking = blockingActivity(counters);

    if (blocking === 0) {
      consecutiveSafeReads += 1;
      if (consecutiveSafeReads >= 2) {
        if (counters.workers.idle || counters.workers.ready) {
          console.log(
            `AVANTIQO_IMAGE_CACHE_STABILIZER_LINGERING_WORKERS_IGNORED idle=${counters.workers.idle} ready=${counters.workers.ready}`,
          );
        }
        return responseWithBody(response, normalizeHarmlessWorkers(body));
      }
      await sleep(Math.min(1_500, QUIESCENCE_POLL_MS));
    } else {
      consecutiveSafeReads = 0;
      if (Date.now() >= deadline) {
        console.log(
          `AVANTIQO_IMAGE_CACHE_STABILIZER_QUIESCENCE_TIMEOUT jobs=${counters.jobs.in_queue + counters.jobs.in_progress} initializing=${counters.workers.initializing} running=${counters.workers.running} throttled=${counters.workers.throttled} unhealthy=${counters.workers.unhealthy} idle=${counters.workers.idle} ready=${counters.workers.ready}`,
        );
        return response;
      }
      if (Date.now() - lastPrinted >= 15_000) {
        console.log(
          `AVANTIQO_IMAGE_CACHE_STABILIZER_WAIT jobs=${counters.jobs.in_queue + counters.jobs.in_progress} initializing=${counters.workers.initializing} running=${counters.workers.running} throttled=${counters.workers.throttled} unhealthy=${counters.workers.unhealthy}`,
        );
        lastPrinted = Date.now();
      }
      await sleep(QUIESCENCE_POLL_MS);
    }

    response = await baseFetch(input, init);
    body = await parseJson(response);
    if (!response.ok || !body) return response;
  }
}

globalThis.fetch = async (input, init) => {
  const response = await baseFetch(input, init);
  const url = typeof input === "string" ? input : text(input?.url);
  if (!response.ok || !isHealthUrl(url)) return response;
  return stableHealth(input, init, response);
};

if (!PRELOAD_ONLY) {
  const existingNodeOptions = text(process.env.NODE_OPTIONS);
  const importOption = `--import=${SELF_URL}`;
  process.env.NODE_OPTIONS = existingNodeOptions.includes(importOption)
    ? existingNodeOptions
    : `${existingNodeOptions} ${importOption}`.trim();
  process.env.AVANTIQO_IMAGE_CACHE_STABILIZER_PRELOAD_ONLY = "1";

  console.log("AVANTIQO_IMAGE_CACHE_STABILIZER_ACTIVE=true");
  console.log("AVANTIQO_IMAGE_CACHE_STABILIZER_BUSY_DEFINITION=JOBS_PLUS_ACTIVE_WORKERS");
  console.log("AVANTIQO_IMAGE_CACHE_STABILIZER_IDLE_READY_BLOCK_MUTATION=false");
  console.log("AVANTIQO_IMAGE_CACHE_STABILIZER_CHILD_PRELOAD=true");
  console.log("AVANTIQO_IMAGE_CACHE_STABILIZER_IMAGE_GENERATION=false");
  console.log("AVANTIQO_IMAGE_CACHE_STABILIZER_PRODUCTION_DEPLOY=false");

  await import("./cache-avantiqo-image-2512-recover-local.mjs");
} else {
  void fileURLToPath(import.meta.url);
}
