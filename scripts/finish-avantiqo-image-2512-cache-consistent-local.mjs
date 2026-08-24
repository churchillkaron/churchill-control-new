const REST_BASE = "https://rest.runpod.io/v1";
const TEMPLATE_BIND_WAIT_MS = Math.max(
  15_000,
  Number(process.env.AVANTIQO_IMAGE_TEMPLATE_BIND_WAIT_MS || 90_000),
);
const TEMPLATE_BIND_POLL_MS = Math.max(
  500,
  Number(process.env.AVANTIQO_IMAGE_TEMPLATE_BIND_POLL_MS || 1_500),
);
const baseFetch = globalThis.fetch.bind(globalThis);
const pendingTemplateImages = new Map();

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
function updateTemplateId(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/^\/v1\/templates\/([^/]+)\/update$/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}
function requestedImageName(init) {
  if (typeof init?.body !== "string") return "";
  try {
    return text(JSON.parse(init.body)?.imageName);
  } catch {
    return "";
  }
}
async function templateList(response) {
  try {
    const body = await response.clone().json();
    return Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
function unresolvedBindings(templates) {
  return [...pendingTemplateImages.entries()].filter(([templateId, imageName]) => {
    const template = templates.find((candidate) => text(candidate?.id) === templateId);
    return text(template?.imageName) !== imageName;
  });
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
    method === "GET" &&
    url.startsWith(`${REST_BASE}/templates?`) &&
    pendingTemplateImages.size > 0
  ) {
    const deadline = Date.now() + TEMPLATE_BIND_WAIT_MS;
    let lastResponse = null;
    let lastUnresolved = [];

    while (Date.now() <= deadline) {
      lastResponse = await baseFetch(input, init);
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

  return baseFetch(input, init);
};

console.log("AVANTIQO_IMAGE_FINISH_TEMPLATE_PROPAGATION_GUARD=true");
console.log(`AVANTIQO_IMAGE_FINISH_TEMPLATE_PROPAGATION_WAIT_MS=${TEMPLATE_BIND_WAIT_MS}`);
console.log("AVANTIQO_IMAGE_FINISH_TEMPLATE_PROPAGATION_GENERATION=false");
console.log("AVANTIQO_IMAGE_FINISH_TEMPLATE_PROPAGATION_PRODUCTION_DEPLOY=false");

await import("./finish-avantiqo-image-2512-cache-local.mjs");
