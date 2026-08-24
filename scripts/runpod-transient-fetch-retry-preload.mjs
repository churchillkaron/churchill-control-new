const originalFetch = globalThis.fetch.bind(globalThis);

const RETRY_DELAYS_MS = Object.freeze([1000, 2500, 5000, 10_000]);
const RUNPOD_HOSTS = new Set([
  "api.runpod.ai",
  "rest.runpod.io",
  "api.runpod.io",
]);

function text(value) {
  return String(value ?? "").trim();
}

function retryableUrl(input) {
  try {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input?.url);
    if (!RUNPOD_HOSTS.has(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function requestMethod(input, init = {}) {
  return text(init?.method || input?.method || "GET").toUpperCase() || "GET";
}

function retryableRequest(input, init = {}) {
  if (!retryableUrl(input)) return false;
  const method = requestMethod(input, init);
  if (method === "GET" || method === "HEAD") return true;

  try {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input?.url);
    return method === "POST" && url.hostname === "api.runpod.ai" && url.pathname.includes("/cancel/");
  } catch {
    return false;
  }
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
  try {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input?.url);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "RUNPOD_URL";
  }
}

globalThis.fetch = async function avantiqoRunpodResilientFetch(input, init = {}) {
  if (!retryableRequest(input, init)) return originalFetch(input, init);

  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await originalFetch(input, init);
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
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error("AVANTIQO_RUNPOD_TRANSIENT_FETCH_RETRY_EXHAUSTED");
};

console.error("AVANTIQO_RUNPOD_TRANSIENT_FETCH_RETRY_PRELOAD=ACTIVE");
