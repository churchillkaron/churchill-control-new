const API_BASE = "https://api.runpod.ai/v2";
const UNPAUSE_WAIT_MS = Math.max(
  15_000,
  Number(process.env.AVANTIQO_CODE_ENDPOINT_UNPAUSE_WAIT_MS || 90_000),
);
const UNPAUSE_POLL_MS = Math.max(
  500,
  Number(process.env.AVANTIQO_CODE_ENDPOINT_UNPAUSE_POLL_MS || 1_500),
);
const REQUEST_TIMEOUT_MS = 30_000;
const baseFetch = globalThis.fetch.bind(globalThis);

function text(value) {
  return String(value ?? "").trim();
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function requestUrl(input) {
  return typeof input === "string" ? input : text(input?.url);
}
function requestMethod(input, init) {
  return text(init?.method || input?.method || "GET").toUpperCase();
}
function isRunRequest(url, method) {
  if (method !== "POST" || !url.startsWith(`${API_BASE}/`) || !url.endsWith("/run")) return false;
  try {
    return /^\/v2\/[^/]+\/run$/.test(new URL(url).pathname);
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

globalThis.fetch = async (input, init) => {
  const url = requestUrl(input);
  const method = requestMethod(input, init);
  if (!isRunRequest(url, method)) return baseFetch(input, init);

  const deadline = Date.now() + UNPAUSE_WAIT_MS;
  let retries = 0;
  while (true) {
    const response = await baseFetch(input, retryInit(init));
    if (!(await isEndpointPaused(response))) {
      if (retries > 0) {
        console.log(`AVANTIQO_CODE_ENDPOINT_READY=true retries=${retries}`);
      }
      return response;
    }

    retries += 1;
    if (Date.now() >= deadline) {
      console.log(`AVANTIQO_CODE_ENDPOINT_READY_TIMEOUT=true retries=${retries}`);
      return response;
    }
    if (retries === 1 || retries % 10 === 0) {
      console.log(`AVANTIQO_CODE_ENDPOINT_UNPAUSE_WAIT=true retries=${retries}`);
    }
    await sleep(UNPAUSE_POLL_MS);
  }
};

console.log("AVANTIQO_CODE_ENDPOINT_READY_GUARD=true");
console.log(`AVANTIQO_CODE_ENDPOINT_READY_WAIT_MS=${UNPAUSE_WAIT_MS}`);
console.log("AVANTIQO_CODE_ENDPOINT_READY_RETRY_ONLY_ON_409_PAUSED=true");
console.log("AVANTIQO_CODE_ENDPOINT_READY_DUPLICATE_JOB_RETRY=false");
