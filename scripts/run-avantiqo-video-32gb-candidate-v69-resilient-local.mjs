#!/usr/bin/env node

const nativeFetch = globalThis.fetch.bind(globalThis);
const TRANSIENT_READ_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const READ_ATTEMPTS = 4;
const BACKOFF_MS = [0, 750, 1500, 3000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const methodOf = (init = {}) => String(init?.method || "GET").toUpperCase();

function errorCode(error) {
  return String(error?.cause?.code || error?.code || error?.name || "FETCH_FAILED");
}

globalThis.fetch = async (input, init = {}) => {
  const method = methodOf(init);
  const attempts = method === "GET" ? READ_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await sleep(BACKOFF_MS[attempt - 1] || 0);

    try {
      const response = await nativeFetch(input, init);
      if (
        method === "GET" &&
        attempt < attempts &&
        TRANSIENT_READ_STATUSES.has(Number(response?.status))
      ) {
        try { await response.body?.cancel(); } catch {}
        console.error(
          `AVANTIQO_VIDEO_V69_READ_RETRY status=${response.status} attempt=${attempt}/${attempts}`,
        );
        continue;
      }
      return response;
    } catch (error) {
      if (method !== "GET" || attempt >= attempts) throw error;
      console.error(
        `AVANTIQO_VIDEO_V69_READ_RETRY error=${errorCode(error)} attempt=${attempt}/${attempts}`,
      );
    }
  }

  throw new Error("AVANTIQO_VIDEO_V69_READ_RETRY_EXHAUSTED");
};

console.error("AVANTIQO_VIDEO_V69_RESILIENT_READ_TRANSPORT=ENABLED");
console.error("AVANTIQO_VIDEO_V69_MUTATION_RETRY=DISABLED");

await import("./provision-avantiqo-video-32gb-candidate-v69-local.mjs");
