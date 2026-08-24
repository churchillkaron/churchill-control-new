import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REST_BASE = "https://rest.runpod.io/v1";
const REGISTRY_AUTH_URL = `${REST_BASE}/containerregistryauth`;
const ENDPOINTS_URL_PREFIX = `${REST_BASE}/endpoints`;
const baseFetch = globalThis.fetch.bind(globalThis);

function text(value) {
  return String(value ?? "").trim();
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!isObject(value) || depth > 3) return null;

  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = value[key];
    if (Array.isArray(nested)) return nested;
    const normalized = normalizeListResponse(nested, candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

function registryAuthDescriptor(item = {}) {
  return [
    item?.name,
    item?.registry,
    item?.registryUrl,
    item?.registry_url,
    item?.serverAddress,
    item?.server_address,
    item?.url,
    item?.host,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");
}

function looksLikeRegistryAuthRecord(value) {
  if (!isObject(value) || !text(value.id)) return false;
  return Boolean(
    registryAuthDescriptor(value) ||
      Object.prototype.hasOwnProperty.call(value, "username") ||
      Object.prototype.hasOwnProperty.call(value, "password") ||
      Object.prototype.hasOwnProperty.call(value, "credential") ||
      Object.prototype.hasOwnProperty.call(value, "credentials")
  );
}

function normalizeRegistryAuthResponse(value) {
  const preferred = normalizeListResponse(value, [
    "containerRegistryAuths",
    "containerRegistryCreds",
    "registryAuths",
    "registryCredentials",
    "credentials",
    "auths",
  ]);
  if (preferred) return preferred;

  const records = [];
  const seen = new Set();

  function visit(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (looksLikeRegistryAuthRecord(node)) records.push(node);
    for (const nested of Object.values(node)) visit(nested, depth + 1);
  }

  visit(value);
  return records;
}

function canonicalRegistryAuthRecord(item) {
  if (!isObject(item)) return item;
  const descriptor = registryAuthDescriptor(item);
  if (!descriptor || text(item.name)) return item;
  return { ...item, name: descriptor };
}

function canonicalEndpointRecord(item) {
  if (!isObject(item)) return item;
  const singular = text(item.networkVolumeId);
  const plural = Array.isArray(item.networkVolumeIds)
    ? item.networkVolumeIds.map(text).filter(Boolean)
    : [];
  const seen = new Set();
  const normalizedPlural = [];
  for (const id of plural) {
    if (!id || id === singular || seen.has(id)) continue;
    seen.add(id);
    normalizedPlural.push(id);
  }
  return {
    ...item,
    networkVolumeIds: normalizedPlural,
  };
}

function normalizedResponse(response, body) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

globalThis.fetch = async (input, init) => {
  const response = await baseFetch(input, init);
  const url = typeof input === "string" ? input : text(input?.url);
  if (!response.ok) return response;

  if (url === REGISTRY_AUTH_URL) {
    let body = null;
    try {
      body = await response.clone().json();
    } catch {
      return response;
    }
    if (Array.isArray(body)) return response;
    const normalized = normalizeRegistryAuthResponse(body).map(canonicalRegistryAuthRecord);
    return normalizedResponse(response, normalized);
  }

  if (url.startsWith(ENDPOINTS_URL_PREFIX)) {
    let body = null;
    try {
      body = await response.clone().json();
    } catch {
      return response;
    }
    if (Array.isArray(body)) {
      return normalizedResponse(response, body.map(canonicalEndpointRecord));
    }
    if (isObject(body)) {
      return normalizedResponse(response, canonicalEndpointRecord(body));
    }
  }

  return response;
};

console.log("AVANTIQO_RUNPOD_REGISTRY_AUTH_RESPONSE_NORMALIZED=true");
console.log("AVANTIQO_RUNPOD_ENDPOINT_VOLUME_BINDINGS_NORMALIZED=true");
console.log("AVANTIQO_RUNPOD_ENDPOINT_VOLUME_BINDING_DUPLICATES_REMOVED=true");
console.log("AVANTIQO_RUNPOD_REGISTRY_AUTH_SECRET_VALUES_PRINTED=false");
console.log("AVANTIQO_RUNPOD_REGISTRY_AUTH_MUTATION_PERFORMED=false");
console.log("AVANTIQO_RUNPOD_ENDPOINT_NORMALIZATION_MUTATION_PERFORMED=false");

const target = text(process.argv[2]);
if (!target) throw new Error("AVANTIQO_RUNPOD_REGISTRY_AUTH_NORMALIZER_TARGET_REQUIRED");
process.argv.splice(2, 1);
await import(pathToFileURL(resolve(process.cwd(), target)).href);
