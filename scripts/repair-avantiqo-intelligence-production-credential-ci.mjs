import assert from "node:assert/strict";

const CONTRACT = "AVANTIQO_INTELLIGENCE_PRODUCTION_CREDENTIAL_REPAIR_V1";
const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const RUNPOD_QUEUE_BASE = "https://api.runpod.ai/v2";
const VERCEL_API_BASE = "https://api.vercel.com";
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_5K2x3kGkhs3d2PU8VOQQPyNT24A9";
const TEAM_ID = process.env.VERCEL_TEAM_ID || "team_40jy42BqQOs4U6pVdkawwEfp";

const ENDPOINTS = Object.freeze({
  fast: {
    name: "avantiqo-intelligence-fast-v1",
    endpointEnv: "RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID",
    queueEnv: "RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY",
  },
  deep: {
    name: "avantiqo-intelligence-v1",
    endpointEnv: "RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID",
    queueEnv: "RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY",
  },
});

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

async function fetchJson(url, { key, method = "GET", body = null, timeoutMs = 30000 } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  return { response, parsed };
}

function secretCandidates(definitions) {
  const candidates = [];
  const fingerprints = new Set();
  for (const [source, raw] of definitions) {
    const key = text(raw);
    if (!key) continue;
    const fingerprint = `${key.length}:${key.slice(0, 2)}:${key.slice(-2)}`;
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    candidates.push({ source, key });
  }
  return candidates;
}

async function findManagementCredential() {
  const candidates = secretCandidates([
    ["RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_MANAGEMENT_API_KEY],
    ["RUNPOD_API_KEY", process.env.RUNPOD_API_KEY],
  ]);
  if (!candidates.length) {
    throw new Error("AVANTIQO_INTELLIGENCE_GITHUB_RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED");
  }

  let lastStatus = null;
  for (const candidate of candidates) {
    const { response, parsed } = await fetchJson(
      `${RUNPOD_REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`,
      { key: candidate.key },
    );
    lastStatus = response.status;
    if (!response.ok) continue;
    const endpoints = normalizeListResponse(parsed, ["endpoints", "serverlessEndpoints"]);
    if (!endpoints) continue;
    return { ...candidate, endpoints };
  }

  throw new Error(`AVANTIQO_INTELLIGENCE_RUNPOD_MANAGEMENT_CREDENTIAL_REJECTED_HTTP_${lastStatus || 0}`);
}

function exactEndpoint(endpoints, name) {
  const matches = list(endpoints).filter((endpoint) => text(endpoint?.name) === name);
  assert.equal(matches.length, 1, `AVANTIQO_INTELLIGENCE_ENDPOINT_RESOLUTION_FAILED:${name}:${matches.length}`);
  const endpoint = matches[0];
  const id = text(endpoint?.id);
  assert.match(id, /^[A-Za-z0-9_-]+$/, `AVANTIQO_INTELLIGENCE_ENDPOINT_ID_INVALID:${name}`);
  assert.equal(Number(endpoint?.workersMin ?? endpoint?.workers_min ?? -1), 0, `AVANTIQO_INTELLIGENCE_WORKERS_MIN_ZERO_REQUIRED:${name}`);
  return { id, name };
}

async function queueCredentialFor(endpointId, config, management) {
  const candidates = secretCandidates([
    [config.queueEnv, process.env[config.queueEnv]],
    ["RUNPOD_API_KEY", process.env.RUNPOD_API_KEY],
    [management.source, management.key],
  ]);
  if (!candidates.length) {
    throw new Error(`AVANTIQO_INTELLIGENCE_QUEUE_CREDENTIAL_REQUIRED:${config.name}`);
  }

  let lastStatus = null;
  for (const candidate of candidates) {
    const { response, parsed } = await fetchJson(
      `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
      { key: candidate.key },
    );
    lastStatus = response.status;
    if (!response.ok) continue;
    const jobs = parsed?.jobs || {};
    const inQueue = Number(jobs.inQueue ?? jobs.in_queue ?? 0);
    const inProgress = Number(jobs.inProgress ?? jobs.in_progress ?? 0);
    assert.ok(Number.isFinite(inQueue), `AVANTIQO_INTELLIGENCE_QUEUE_HEALTH_INVALID:${config.name}`);
    assert.ok(Number.isFinite(inProgress), `AVANTIQO_INTELLIGENCE_QUEUE_HEALTH_INVALID:${config.name}`);
    return {
      ...candidate,
      health: { in_queue: inQueue, in_progress: inProgress },
    };
  }

  throw new Error(`AVANTIQO_INTELLIGENCE_QUEUE_CREDENTIAL_REJECTED:${config.name}:HTTP_${lastStatus || 0}`);
}

async function upsertVercelProductionEnv(entries) {
  const vercelToken = text(process.env.VERCEL_TOKEN);
  if (!vercelToken) throw new Error("AVANTIQO_INTELLIGENCE_GITHUB_VERCEL_TOKEN_REQUIRED");
  const requestBody = entries.map((entry) => ({
    key: entry.key,
    value: entry.value,
    type: entry.type || "encrypted",
    target: ["production"],
    comment: "Avantiqo owned Intelligence credential repair V1",
  }));
  const { response } = await fetchJson(
    `${VERCEL_API_BASE}/v10/projects/${encodeURIComponent(PROJECT_ID)}/env?teamId=${encodeURIComponent(TEAM_ID)}&upsert=true`,
    {
      key: vercelToken,
      method: "POST",
      body: requestBody,
    },
  );
  if (!response.ok) {
    throw new Error(`AVANTIQO_INTELLIGENCE_VERCEL_ENV_UPSERT_HTTP_${response.status}`);
  }
  return response.status;
}

const management = await findManagementCredential();
const fastEndpoint = exactEndpoint(management.endpoints, ENDPOINTS.fast.name);
const deepEndpoint = exactEndpoint(management.endpoints, ENDPOINTS.deep.name);

const fastQueue = await queueCredentialFor(fastEndpoint.id, ENDPOINTS.fast, management);
const deepQueue = await queueCredentialFor(deepEndpoint.id, ENDPOINTS.deep, management);

assert.equal(fastQueue.health.in_queue, 0, "AVANTIQO_INTELLIGENCE_FAST_QUEUE_NOT_EMPTY");
assert.equal(fastQueue.health.in_progress, 0, "AVANTIQO_INTELLIGENCE_FAST_QUEUE_IN_PROGRESS");
assert.equal(deepQueue.health.in_queue, 0, "AVANTIQO_INTELLIGENCE_DEEP_QUEUE_NOT_EMPTY");
assert.equal(deepQueue.health.in_progress, 0, "AVANTIQO_INTELLIGENCE_DEEP_QUEUE_IN_PROGRESS");

const vercelStatus = await upsertVercelProductionEnv([
  {
    key: "RUNPOD_MANAGEMENT_API_KEY",
    value: management.key,
    type: "encrypted",
  },
  {
    key: ENDPOINTS.fast.endpointEnv,
    value: fastEndpoint.id,
    type: "encrypted",
  },
  {
    key: ENDPOINTS.deep.endpointEnv,
    value: deepEndpoint.id,
    type: "encrypted",
  },
  {
    key: ENDPOINTS.fast.queueEnv,
    value: fastQueue.key,
    type: "encrypted",
  },
  {
    key: ENDPOINTS.deep.queueEnv,
    value: deepQueue.key,
    type: "encrypted",
  },
]);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  management_credential_source: management.source,
  fast_endpoint_id: fastEndpoint.id,
  deep_endpoint_id: deepEndpoint.id,
  fast_queue_credential_source: fastQueue.source,
  deep_queue_credential_source: deepQueue.source,
  fast_queue_health: fastQueue.health,
  deep_queue_health: deepQueue.health,
  vercel_project_id: PROJECT_ID,
  vercel_team_id: TEAM_ID,
  vercel_production_env_upsert_status: vercelStatus,
  vercel_production_env_keys_repaired: [
    "RUNPOD_MANAGEMENT_API_KEY",
    ENDPOINTS.fast.endpointEnv,
    ENDPOINTS.deep.endpointEnv,
    ENDPOINTS.fast.queueEnv,
    ENDPOINTS.deep.queueEnv,
  ],
  runpod_mutation_performed: false,
  model_inference_performed: false,
  wallet_mutation_performed: false,
  provider_activation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
