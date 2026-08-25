import { readFileSync } from "node:fs";

const REST_BASE = "https://rest.runpod.io/v1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V3";
const EXPECTED_ENTRYPOINT = "handler_v5.py";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_VOLUME_QUOTA_GUARD_V1";
const RUNPOD_REGISTRY_REPOSITORY =
  "registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-image-engine-dockerfile";
const RUNPOD_SOURCE_TAG_LENGTH = 9;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
const sourceSha = text(evidence.source_sha).toLowerCase();
const immutableImage = text(evidence.immutable_image_reference);

if (
  evidence.success !== true ||
  text(evidence.contract) !== EVIDENCE_CONTRACT ||
  evidence.source_sha_matches_trigger !== true ||
  sourceSha !== text(evidence.trigger_sha).toLowerCase() ||
  !/^[a-f0-9]{40}$/.test(sourceSha) ||
  text(evidence.entrypoint) !== EXPECTED_ENTRYPOINT ||
  text(evidence.runtime_revision) !== EXPECTED_RUNTIME ||
  !/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)
) {
  throw new Error("AVANTIQO_IMAGE_Z_CACHE_SOURCE_LOCKED_EVIDENCE_INVALID");
}

const sourceTag = sourceSha.slice(0, RUNPOD_SOURCE_TAG_LENGTH);
const sourceLockedRegistryImage = `${RUNPOD_REGISTRY_REPOSITORY}:${sourceTag}`;
let sourceLockedImageObserved = false;
let immutableImageObserved = false;

function canonicalizeTemplate(template) {
  if (!template || typeof template !== "object" || Array.isArray(template)) return template;
  const imageName = text(template.imageName);
  if (imageName === immutableImage) {
    immutableImageObserved = true;
    return template;
  }
  if (imageName === sourceLockedRegistryImage) {
    sourceLockedImageObserved = true;
    return { ...template, imageName: immutableImage };
  }
  return template;
}

function canonicalizeEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) return endpoint;
  const template = object(endpoint.template);
  if (!Object.keys(template).length) return endpoint;
  const canonicalTemplate = canonicalizeTemplate(template);
  if (canonicalTemplate === template) return endpoint;
  return { ...endpoint, template: canonicalTemplate };
}

function canonicalizeRestBody(body, url) {
  if (url.startsWith(`${REST_BASE}/templates`)) {
    return Array.isArray(body)
      ? body.map(canonicalizeTemplate)
      : canonicalizeTemplate(body);
  }
  if (url.startsWith(`${REST_BASE}/endpoints`)) {
    return Array.isArray(body)
      ? body.map(canonicalizeEndpoint)
      : canonicalizeEndpoint(body);
  }
  return body;
}

const baseFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = undefined) => {
  const response = await baseFetch(input, init);
  const url = typeof input === "string" ? input : text(input?.url);
  const method = text(init?.method || "GET").toUpperCase();

  if (
    method !== "GET" ||
    !response.ok ||
    (!url.startsWith(`${REST_BASE}/endpoints`) && !url.startsWith(`${REST_BASE}/templates`))
  ) {
    return response;
  }

  let body;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }

  const canonicalBody = canonicalizeRestBody(body, url);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(canonicalBody), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

console.log("AVANTIQO_IMAGE_Z_CACHE_SOURCE_LOCKED_WRAPPER=true");
console.log(`AVANTIQO_IMAGE_Z_CACHE_CERTIFIED_SOURCE_SHA=${sourceSha}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_CERTIFIED_IMMUTABLE_IMAGE=${immutableImage}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_RUNPOD_SOURCE_LOCKED_IMAGE=${sourceLockedRegistryImage}`);
console.log("AVANTIQO_IMAGE_Z_CACHE_SOURCE_EQUIVALENCE_RULE=EXACT_RUNPOD_REPOSITORY_AND_EXACT_9_HEX_CERTIFIED_SOURCE_PREFIX");
console.log("AVANTIQO_IMAGE_Z_CACHE_OTHER_IMAGE_TAGS_ALLOWED=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_WRAPPER_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_WRAPPER_GENERATION=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_WRAPPER_PRODUCTION_DEPLOY=false");

await import("./cache-avantiqo-image-z-image-once-local.mjs");

if (!sourceLockedImageObserved && !immutableImageObserved) {
  throw new Error("AVANTIQO_IMAGE_Z_CACHE_CERTIFIED_BINDING_NOT_OBSERVED");
}
console.log(
  `AVANTIQO_IMAGE_Z_CACHE_BINDING_PROVENANCE=${
    sourceLockedImageObserved ? "RUNPOD_SOURCE_LOCKED_CERTIFIED_SOURCE" : "GHCR_IMMUTABLE_DIGEST"
  }`,
);
