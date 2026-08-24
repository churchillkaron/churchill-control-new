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
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) return endpoint;
  const volumeIds = endpointVolumeIds(endpoint);
  if (!volumeIds.length) return endpoint;

  const byVolume = await networkVolumeMap(init);
  const dataCenterIds = [...new Set(volumeIds.map((id) => byVolume.get(id)).filter(Boolean))];
  if (dataCenterIds.length !== volumeIds.length) return endpoint;

  return {
    ...endpoint,
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

  const canonical = Array.isArray(body)
    ? await Promise.all(body.map((endpoint) => canonicalizeEndpoint(endpoint, init)))
    : await canonicalizeEndpoint(body, init);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(canonical), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

console.log("AVANTIQO_IMAGE_RESUME_CANONICAL_REGION_BINDING=true");
console.log("AVANTIQO_IMAGE_RESUME_CANONICAL_REGION_SOURCE=NETWORK_VOLUME_DATACENTER");
console.log("AVANTIQO_IMAGE_RESUME_CANONICAL_PRIMARY_RECACHE=false");
console.log("AVANTIQO_IMAGE_RESUME_CANONICAL_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_RESUME_CANONICAL_PRODUCTION_DEPLOY=false");

await import("./resume-avantiqo-image-2512-after-primary-local.mjs");
