const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const TEMPLATE_BIND_WAIT_MS = Math.max(
  15_000,
  Number(process.env.AVANTIQO_IMAGE_TEMPLATE_BIND_WAIT_MS || 90_000),
);
const TEMPLATE_BIND_POLL_MS = Math.max(
  500,
  Number(process.env.AVANTIQO_IMAGE_TEMPLATE_BIND_POLL_MS || 1_500),
);
const ENDPOINT_UNPAUSE_WAIT_MS = Math.max(
  15_000,
  Number(process.env.AVANTIQO_IMAGE_ENDPOINT_UNPAUSE_WAIT_MS || 90_000),
);
const ENDPOINT_UNPAUSE_POLL_MS = Math.max(
  500,
  Number(process.env.AVANTIQO_IMAGE_ENDPOINT_UNPAUSE_POLL_MS || 1_500),
);
const baseFetch = globalThis.fetch.bind(globalThis);
const pendingTemplateImages = new Map();
const pendingEndpointUnpauses = new Set();

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
function requestJson(init) {
  if (typeof init?.body !== "string") return null;
  try {
    const parsed = JSON.parse(init.body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function updateTemplateId(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/^\/v1\/templates\/([^/]+)\/update$/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}
function endpointPatchId(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/^\/v1\/endpoints\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}
function queueRunEndpointId(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/^\/v2\/([^/]+)\/run$/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}
function requestedImageName(init) {
  return text(requestJson(init)?.imageName);
}
async function templateList(response) {
  try {
    const body = await response.clone().json();
    return Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
async function endpointPausedConflict(response) {
  if (response.status !== 409) return false;
  try {
    const body = await response.clone().json();
    return text(body?.code).toUpperCase() === "ENDPOINT_PAUSED";
  } catch {
    return false;
  }
}
function unresolvedBindings(templates) {
  return [...pendingTemplateImages.entries()].filter(([templateId, imageName]) => {
    const template = templates.find((candidate) => text(candidate?.id) === templateId);
    return text(template?.imageName) !== imageName;
  });
}
function retryInit(init) {
  return {
    ...init,
    signal: AbortSignal.timeout(30_000),
  };
}

globalThis.fetch = async (input, init) => {
  const url = requestUrl(input);
  const method = requestMethod(input, init);

  if (
    method === "POST" &&
    url.startsWith(`${REST_BASE}/templates/`) &&
    url.endsWith("/update")
  ) {
    const response = await baseFetch(input, init);
    const templateId = updateTemplateId(url);
    const imageName = requestedImageName(init);
    if (response.ok && templateId && imageName) {
      pendingTemplateImages.set(templateId, imageName);
      console.log(`AVANTIQO_IMAGE_TEMPLATE_BIND_PROPAGATION_PENDING=true template_id=${templateId}`);
    }
    return response;
  }

  if (
    method === "PATCH" &&
    url.startsWith(`${REST_BASE}/endpoints/`)
  ) {
    const response = await baseFetch(input, init);
    if (!response.ok) return response;

    const endpointId = endpointPatchId(url);
    const body = requestJson(init);
    if (endpointId && Object.prototype.hasOwnProperty.call(body || {}, "workersMax")) {
      const workersMax = Number(body.workersMax);
      if (workersMax > 0) {
        pendingEndpointUnpauses.add(endpointId);
        console.log(`AVANTIQO_IMAGE_ENDPOINT_UNPAUSE_PROPAGATION_PENDING=true endpoint_id=${endpointId}`);
      } else if (workersMax === 0) {
        pendingEndpointUnpauses.delete(endpointId);
      }
    }
    return response;
  }

  if (
    method === "GET" &&
    url.startsWith(`${REST_BASE}/templates?`) &&
    pendingTemplateImages.size > 0
  ) {
    const deadline = Date.now() + TEMPLATE_BIND_WAIT_MS;
    let lastResponse = null;
    let lastUnresolved = [];

    while (Date.now() <= deadline) {
      lastResponse = await baseFetch(input, retryInit(init));
      if (!lastResponse.ok) return lastResponse;
      const templates = await templateList(lastResponse);
      if (!templates) return lastResponse;

      lastUnresolved = unresolvedBindings(templates);
      if (lastUnresolved.length === 0) {
        for (const [templateId] of pendingTemplateImages) {
          console.log(`AVANTIQO_IMAGE_TEMPLATE_BIND_PROPAGATED=true template_id=${templateId}`);
        }
        pendingTemplateImages.clear();
        return lastResponse;
      }

      await sleep(TEMPLATE_BIND_POLL_MS);
    }

    console.log(
      `AVANTIQO_IMAGE_TEMPLATE_BIND_PROPAGATION_TIMEOUT=true pending=${lastUnresolved
        .map(([templateId]) => templateId)
        .join("|")}`,
    );
    return lastResponse;
  }

  if (
    method === "POST" &&
    url.startsWith(`${QUEUE_BASE}/`) &&
    url.endsWith("/run")
  ) {
    const endpointId = queueRunEndpointId(url);
    if (!endpointId || !pendingEndpointUnpauses.has(endpointId)) {
      return baseFetch(input, init);
    }

    const deadline = Date.now() + ENDPOINT_UNPAUSE_WAIT_MS;
    let lastResponse = null;
    let retryCount = 0;

    while (Date.now() <= deadline) {
      lastResponse = await baseFetch(input, retryInit(init));
      if (!(await endpointPausedConflict(lastResponse))) {
        pendingEndpointUnpauses.delete(endpointId);
        if (retryCount > 0) {
          console.log(
            `AVANTIQO_IMAGE_ENDPOINT_UNPAUSE_PROPAGATED=true endpoint_id=${endpointId} retries=${retryCount}`,
          );
        }
        return lastResponse;
      }

      retryCount += 1;
      if (retryCount === 1 || retryCount % 10 === 0) {
        console.log(
          `AVANTIQO_IMAGE_ENDPOINT_UNPAUSE_WAIT=true endpoint_id=${endpointId} retries=${retryCount}`,
        );
      }
      await sleep(ENDPOINT_UNPAUSE_POLL_MS);
    }

    console.log(
      `AVANTIQO_IMAGE_ENDPOINT_UNPAUSE_PROPAGATION_TIMEOUT=true endpoint_id=${endpointId} retries=${retryCount}`,
    );
    return lastResponse;
  }

  return baseFetch(input, init);
};

console.log("AVANTIQO_IMAGE_FINISH_TEMPLATE_PROPAGATION_GUARD=true");
console.log(`AVANTIQO_IMAGE_FINISH_TEMPLATE_PROPAGATION_WAIT_MS=${TEMPLATE_BIND_WAIT_MS}`);
console.log("AVANTIQO_IMAGE_FINISH_ENDPOINT_UNPAUSE_PROPAGATION_GUARD=true");
console.log(`AVANTIQO_IMAGE_FINISH_ENDPOINT_UNPAUSE_WAIT_MS=${ENDPOINT_UNPAUSE_WAIT_MS}`);
console.log("AVANTIQO_IMAGE_FINISH_ENDPOINT_UNPAUSE_RETRY_ONLY_ON_409_PAUSED=true");
console.log("AVANTIQO_IMAGE_FINISH_TEMPLATE_PROPAGATION_GENERATION=false");
console.log("AVANTIQO_IMAGE_FINISH_TEMPLATE_PROPAGATION_PRODUCTION_DEPLOY=false");

await import("./finish-avantiqo-image-2512-cache-local.mjs");
