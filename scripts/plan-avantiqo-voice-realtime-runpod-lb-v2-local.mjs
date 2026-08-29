import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_REALTIME_RUNPOD_LB_V2_PLAN_V1";
const ENDPOINT_NAME = "avantiqo-voice-stt-realtime-v1";
const V2_BASE = "https://v2-rest.runpod.io/v2";
const V1_BASE = "https://rest.runpod.io/v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-stt-realtime-worker-image.json";
const SERVICE_PATH = "services/avantiqo-voice-stt-realtime";
const EXPECTED = Object.freeze({
  evidence_contract: "AVANTIQO_VOICE_REALTIME_STT_WORKER_IMAGE_RESULT_V1",
  realtime_contract: "AVANTIQO_VOICE_STT_REALTIME_V1",
  capability: "ai.speech.to.text.realtime",
  foundation_model: "openai/whisper-large-v3-turbo",
  foundation_revision: "41f01f3fe87f28c78e2fbf8b568835947dd65ed9",
  websocket_path: "/v1/realtime/transcribe",
  app_blob: "0b79109627d0f7161a819d92a3af098904ccb14c",
  dockerfile_blob: "e297a2ec151ab17f14c2ed01ed2a90d5b5f05342",
  requirements_blob: "3cbeda824929dd70f7661bc79a9e4011f7d2b5ee",
});

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 1200);
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`GIT_${String(args[0] || "COMMAND").toUpperCase()}_FAILED:${redact(result.stderr || result.stdout)}`);
  }
  return text(result.stdout);
}

function gitSucceeds(args) {
  return spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  }).status === 0;
}

function gitJson(ref, path) {
  return JSON.parse(runGit(["show", `${ref}:${path}`]));
}

function sourceBlobs(ref) {
  return {
    app_blob: runGit(["rev-parse", `${ref}:${SERVICE_PATH}/app.py`]),
    dockerfile_blob: runGit(["rev-parse", `${ref}:${SERVICE_PATH}/Dockerfile`]),
    requirements_blob: runGit(["rev-parse", `${ref}:${SERVICE_PATH}/requirements.txt`]),
  };
}

function assertSource(blobs, label) {
  for (const key of ["app_blob", "dockerfile_blob", "requirements_blob"]) {
    if (blobs[key] !== EXPECTED[key]) {
      throw new Error(`${CONTRACT}_${label}_${key.toUpperCase()}_CHANGED:${blobs[key]}`);
    }
  }
}

function assertOfflineDockerfile(ref, label) {
  const dockerfile = runGit(["show", `${ref}:${SERVICE_PATH}/Dockerfile`]);
  const requiredFragments = [
    `expected_revision = "${EXPECTED.foundation_revision}"`,
    "snapshot_download(repo_id=model, revision=\"main\")",
    "model.safetensors",
    "local_files_only=True",
    "HF_HUB_OFFLINE=1",
    "TRANSFORMERS_OFFLINE=1",
    "EXPOSE 80",
  ];
  const missing = requiredFragments.filter((fragment) => !dockerfile.includes(fragment));
  if (missing.length) throw new Error(`${CONTRACT}_${label}_OFFLINE_DOCKERFILE_INCOMPLETE:${missing.join("|")}`);
}

function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 5) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const error = new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

async function getJson(url, key, label) {
  return readJson(await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), label);
}

async function attemptJson(url, key, label) {
  try {
    return { success: true, body: await getJson(url, key, label), error: null };
  } catch (error) {
    return {
      success: false,
      body: null,
      error: redact(error instanceof Error ? error.message : error),
    };
  }
}

function registryDescriptor(item = {}) {
  return [
    item?.name,
    item?.registry,
    item?.registryUrl,
    item?.registry_url,
    item?.serverAddress,
    item?.server_address,
    item?.url,
    item?.host,
  ].map(text).filter(Boolean).join(" ");
}

function looksLikeRegistryRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!text(value.id)) return false;
  return Boolean(
    registryDescriptor(value) ||
    Object.prototype.hasOwnProperty.call(value, "username") ||
    Object.prototype.hasOwnProperty.call(value, "credential") ||
    Object.prototype.hasOwnProperty.call(value, "credentials")
  );
}

function normalizeRegistryRecords(value) {
  const preferred = normalizeList(value, [
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
      for (const child of node) visit(child, depth + 1);
      return;
    }
    if (looksLikeRegistryRecord(node)) records.push(node);
    for (const child of Object.values(node)) visit(child, depth + 1);
  }
  visit(value);
  return records;
}

function safeV2Endpoint(endpoint = {}) {
  const workers = object(endpoint.workers);
  const scaling = object(endpoint.scaling);
  const requestUrls = object(endpoint.requestUrls || endpoint.request_urls);
  const gpu = object(endpoint.gpu);
  return {
    id_present: Boolean(text(endpoint.id)),
    name: text(endpoint.name) || null,
    type: text(endpoint.type) || null,
    image: text(endpoint.image) || text(endpoint.imageName) || null,
    gpu_pools: list(gpu.pools).map(text).filter(Boolean),
    gpu_count: Number.isFinite(Number(gpu.count)) ? Number(gpu.count) : null,
    workers: {
      min: Number.isFinite(Number(workers.min)) ? Number(workers.min) : null,
      max: Number.isFinite(Number(workers.max)) ? Number(workers.max) : null,
      idle_timeout: Number.isFinite(Number(workers.idleTimeout)) ? Number(workers.idleTimeout) : null,
    },
    scaling: {
      type: text(scaling.type) || null,
      request_count: Number.isFinite(Number(scaling.requestCount)) ? Number(scaling.requestCount) : null,
    },
    request_url_base_present: Boolean(text(requestUrls.base)),
    request_url_health_present: Boolean(text(requestUrls.health)),
  };
}

function certifiedImageEvidence() {
  runGit(["fetch", "origin", "main", "--quiet"]);
  const evidence = gitJson("origin/main", IMAGE_EVIDENCE_PATH);
  const image = text(evidence?.immutable_image_reference);
  const sourceSha = text(evidence?.source_sha);
  if (
    evidence?.success !== true ||
    evidence?.contract !== EXPECTED.evidence_contract ||
    evidence?.source_sha_matches_trigger !== true ||
    evidence?.build_job_result !== "success" ||
    evidence?.preflight_outcome !== "success" ||
    evidence?.build_outcome !== "success" ||
    evidence?.offline_model_baked !== true ||
    text(evidence?.foundation_model) !== EXPECTED.foundation_model ||
    text(evidence?.foundation_revision) !== EXPECTED.foundation_revision ||
    text(evidence?.realtime_contract) !== EXPECTED.realtime_contract ||
    text(evidence?.capability) !== EXPECTED.capability ||
    text(evidence?.websocket_path) !== EXPECTED.websocket_path ||
    !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image) ||
    !/^[a-f0-9]{40}$/i.test(sourceSha)
  ) {
    throw new Error(`${CONTRACT}_CERTIFIED_REALTIME_IMAGE_REQUIRED`);
  }

  const resolved = runGit(["rev-parse", `${sourceSha}^{commit}`]);
  if (resolved !== sourceSha) throw new Error(`${CONTRACT}_SOURCE_SHA_INVALID:${resolved}`);
  if (!gitSucceeds(["merge-base", "--is-ancestor", sourceSha, "origin/main"])) {
    throw new Error(`${CONTRACT}_IMAGE_SOURCE_NOT_ON_MAIN:${sourceSha}`);
  }

  const imageBlobs = sourceBlobs(sourceSha);
  const mainBlobs = sourceBlobs("origin/main");
  assertSource(imageBlobs, "IMAGE_SOURCE");
  assertSource(mainBlobs, "NEWEST_MAIN");
  assertOfflineDockerfile(sourceSha, "IMAGE_SOURCE");
  assertOfflineDockerfile("origin/main", "NEWEST_MAIN");

  return {
    image,
    digest: text(evidence.image_digest),
    github_run_id: text(evidence.github_run_id) || null,
    source_sha: sourceSha,
    source_is_ancestor_of_main: true,
    newest_main_voice_realtime_equivalent: JSON.stringify(imageBlobs) === JSON.stringify(mainBlobs),
    source_blobs: imageBlobs,
    foundation_revision: EXPECTED.foundation_revision,
    offline_model_baked: true,
  };
}

const apiKey = required("RUNPOD_API_KEY", process.env.RUNPOD_MANAGEMENT_API_KEY);
const evidence = certifiedImageEvidence();
const relaySecret = text(process.env.AVANTIQO_VOICE_REALTIME_RELAY_SECRET);
const relaySecretConfigured = relaySecret.length >= 32;
const gpuPool = text(process.env.AVANTIQO_VOICE_REALTIME_GPU_POOL || "AMPERE_16");
const explicitRegistryAuthId = text(process.env.AVANTIQO_VOICE_REALTIME_REGISTRY_AUTH_ID);

const [v2Attempt, registryAttempt] = await Promise.all([
  attemptJson(`${V2_BASE}/serverless`, apiKey, `${CONTRACT}_V2_SERVERLESS`),
  attemptJson(`${V1_BASE}/containerregistryauth`, apiKey, `${CONTRACT}_REGISTRY_AUTH`),
]);

const v2Endpoints = v2Attempt.success
  ? normalizeList(v2Attempt.body, ["endpoints", "serverlessEndpoints", "serverless"]) || []
  : [];
const exactEndpoints = v2Endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);

const registryRecords = registryAttempt.success ? normalizeRegistryRecords(registryAttempt.body) : [];
let selectedRegistry = null;
let registrySelectionReason = null;
if (explicitRegistryAuthId) {
  const matches = registryRecords.filter((item) => text(item?.id) === explicitRegistryAuthId);
  if (matches.length === 1) {
    selectedRegistry = matches[0];
    registrySelectionReason = "EXPLICIT_ENV";
  } else {
    registrySelectionReason = `EXPLICIT_ENV_NOT_UNIQUE_${matches.length}`;
  }
} else {
  const ghcrCandidates = registryRecords.filter((item) => /ghcr|github|avantiqo-ghcr/i.test(registryDescriptor(item)));
  if (ghcrCandidates.length === 1) {
    selectedRegistry = ghcrCandidates[0];
    registrySelectionReason = "UNIQUE_GHCR_CANDIDATE";
  } else {
    registrySelectionReason = `GHCR_CANDIDATE_COUNT_${ghcrCandidates.length}`;
  }
}

const selectedRegistryAuthId = text(selectedRegistry?.id);
const v2Access = v2Attempt.success && Array.isArray(v2Endpoints);
const endpointNameUnique = exactEndpoints.length <= 1;
const endpointAbsent = exactEndpoints.length === 0;
const registryAuthReady = Boolean(selectedRegistryAuthId);
const applyReady = v2Access && endpointNameUnique && endpointAbsent && registryAuthReady && relaySecretConfigured;

const plannedPayload = {
  name: ENDPOINT_NAME,
  image: evidence.image,
  type: "LOAD_BALANCER",
  gpu: {
    pools: [gpuPool],
    count: 1,
  },
  disk: 30,
  ports: ["80/http"],
  env: {
    PORT: "80",
    PORT_HEALTH: "80",
    AVANTIQO_VOICE_STT_FOUNDATION_MODEL: EXPECTED.foundation_model,
    AVANTIQO_VOICE_REALTIME_RELAY_SECRET: relaySecretConfigured ? "[CONFIGURED_SECRET]" : "[REQUIRED_SECRET_MIN_32_CHARS]",
  },
  containerRegistryAuthId: registryAuthReady ? "[SELECTED_GHCR_AUTH_ID]" : "[REQUIRED_GHCR_AUTH_ID]",
  workers: {
    min: 0,
    max: 0,
    idleTimeout: 5,
  },
  scaling: {
    type: "REQUEST_COUNT",
    requestCount: 1,
  },
  flashboot: "FLASHBOOT",
};

const blockers = [];
if (!v2Access) blockers.push("RUNPOD_V2_SERVERLESS_READ_ACCESS_REQUIRED");
if (!endpointNameUnique) blockers.push(`REALTIME_ENDPOINT_NAME_AMBIGUOUS_${exactEndpoints.length}`);
if (!endpointAbsent) blockers.push("REALTIME_ENDPOINT_ALREADY_EXISTS_RECONCILIATION_REQUIRED");
if (!registryAuthReady) blockers.push(`GHCR_REGISTRY_AUTH_SELECTION_REQUIRED:${registrySelectionReason}`);
if (!relaySecretConfigured) blockers.push("AVANTIQO_VOICE_REALTIME_RELAY_SECRET_MIN_32_CHARS_REQUIRED");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "PLAN_READ_ONLY",
  newest_main_sha: runGit(["rev-parse", "origin/main"]),
  certified_image: evidence,
  runpod_v2: {
    base: V2_BASE,
    access: v2Access,
    read_error: v2Attempt.error,
    endpoint_count: v2Endpoints.length,
    exact_endpoint_matches: exactEndpoints.map(safeV2Endpoint),
    endpoint_name_unique: endpointNameUnique,
    endpoint_absent: endpointAbsent,
  },
  registry_auth: {
    inventory_access: registryAttempt.success,
    inventory_error: registryAttempt.error,
    record_count: registryRecords.length,
    explicit_id_requested: Boolean(explicitRegistryAuthId),
    selection_reason: registrySelectionReason,
    selected_auth_id_present: registryAuthReady,
  },
  relay: {
    secret_configured: relaySecretConfigured,
    secret_minimum_length: 32,
    secret_printed: false,
  },
  proposed_endpoint: {
    name: ENDPOINT_NAME,
    endpoint_type: "LOAD_BALANCER",
    websocket_path: EXPECTED.websocket_path,
    gpu_pool: gpuPool,
    gpu_count: 1,
    request_scaling_target: 1,
    creation_and_permanent_rest_target: "0/0",
    controlled_certification_open_target: "0/1",
    payload_redacted: plannedPayload,
  },
  apply_ready: applyReady,
  blockers,
  next_mutation_requires_explicit_approval: true,
  endpoint_created: false,
  endpoint_updated: false,
  registry_auth_created: false,
  workers_scaled: false,
  jobs_submitted: 0,
  realtime_sessions_started: 0,
  transcription_performed: false,
  tts_touched: false,
  music_touched: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
