#!/usr/bin/env node

const nativeFetch = globalThis.fetch.bind(globalThis);
const REST_BASE = "https://rest.runpod.io/v1";
const PRODUCTION_ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const REGISTRY_AUTH_ENV = "AVANTIQO_VIDEO_32GB_CANDIDATE_RUNPOD_REGISTRY_AUTH_ID";
const NO_AUTH_SENTINEL = "AVANTIQO_VIDEO_V69_NO_REGISTRY_AUTH";
const TRANSIENT_READ_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const READ_ATTEMPTS = 4;
const BACKOFF_MS = [0, 750, 1500, 3000];

let productionUsesNoRegistryAuth = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
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

globalThis.fetch = async (input, init = {}) => {
  const url = urlOf(input);
  const originalMethod = methodOf(init);
  const effectiveInit = stripNoAuthSentinelFromTemplateCreate(url, init, originalMethod);
  const method = methodOf(effectiveInit);
  const attempts = method === "GET" ? READ_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await sleep(BACKOFF_MS[attempt - 1] || 0);

    try {
      const response = await nativeFetch(input, effectiveInit);
      if (
        method === "GET" &&
        attempt < attempts &&
        TRANSIENT_READ_STATUSES.has(Number(response?.status))
      ) {
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

  const productionImage = text(productionTemplate?.imageName ?? productionTemplate?.image_name);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(productionImage)) {
    throw new Error("AVANTIQO_VIDEO_V69_PRODUCTION_TEMPLATE_GHCR_IDENTITY_INVALID");
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
