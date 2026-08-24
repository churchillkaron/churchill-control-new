const REST_BASE = "https://rest.runpod.io/v1";
const baseFetch = globalThis.fetch.bind(globalThis);
let networkVolumeMapPromise = null;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean))];
}

function stripPartialInlineTemplate(endpoint) {
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) return endpoint;
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  if (!templateId) return endpoint;
  const { template: _ignoredTemplate, ...rest } = endpoint;
  return rest;
}

async function networkVolumeMap(init) {
  if (!networkVolumeMapPromise) {
    networkVolumeMapPromise = (async () => {
      const response = await baseFetch(`${REST_BASE}/networkvolumes`, {
        headers: new Headers(init?.headers || {}),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return new Map();
      let volumes = null;
      try {
        volumes = await response.json();
      } catch {
        return new Map();
      }
      if (!Array.isArray(volumes)) return new Map();
      return new Map(
        volumes
          .map((volume) => [text(volume?.id), text(volume?.dataCenterId)])
          .filter(([id, dataCenterId]) => id && dataCenterId),
      );
    })().catch(() => new Map());
  }
  return networkVolumeMapPromise;
}

async function canonicalizeEndpoint(endpoint, init) {
  const canonical = stripPartialInlineTemplate(endpoint);
  if (!canonical || typeof canonical !== "object" || Array.isArray(canonical)) return canonical;
  const volumeIds = endpointVolumeIds(canonical);
  if (!volumeIds.length) return canonical;

  const byVolume = await networkVolumeMap(init);
  const dataCenterIds = [...new Set(volumeIds.map((id) => byVolume.get(id)).filter(Boolean))];
  if (dataCenterIds.length !== volumeIds.length) return canonical;

  return {
    ...canonical,
    dataCenterIds,
  };
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
    ? await Promise.all(body.map((endpoint) => canonicalizeEndpoint(endpoint, init)))
    : await canonicalizeEndpoint(body, init);

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

console.log("AVANTIQO_IMAGE_CACHE_CANONICAL_TEMPLATE_RESOLUTION=true");
console.log("AVANTIQO_IMAGE_CACHE_CANONICAL_TEMPLATE_SOURCE=ENDPOINT_BOUND_TEMPLATE_BY_ID");
console.log("AVANTIQO_IMAGE_CACHE_CANONICAL_REGION_BINDING_SOURCE=NETWORK_VOLUMES");
console.log("AVANTIQO_IMAGE_CACHE_CANONICAL_NEW_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_CACHE_CANONICAL_PRODUCTION_DEPLOY=false");

await import("./cache-avantiqo-image-2512-local.mjs");