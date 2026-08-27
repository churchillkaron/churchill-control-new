const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_READY_V1";
const WAIT_MS = Math.max(
  15_000,
  Number(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_READY_WAIT_MS || 90_000),
);
const POLL_MS = Math.max(
  500,
  Number(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_READY_POLL_MS || 1_500),
);
const REQUEST_TIMEOUT_MS = 30_000;
const endpointId = String(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID || "").trim();
const lane = String(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE || "").trim();
const baseFetch = globalThis.fetch?.bind(globalThis);

function text(value) {
  return String(value ?? "").trim();
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function requestUrl(input) {
  return typeof input === "string" || input instanceof URL ? String(input) : text(input?.url);
}
function requestMethod(input, init) {
  return text(init?.method || input?.method || "GET").toUpperCase();
}
function isLeasedRunRequest(url, method) {
  if (!endpointId || method !== "POST") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === new URL(API_BASE).origin &&
      parsed.pathname === `/v2/${endpointId}/run`
    );
  } catch {
    return false;
  }
}
async function isEndpointPaused(response) {
  if (response.status !== 409) return false;
  try {
    const body = await response.clone().json();
    return text(body?.code).toUpperCase() === "ENDPOINT_PAUSED";
  } catch {
    return false;
  }
}
function retryInit(init = {}) {
  return {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

if (typeof baseFetch !== "function") {
  throw new Error(`${CONTRACT}_FETCH_REQUIRED`);
}

if (endpointId) {
  globalThis.fetch = async (input, init = {}) => {
    const url = requestUrl(input);
    const method = requestMethod(input, init);
    if (!isLeasedRunRequest(url, method)) return baseFetch(input, init);

    const deadline = Date.now() + WAIT_MS;
    let pausedResponses = 0;
    while (true) {
      const response = await baseFetch(input, retryInit(init));
      if (!(await isEndpointPaused(response))) {
        if (pausedResponses > 0) {
          console.log(JSON.stringify({
            event: "AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_READY",
            contract: CONTRACT,
            lane: lane || null,
            endpoint_id: endpointId,
            paused_responses: pausedResponses,
            duplicate_job_retry: false,
            production_deploy_performed: false,
            secrets_printed: false,
          }));
        }
        return response;
      }

      pausedResponses += 1;
      if (Date.now() >= deadline) {
        console.error(JSON.stringify({
          event: "AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_READY_TIMEOUT",
          contract: CONTRACT,
          lane: lane || null,
          endpoint_id: endpointId,
          paused_responses: pausedResponses,
          duplicate_job_retry: false,
          production_deploy_performed: false,
          secrets_printed: false,
        }));
        return response;
      }

      if (pausedResponses === 1 || pausedResponses % 10 === 0) {
        console.log(JSON.stringify({
          event: "AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_UNPAUSE_WAIT",
          contract: CONTRACT,
          lane: lane || null,
          endpoint_id: endpointId,
          paused_responses: pausedResponses,
          provider_job_created: false,
          production_deploy_performed: false,
          secrets_printed: false,
        }));
      }
      await sleep(POLL_MS);
    }
  };
}

console.log(JSON.stringify({
  event: "AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_READY_GUARD_ACTIVE",
  contract: CONTRACT,
  lane: lane || null,
  endpoint_id_present: Boolean(endpointId),
  wait_ms: WAIT_MS,
  retry_only_on_endpoint_paused_409: true,
  duplicate_job_retry: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));
