const originalFetch = globalThis.fetch.bind(globalThis);

const RETRY_DELAYS_MS = Object.freeze([1000, 2500, 5000, 10_000]);
const RUNPOD_HOSTS = new Set([
  "api.runpod.ai",
  "rest.runpod.io",
  "api.runpod.io",
]);
const TERMINAL_JOB_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "CANCELED",
]);
const ROLLBACK_GUARD_TIMEOUT_MS = 3 * 60 * 1000;
const ROLLBACK_GUARD_POLL_MS = 3000;
const AMBIGUOUS_RUN_DISCOVERY_GRACE_MS = 15_000;
const REQUIRED_QUIESCENT_SAMPLES = 3;
const endpointRunState = new Map();

function text(value) {
  return String(value ?? "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestUrl(input) {
  try {
    return new URL(typeof input === "string" || input instanceof URL ? input : input?.url);
  } catch {
    return null;
  }
}

function retryableUrl(input) {
  const url = requestUrl(input);
  return Boolean(url && RUNPOD_HOSTS.has(url.hostname));
}

function requestMethod(input, init = {}) {
  return text(init?.method || input?.method || "GET").toUpperCase() || "GET";
}

function retryableRequest(input, init = {}) {
  if (!retryableUrl(input)) return false;
  const method = requestMethod(input, init);
  if (method === "GET" || method === "HEAD") return true;

  const url = requestUrl(input);
  return Boolean(
    url &&
      method === "POST" &&
      url.hostname === "api.runpod.ai" &&
      url.pathname.includes("/cancel/"),
  );
}

function transientNetworkError(error) {
  const code = text(error?.cause?.code || error?.code).toUpperCase();
  const name = text(error?.name).toUpperCase();
  const message = text(error?.message).toLowerCase();
  return (
    name === "TYPEERROR" ||
    name === "ABORTERROR" ||
    name === "TIMEOUTERROR" ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("socket") ||
    message.includes("timed out") ||
    [
      "ECONNRESET",
      "ECONNREFUSED",
      "EAI_AGAIN",
      "ENETUNREACH",
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_SOCKET",
    ].includes(code)
  );
}

function safeUrl(input) {
  const url = requestUrl(input);
  return url ? `${url.origin}${url.pathname}` : "RUNPOD_URL";
}

function freshRetryInit(init = {}, attempt = 0) {
  if (attempt === 0 || !init?.signal?.aborted) return init;
  return {
    ...init,
    signal: AbortSignal.timeout(30_000),
  };
}

async function resilientFetch(input, init = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await originalFetch(input, freshRetryInit(init, attempt));
    } catch (error) {
      lastError = error;
      if (!transientNetworkError(error) || attempt >= RETRY_DELAYS_MS.length) throw error;
      const delayMs = RETRY_DELAYS_MS[attempt];
      console.error(JSON.stringify({
        event: "AVANTIQO_RUNPOD_TRANSIENT_FETCH_RETRY",
        request: safeUrl(input),
        method: requestMethod(input, init),
        attempt: attempt + 1,
        max_retries: RETRY_DELAYS_MS.length,
        delay_ms: delayMs,
        error: text(error?.message || error).slice(0, 300),
      }));
      await sleep(delayMs);
    }
  }
  throw lastError || new Error("AVANTIQO_RUNPOD_TRANSIENT_FETCH_RETRY_EXHAUSTED");
}

function serverlessRunEndpoint(input, init = {}) {
  const url = requestUrl(input);
  if (!url || url.hostname !== "api.runpod.ai" || requestMethod(input, init) !== "POST") {
    return null;
  }
  const match = url.pathname.match(/^\/v2\/([^/]+)\/run\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function managementEndpointPatch(input, init = {}) {
  const url = requestUrl(input);
  if (!url || url.hostname !== "rest.runpod.io" || requestMethod(input, init) !== "PATCH") {
    return null;
  }
  const match = url.pathname.match(/^\/v1\/endpoints\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function stateForEndpoint(endpointId) {
  let state = endpointRunState.get(endpointId);
  if (!state) {
    state = { knownJobIds: new Set(), ambiguousRun: false };
    endpointRunState.set(endpointId, state);
  }
  return state;
}

function runpodApiKey() {
  const key = text(process.env.RUNPOD_API_KEY);
  if (!key) throw new Error("AVANTIQO_RUNPOD_ROLLBACK_GUARD_API_KEY_REQUIRED");
  return key;
}

async function runpodServerless(endpointId, path, options = {}) {
  const apiKey = runpodApiKey();
  const response = await resilientFetch(
    `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}${path}`,
    {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { message: raw };
  }
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_RUNPOD_ROLLBACK_GUARD_HTTP_${response.status}:${text(
        body?.message || body?.error || raw,
      ).slice(0, 500)}`,
    );
  }
  return body || {};
}

function jobStatus(body = {}) {
  return text(body.status).toUpperCase();
}

function endpointLiveWork(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  return (
    Number(jobs.inQueue ?? jobs.in_queue ?? 0) +
    Number(jobs.inProgress ?? jobs.in_progress ?? 0) +
    Number(workers.initializing ?? 0) +
    Number(workers.running ?? 0)
  );
}

async function settleKnownJob(endpointId, jobId) {
  const deadline = Date.now() + ROLLBACK_GUARD_TIMEOUT_MS;
  let body = await runpodServerless(endpointId, `/status/${encodeURIComponent(jobId)}`);
  let status = jobStatus(body);

  if (!TERMINAL_JOB_STATUSES.has(status)) {
    await runpodServerless(endpointId, `/cancel/${encodeURIComponent(jobId)}`, {
      method: "POST",
    });
  }

  while (!TERMINAL_JOB_STATUSES.has(status)) {
    if (Date.now() >= deadline) {
      throw new Error(`AVANTIQO_RUNPOD_ROLLBACK_GUARD_JOB_STILL_LIVE:${jobId}:${status || "UNKNOWN"}`);
    }
    await sleep(ROLLBACK_GUARD_POLL_MS);
    body = await runpodServerless(endpointId, `/status/${encodeURIComponent(jobId)}`);
    status = jobStatus(body);
  }

  console.error(JSON.stringify({
    event: "AVANTIQO_RUNPOD_ROLLBACK_GUARD_JOB_SETTLED",
    endpoint_id: endpointId,
    job_id: jobId,
    terminal_status: status,
  }));
}

async function verifyAmbiguousRunQuiescence(endpointId) {
  const started = Date.now();
  const deadline = started + ROLLBACK_GUARD_TIMEOUT_MS;
  let consecutiveQuiescent = 0;
  let liveWorkObserved = false;

  while (true) {
    const health = await runpodServerless(endpointId, "/health");
    const workers = health.workers || {};
    if (Number(workers.unhealthy ?? 0) > 0) {
      throw new Error(
        `AVANTIQO_RUNPOD_ROLLBACK_GUARD_UNHEALTHY_WORKER:${Number(workers.unhealthy)}`,
      );
    }

    const live = endpointLiveWork(health);
    if (live > 0) {
      liveWorkObserved = true;
      consecutiveQuiescent = 0;
    } else {
      consecutiveQuiescent += 1;
    }

    const discoveryGracePassed = Date.now() - started >= AMBIGUOUS_RUN_DISCOVERY_GRACE_MS;
    if (
      live === 0 &&
      consecutiveQuiescent >= REQUIRED_QUIESCENT_SAMPLES &&
      (liveWorkObserved || discoveryGracePassed)
    ) {
      console.error(JSON.stringify({
        event: "AVANTIQO_RUNPOD_ROLLBACK_GUARD_AMBIGUOUS_RUN_QUIESCENCE_VERIFIED",
        endpoint_id: endpointId,
        live_work_observed: liveWorkObserved,
      }));
      return;
    }

    if (Date.now() >= deadline) {
      throw new Error("AVANTIQO_RUNPOD_ROLLBACK_GUARD_AMBIGUOUS_RUN_QUIESCENCE_UNVERIFIED");
    }
    await sleep(ROLLBACK_GUARD_POLL_MS);
  }
}

async function guardEndpointPatch(endpointId) {
  const state = endpointRunState.get(endpointId);
  if (!state || (!state.knownJobIds.size && !state.ambiguousRun)) return;

  console.error(JSON.stringify({
    event: "AVANTIQO_RUNPOD_ROLLBACK_GUARD_START",
    endpoint_id: endpointId,
    known_job_ids: [...state.knownJobIds],
    ambiguous_run_submission: state.ambiguousRun,
  }));

  for (const jobId of state.knownJobIds) {
    await settleKnownJob(endpointId, jobId);
  }
  if (state.ambiguousRun) {
    await verifyAmbiguousRunQuiescence(endpointId);
  }

  endpointRunState.delete(endpointId);
  console.error(JSON.stringify({
    event: "AVANTIQO_RUNPOD_ROLLBACK_GUARD_VERIFIED",
    endpoint_id: endpointId,
  }));
}

async function trackRunSubmission(input, init = {}, endpointId) {
  try {
    const response = await originalFetch(input, init);
    if (response.ok) {
      try {
        const body = await response.clone().json();
        const jobId = text(body?.id);
        if (jobId) stateForEndpoint(endpointId).knownJobIds.add(jobId);
      } catch {
        stateForEndpoint(endpointId).ambiguousRun = true;
      }
    }
    return response;
  } catch (error) {
    stateForEndpoint(endpointId).ambiguousRun = true;
    console.error(JSON.stringify({
      event: "AVANTIQO_RUNPOD_RUN_SUBMISSION_ACCEPTANCE_AMBIGUOUS",
      endpoint_id: endpointId,
      error: text(error?.message || error).slice(0, 300),
    }));
    throw error;
  }
}

globalThis.fetch = async function avantiqoRunpodResilientFetch(input, init = {}) {
  const runEndpointId = serverlessRunEndpoint(input, init);
  if (runEndpointId) {
    return trackRunSubmission(input, init, runEndpointId);
  }

  const patchEndpointId = managementEndpointPatch(input, init);
  if (patchEndpointId) {
    await guardEndpointPatch(patchEndpointId);
  }

  if (!retryableRequest(input, init)) return originalFetch(input, init);
  return resilientFetch(input, init);
};

console.error("AVANTIQO_RUNPOD_TRANSIENT_FETCH_RETRY_PRELOAD=ACTIVE");
console.error("AVANTIQO_RUNPOD_ROLLBACK_GUARD=ACTIVE");
