const REST_BASE = "https://rest.runpod.io/v1";
const baseFetch = globalThis.fetch.bind(globalThis);

function text(value) {
  return String(value ?? "").trim();
}

function stripPartialInlineTemplate(endpoint) {
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) return endpoint;
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  if (!templateId) return endpoint;
  const { template: _ignoredTemplate, ...rest } = endpoint;
  return rest;
}

globalThis.fetch = async (input, init) => {
  const response = await baseFetch(input, init);
  const url = typeof input === "string" ? input : text(input?.url);

  if (
    !response.ok ||
    !url.startsWith(`${REST_BASE}/endpoints`) ||
    !url.includes("includeTemplate=true")
  ) {
    return response;
  }

  let body = null;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }

  const canonicalInput = Array.isArray(body)
    ? body.map(stripPartialInlineTemplate)
    : stripPartialInlineTemplate(body);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(canonicalInput), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

console.log("AVANTIQO_IMAGE_BIND_CANONICAL_TEMPLATE_RESOLUTION=true");
console.log("AVANTIQO_IMAGE_BIND_CANONICAL_TEMPLATE_SOURCE=ENDPOINT_BOUND_TEMPLATE_BY_ID");
console.log("AVANTIQO_IMAGE_BIND_CANONICAL_REBUILD=false");
console.log("AVANTIQO_IMAGE_BIND_CANONICAL_GENERATION=false");
console.log("AVANTIQO_IMAGE_BIND_CANONICAL_PRODUCTION_DEPLOY=false");

await import("./refresh-avantiqo-image-runpod-worker-auto-local.mjs");
