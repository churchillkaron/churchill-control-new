#!/usr/bin/env node

const nativeFetch = globalThis.fetch.bind(globalThis);
const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_BASE = "https://api.runpod.io/graphql";
const PRODUCTION_ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const CANDIDATE_ENDPOINT_NAME = "avantiqo-video-32gb-candidate-v1";
const CANDIDATE_GPU_TYPE = "NVIDIA RTX PRO 4500 Blackwell";
const REGISTRY_AUTH_ENV = "AVANTIQO_VIDEO_32GB_CANDIDATE_RUNPOD_REGISTRY_AUTH_ID";
const NO_AUTH_SENTINEL = "AVANTIQO_VIDEO_V69_NO_REGISTRY_AUTH";
const TRANSIENT_READ_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const READ_ATTEMPTS = 4;
const BACKOFF_MS = [0, 750, 1500, 3000];

const GPU_POOLS_QUERY = `
query AvantiqoVideoV69GpuPools {
  serverlessGpuPools { id gpuTypeIds }
}`;

const SAVE_ENDPOINT_MUTATION = `
mutation AvantiqoVideoV69SaveEndpoint($input: EndpointInput!) {
  saveEndpoint(input: $input) {
    id
    name
    templateId
    gpuIds
    gpuCount
    workersMin
    workersMax
    networkVolumeId
    networkVolumeIds { networkVolumeId }
  }
}`;

let productionUsesNoRegistryAuth = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const methodOf = (init = {}) => String(init?.method || "GET").toUpperCase();
const urlOf = (input) => typeof input === "string" ? input : text(input?.url);

function errorCode(error) {
  return String(error?.cause?.code || error?.code || error?.name || "FETCH_FAILED");
}

function isRegistryAuthList(url) {
  return url === `${REST_BASE}/containerregistryauth`;
}

function isTemplateCreate(url, method) {
  return method === "POST" && url === `${REST_BASE}/templates`;
}

function isCandidateEndpointCreate(url, init, method) {
  if (method !== "POST" || url !== `${REST_BASE}/endpoints` || !init?.body) return false;
  try {
    const body = JSON.parse(String(init.body));
    return text(body?.name) === CANDIDATE_ENDPOINT_NAME;
  } catch {
    return false;
  }
}

function shouldRetryReadStatus(url, status) {
  if (TRANSIENT_READ_STATUSES.has(Number(status))) return true;
  if (Number(status) !== 404) return false;
  return url.startsWith(`${REST_BASE}/endpoints/`) || url.startsWith(`${REST_BASE}/templates/`);
}

function withNoAuthSentinel(response, url, method) {
  if (!productionUsesNoRegistryAuth || method !== "GET" || !isRegistryAuthList(url) || !response?.ok) {
    return response;
  }
  return response.text().then((raw) => {
    let body = [];
    try { body = raw ? JSON.parse(raw) : []; } catch { body = []; }
    if (!Array.isArray(body)) return new Response(raw, { status: response.status, headers: response.headers });
    const filtered = body.filter((entry) => text(entry?.id) !== NO_AUTH_SENTINEL);
    filtered.push({ id: NO_AUTH_SENTINEL, name: "ghcr-production-no-auth-parity" });
    return new Response(JSON.stringify(filtered), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function stripNoAuthSentinelFromTemplateCreate(url, init, method) {
  if (!productionUsesNoRegistryAuth || !isTemplateCreate(url, method) || !init?.body) return init;
  let body = null;
  try { body = JSON.parse(String(init.body)); } catch { body = null; }
  if (!body || text(body?.containerRegistryAuthId) !== NO_AUTH_SENTINEL) return init;
  const { containerRegistryAuthId: _ignored, ...withoutRegistryAuth } = body;
  console.error("AVANTIQO_VIDEO_V69_TEMPLATE_REGISTRY_AUTH_MODE=PRODUCTION_NO_AUTH_PARITY");
  return { ...init, body: JSON.stringify(withoutRegistryAuth) };
}

async function nativeGraphql(query, variables, managementKey) {
  const response = await nativeFetch(`${GRAPHQL_BASE}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "AvantiqoVideoV69",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_VIDEO_V69_GRAPHQL_HTTP_${response.status}`);
  }
  if (Array.isArray(body?.errors) && body.errors.length) {
    const message = body.errors.map((entry) => text(entry?.message)).filter(Boolean).join(" | ").slice(0, 800);
    throw new Error(`AVANTIQO_VIDEO_V69_GRAPHQL_ERROR:${message || "UNKNOWN"}`);
  }
  if (!body) throw new Error("AVANTIQO_VIDEO_V69_GRAPHQL_INVALID_JSON");
  return body;
}

async function resolveCandidateGpuPoolId(managementKey, gpuType) {
  if (gpuType !== CANDIDATE_GPU_TYPE) {
    throw new Error(`AVANTIQO_VIDEO_V69_GPU_TYPE_UNEXPECTED:${gpuType || "MISSING"}`);
  }
  const response = await nativeGraphql(GPU_POOLS_QUERY, {}, managementKey);
  const pools = list(response?.data?.serverlessGpuPools);
  const pool = pools.find((entry) => list(entry?.gpuTypeIds).map(text).includes(gpuType));
  const poolId = text(pool?.id);
  if (!poolId) throw new Error(`AVANTIQO_VIDEO_V69_GPU_POOL_RESOLUTION_FAILED:${gpuType}`);
  return poolId;
}

async function createCandidateEndpointViaGraphql(init) {
  let restBody = null;
  try { restBody = JSON.parse(String(init?.body || "")); } catch { restBody = null; }
  if (!restBody) throw new Error("AVANTIQO_VIDEO_V69_ENDPOINT_CREATE_BODY_INVALID");
  if (text(restBody?.name) !== CANDIDATE_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VIDEO_V69_ENDPOINT_CREATE_NAME_INVALID");
  }

  const gpuTypes = list(restBody?.gpuTypeIds).map(text).filter(Boolean);
  if (gpuTypes.length !== 1 || gpuTypes[0] !== CANDIDATE_GPU_TYPE) {
    throw new Error(`AVANTIQO_VIDEO_V69_ENDPOINT_CREATE_GPU_TYPES_INVALID:${gpuTypes.join(",") || "MISSING"}`);
  }

  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  const gpuPoolId = await resolveCandidateGpuPoolId(managementKey, gpuTypes[0]);

  const templateId = text(restBody?.templateId);
  const networkVolumeId = text(restBody?.networkVolumeId);
  if (!templateId) throw new Error("AVANTIQO_VIDEO_V69_ENDPOINT_CREATE_TEMPLATE_ID_REQUIRED");
  if (!networkVolumeId) throw new Error("AVANTIQO_VIDEO_V69_ENDPOINT_CREATE_NETWORK_VOLUME_ID_REQUIRED");

  const input = {
    name: CANDIDATE_ENDPOINT_NAME,
    templateId,
    gpuIds: gpuPoolId,
    gpuCount: 1,
    workersMin: finite(restBody?.workersMin, 0),
    workersMax: finite(restBody?.workersMax, 0),
    networkVolumeId,
    networkVolumeIds: [{ networkVolumeId }],
    flashBootType: restBody?.flashboot === false ? "DISABLED" : "FLASHBOOT",
  };

  const idleTimeout = finite(restBody?.idleTimeout, null);
  if (idleTimeout !== null && idleTimeout > 0) input.idleTimeout = idleTimeout;
  const scalerType = text(restBody?.scalerType);
  if (scalerType) input.scalerType = scalerType;
  const scalerValue = finite(restBody?.scalerValue, null);
  if (scalerValue !== null && scalerValue > 0) input.scalerValue = scalerValue;
  const executionTimeoutMs = finite(restBody?.executionTimeoutMs, null);
  if (executionTimeoutMs !== null && executionTimeoutMs >= 0) input.executionTimeoutMs = executionTimeoutMs;

  console.error("AVANTIQO_VIDEO_V69_ENDPOINT_CREATE_TRANSPORT=RUNPOD_GRAPHQL_SAVE_ENDPOINT");
  console.error("AVANTIQO_VIDEO_V69_GPU_POOL_RESOLVED=true");

  const saved = await nativeGraphql(SAVE_ENDPOINT_MUTATION, { input }, managementKey);
  const endpoint = saved?.data?.saveEndpoint;
  const endpointId = text(endpoint?.id);
  if (!endpointId) throw new Error("AVANTIQO_VIDEO_V69_GRAPHQL_CREATE_ID_REQUIRED");
  if (text(endpoint?.name) !== CANDIDATE_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VIDEO_V69_GRAPHQL_CREATE_NAME_INVALID");
  }

  return new Response(JSON.stringify(endpoint), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

globalThis.fetch = async (input, init = {}) => {
  const url = urlOf(input);
  const originalMethod = methodOf(init);
  const effectiveInit = stripNoAuthSentinelFromTemplateCreate(url, init, originalMethod);
  const method = methodOf(effectiveInit);

  if (isCandidateEndpointCreate(url, effectiveInit, method)) {
    return createCandidateEndpointViaGraphql(effectiveInit);
  }

  const attempts = method === "GET" ? READ_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await sleep(BACKOFF_MS[attempt - 1] || 0);

    try {
      const response = await nativeFetch(input, effectiveInit);
      if (method === "GET" && attempt < attempts && shouldRetryReadStatus(url, response?.status)) {
        try { await response.body?.cancel(); } catch {}
        console.error(`AVANTIQO_VIDEO_V69_READ_RETRY status=${response.status} attempt=${attempt}/${attempts}`);
        continue;
      }
      return await withNoAuthSentinel(response, url, method);
    } catch (error) {
      if (method !== "GET" || attempt >= attempts) throw error;
      console.error(`AVANTIQO_VIDEO_V69_READ_RETRY error=${errorCode(error)} attempt=${attempt}/${attempts}`);
    }
  }

  throw new Error("AVANTIQO_VIDEO_V69_READ_RETRY_EXHAUSTED");
};

async function readJson(path, managementKey) {
  const response = await globalThis.fetch(`${REST_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 500);
    throw new Error(`AVANTIQO_VIDEO_V69_REGISTRY_DISCOVERY_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

function endpointTemplateId(endpoint = {}) {
  const embedded = endpoint?.template;
  return text(
    endpoint?.templateId ??
    endpoint?.template_id ??
    (typeof embedded === "string" ? embedded : embedded?.id),
  );
}

function templateRegistryAuthId(template = {}) {
  return text(template?.containerRegistryAuthId ?? template?.container_registry_auth_id);
}

async function bindProductionRegistryAuth() {
  if (text(process.env[REGISTRY_AUTH_ENV])) {
    console.error("AVANTIQO_VIDEO_V69_REGISTRY_AUTH_SOURCE=EXPLICIT_ENV");
    return;
  }

  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  const productionEndpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID);
  if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  if (!productionEndpointId) throw new Error("RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID_REQUIRED");

  const productionEndpoint = await readJson(
    `/endpoints/${encodeURIComponent(productionEndpointId)}?includeTemplate=true&includeWorkers=false`,
    managementKey,
  );
  if (
    text(productionEndpoint?.id) !== productionEndpointId ||
    text(productionEndpoint?.name) !== PRODUCTION_ENDPOINT_NAME
  ) {
    throw new Error("AVANTIQO_VIDEO_V69_PRODUCTION_ENDPOINT_IDENTITY_INVALID");
  }

  const productionTemplateId = endpointTemplateId(productionEndpoint);
  if (!productionTemplateId) throw new Error("AVANTIQO_VIDEO_V69_PRODUCTION_TEMPLATE_ID_REQUIRED");

  let productionTemplate =
    productionEndpoint?.template && typeof productionEndpoint.template === "object"
      ? productionEndpoint.template
      : null;

  if (!productionTemplate || text(productionTemplate?.id) !== productionTemplateId) {
    const templates = await readJson(
      "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
      managementKey,
    );
    if (!Array.isArray(templates)) throw new Error("AVANTIQO_VIDEO_V69_TEMPLATE_LIST_INVALID");
    productionTemplate = templates.find((entry) => text(entry?.id) === productionTemplateId) || null;
  }

  if (!productionTemplate || text(productionTemplate?.id) !== productionTemplateId) {
    throw new Error("AVANTIQO_VIDEO_V69_PRODUCTION_TEMPLATE_REQUIRED");
  }

  const registryAuthId = templateRegistryAuthId(productionTemplate);
  if (!registryAuthId) {
    productionUsesNoRegistryAuth = true;
    process.env[REGISTRY_AUTH_ENV] = NO_AUTH_SENTINEL;
    console.error("AVANTIQO_VIDEO_V69_REGISTRY_AUTH_SOURCE=PRODUCTION_VIDEO_TEMPLATE_NO_AUTH");
    console.error("AVANTIQO_VIDEO_V69_REGISTRY_AUTH_VERIFIED=true");
    return;
  }

  const registryAuths = await readJson("/containerregistryauth", managementKey);
  if (!Array.isArray(registryAuths)) throw new Error("AVANTIQO_VIDEO_V69_REGISTRY_AUTH_LIST_INVALID");
  const matches = list(registryAuths).filter((entry) => text(entry?.id) === registryAuthId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V69_PRODUCTION_REGISTRY_AUTH_NOT_FOUND:matches=${matches.length}`);
  }

  process.env[REGISTRY_AUTH_ENV] = registryAuthId;
  console.error("AVANTIQO_VIDEO_V69_REGISTRY_AUTH_SOURCE=PRODUCTION_VIDEO_TEMPLATE");
  console.error("AVANTIQO_VIDEO_V69_REGISTRY_AUTH_VERIFIED=true");
}

console.error("AVANTIQO_VIDEO_V69_RESILIENT_READ_TRANSPORT=ENABLED");
console.error("AVANTIQO_VIDEO_V69_MUTATION_RETRY=DISABLED");

await bindProductionRegistryAuth();
await import("./provision-avantiqo-video-32gb-candidate-v69-local.mjs");
