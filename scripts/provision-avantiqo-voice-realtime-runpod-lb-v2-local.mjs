import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_REALTIME_RUNPOD_LB_V2_PROVISION_V1";
const ENDPOINT_NAME = "avantiqo-voice-stt-realtime-v1";
const ENDPOINT_TYPE = "LOAD_BALANCER";
const GPU_POOL = "AMPERE_16";
const GPU_COUNT = 1;
const IDLE_TIMEOUT_SECONDS = 5;
const REQUEST_COUNT_TARGET = 1;
const V2_BASE = "https://api.runpod.io/v2";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-stt-realtime-worker-image.json";
const SERVICE_PATH = "services/avantiqo-voice-stt-realtime";
const SAFE_LEASE_PATH = "supabase/functions/_shared/avantiqo-voice-realtime-safe-lease.ts";
const FOUNDATION_MODEL = "openai/whisper-large-v3-turbo";
const FOUNDATION_REVISION = "41f01f3fe87f28c78e2fbf8b568835947dd65ed9";
const REALTIME_CONTRACT = "AVANTIQO_VOICE_STT_REALTIME_V1";
const CAPABILITY = "ai.speech.to.text.realtime";
const WS_PATH = "/v1/realtime/transcribe";

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/(AVANTIQO_VOICE_REALTIME_RELAY_SECRET["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[REDACTED]")
    .slice(0, 1200);
}

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: process.env,
  });
  return result.status === 0 ? text(result.stdout) : "";
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${CONTRACT}_GIT_${String(args[0] || "COMMAND").toUpperCase()}_FAILED:${redact(result.stderr || result.stdout)}`);
  }
  return text(result.stdout);
}

function fetchNewestMainAndRequireCheckoutMatch(label) {
  runGit(["fetch", "origin", "main", "--quiet"]);
  const head = runGit(["rev-parse", "HEAD"]);
  const newest = runGit(["rev-parse", "origin/main"]);
  if (head !== newest) {
    throw new Error(`${CONTRACT}_${label}_CHECKOUT_NOT_NEWEST_MAIN:head=${head}:origin_main=${newest}`);
  }
  return newest;
}

function gitJson(ref, path) {
  return JSON.parse(runGit(["show", `${ref}:${path}`]));
}

function serviceBlobs(ref) {
  return {
    app: runGit(["rev-parse", `${ref}:${SERVICE_PATH}/app.py`]),
    dockerfile: runGit(["rev-parse", `${ref}:${SERVICE_PATH}/Dockerfile`]),
    requirements: runGit(["rev-parse", `${ref}:${SERVICE_PATH}/requirements.txt`]),
  };
}

function certifiedImageEvidence() {
  const evidence = gitJson("origin/main", IMAGE_EVIDENCE_PATH);
  const image = text(evidence?.immutable_image_reference);
  const sourceSha = text(evidence?.source_sha);
  if (
    evidence?.success !== true ||
    evidence?.contract !== "AVANTIQO_VOICE_REALTIME_STT_WORKER_IMAGE_RESULT_V1" ||
    evidence?.source_sha_matches_trigger !== true ||
    evidence?.build_job_result !== "success" ||
    evidence?.preflight_outcome !== "success" ||
    evidence?.build_outcome !== "success" ||
    evidence?.offline_model_baked !== true ||
    text(evidence?.foundation_model) !== FOUNDATION_MODEL ||
    text(evidence?.foundation_revision) !== FOUNDATION_REVISION ||
    text(evidence?.realtime_contract) !== REALTIME_CONTRACT ||
    text(evidence?.capability) !== CAPABILITY ||
    text(evidence?.websocket_path) !== WS_PATH ||
    !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image) ||
    !/^[a-f0-9]{40}$/i.test(sourceSha)
  ) {
    throw new Error(`${CONTRACT}_CERTIFIED_IMAGE_REQUIRED`);
  }

  const sourceBlobs = serviceBlobs(sourceSha);
  const mainBlobs = serviceBlobs("origin/main");
  if (JSON.stringify(sourceBlobs) !== JSON.stringify(mainBlobs)) {
    throw new Error(`${CONTRACT}_NEWEST_MAIN_REALTIME_SOURCE_DIVERGED_FROM_CERTIFIED_IMAGE`);
  }

  const safeLease = runGit(["show", `origin/main:${SAFE_LEASE_PATH}`]);
  for (const fragment of [
    `CANONICAL_ENDPOINT_NAME = "${ENDPOINT_NAME}"`,
    `CANONICAL_ENDPOINT_TYPE = "${ENDPOINT_TYPE}"`,
    `CANONICAL_GPU_POOL = "${GPU_POOL}"`,
    `REST_BASE = "${V2_BASE}"`,
    `worker_inventory_api: "/v2/serverless/{id}/workers"`,
    `scaler_type: "REQUEST_COUNT"`,
  ]) {
    if (!safeLease.includes(fragment)) {
      throw new Error(`${CONTRACT}_SAFE_LEASE_CONTRACT_INCOMPLETE`);
    }
  }

  return {
    image,
    digest: text(evidence?.image_digest),
    source_sha: sourceSha,
    source_blobs: sourceBlobs,
  };
}

function parseBearerChallenge(value) {
  const raw = text(value);
  if (!/^Bearer\s+/i.test(raw)) return null;
  const params = {};
  const expression = /([a-zA-Z]+)="([^"]*)"/g;
  let match;
  while ((match = expression.exec(raw))) params[match[1].toLowerCase()] = match[2];
  return params.realm ? params : null;
}

function ghcrImageParts(image) {
  const match = image.match(/^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/i);
  if (!match) throw new Error(`${CONTRACT}_IMAGE_REFERENCE_INVALID`);
  return { repository: match[1], reference: match[2] };
}

function localGhcrCredential() {
  const envUsername = text(
    process.env.AVANTIQO_VOICE_GHCR_USERNAME ||
    process.env.GHCR_USERNAME ||
    process.env.GITHUB_USERNAME,
  );
  const envToken = text(
    process.env.AVANTIQO_VOICE_GHCR_READ_TOKEN ||
    process.env.GHCR_TOKEN ||
    process.env.CR_PAT,
  );
  if (envUsername && envToken) {
    return { username: envUsername, password: envToken, source: "ENV" };
  }
  if (envUsername || envToken) {
    throw new Error(`${CONTRACT}_GHCR_USERNAME_AND_TOKEN_REQUIRED_TOGETHER`);
  }

  const username = commandOutput("gh", ["api", "user", "--jq", ".login"]);
  const password = commandOutput("gh", ["auth", "token", "--hostname", "github.com"]);
  if (username && password) {
    return { username, password, source: "GH_CLI" };
  }
  throw new Error(`${CONTRACT}_LOCAL_GITHUB_CREDENTIAL_REQUIRED`);
}

async function canPullGhcrImage(image, credential) {
  const { repository, reference } = ghcrImageParts(image);
  const manifestUrl = `https://ghcr.io/v2/${repository}/manifests/${reference}`;
  const accept = [
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
  ].join(", ");

  const first = await fetch(manifestUrl, {
    method: "GET",
    headers: { Accept: accept },
    signal: AbortSignal.timeout(30_000),
  });
  if (first.ok) return { success: true, public: true };
  if (first.status !== 401) return { success: false, public: false };

  const challenge = parseBearerChallenge(first.headers.get("www-authenticate"));
  if (!challenge) return { success: false, public: false };
  const tokenUrl = new URL(challenge.realm);
  tokenUrl.searchParams.set("service", challenge.service || "ghcr.io");
  tokenUrl.searchParams.set("scope", challenge.scope || `repository:${repository}:pull`);
  const tokenResponse = await fetch(tokenUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!tokenResponse.ok) return { success: false, public: false };
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  const registryToken = text(tokenBody?.token || tokenBody?.access_token);
  if (!registryToken) return { success: false, public: false };
  const manifest = await fetch(manifestUrl, {
    headers: { Accept: accept, Authorization: `Bearer ${registryToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  return { success: manifest.ok, public: false };
}

async function requestJson(pathname, apiKey, options = {}) {
  const response = await fetch(`${V2_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });

  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`${CONTRACT}_RUNPOD_HTTP_${response.status}:${redact(body?.detail || body?.message || body?.error || raw || "EMPTY_BODY")}`);
  }
  return { status: response.status, body };
}

function normalizeList(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  if (Array.isArray(value?.data?.[key])) return value.data[key];
  return [];
}

async function endpointList(apiKey) {
  const { body } = await requestJson("/serverless", apiKey);
  return normalizeList(body, "endpoints");
}

async function registryList(apiKey) {
  const { body } = await requestJson("/registries", apiKey);
  return normalizeList(body, "registries");
}

function exactEndpointMatches(endpoints) {
  return endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
}

function createdId(body, nestedKey) {
  return text(body?.id || body?.[nestedKey]?.id || body?.data?.id || body?.data?.[nestedKey]?.id);
}

async function getEndpoint(endpointId, apiKey) {
  const { body } = await requestJson(`/serverless/${encodeURIComponent(endpointId)}`, apiKey);
  return object(body);
}

async function getWorkers(endpointId, apiKey) {
  const { body } = await requestJson(`/serverless/${encodeURIComponent(endpointId)}/workers`, apiKey);
  return {
    workers: list(body?.workers),
    summary: object(body?.summary),
  };
}

function assertCreatedEndpoint(endpoint, workers, expected) {
  if (text(endpoint?.id) !== expected.endpointId) throw new Error(`${CONTRACT}_VERIFY_ENDPOINT_ID_MISMATCH`);
  if (text(endpoint?.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_VERIFY_ENDPOINT_NAME_MISMATCH`);
  if (text(endpoint?.type) !== ENDPOINT_TYPE) throw new Error(`${CONTRACT}_VERIFY_ENDPOINT_TYPE_MISMATCH`);
  if (text(endpoint?.image) !== expected.image) throw new Error(`${CONTRACT}_VERIFY_IMAGE_MISMATCH`);
  if (text(endpoint?.registry) !== expected.registryId) throw new Error(`${CONTRACT}_VERIFY_REGISTRY_MISMATCH`);

  const gpu = object(endpoint?.gpu);
  const pools = list(gpu?.pools).map(text).filter(Boolean);
  if (pools.length !== 1 || pools[0] !== GPU_POOL || finite(gpu?.count, -1) !== GPU_COUNT) {
    throw new Error(`${CONTRACT}_VERIFY_GPU_CONFIG_MISMATCH`);
  }

  const bounds = object(endpoint?.workers);
  if (
    finite(bounds?.min, -1) !== 0 ||
    finite(bounds?.max, -1) !== 0 ||
    finite(bounds?.idleTimeout, -1) !== IDLE_TIMEOUT_SECONDS
  ) {
    throw new Error(`${CONTRACT}_VERIFY_REST_STATE_NOT_ZERO_ZERO`);
  }

  const scaling = object(endpoint?.scaling);
  if (
    text(scaling?.type) !== "REQUEST_COUNT" ||
    finite(scaling?.requestCount, -1) !== REQUEST_COUNT_TARGET
  ) {
    throw new Error(`${CONTRACT}_VERIFY_SCALING_MISMATCH`);
  }

  const ports = list(endpoint?.ports).map(text).filter(Boolean);
  if (!ports.includes("80/http")) throw new Error(`${CONTRACT}_VERIFY_PORT_MISMATCH`);

  const env = object(endpoint?.env);
  if (
    text(env.PORT) !== "80" ||
    text(env.PORT_HEALTH) !== "80" ||
    text(env.AVANTIQO_VOICE_STT_FOUNDATION_MODEL) !== FOUNDATION_MODEL ||
    text(env.AVANTIQO_VOICE_REALTIME_RELAY_SECRET) !== expected.relaySecret
  ) {
    throw new Error(`${CONTRACT}_VERIFY_ENV_MISMATCH`);
  }

  if (workers.workers.length !== 0) throw new Error(`${CONTRACT}_VERIFY_ACTIVE_WORKER_PRESENT`);
  const total = finite(workers.summary?.total, 0);
  if (total !== 0) throw new Error(`${CONTRACT}_VERIFY_WORKER_SUMMARY_NOT_ZERO`);
}

async function bestEffortRollback({ endpointId, registryId, apiKey }) {
  const result = {
    endpoint_park_attempted: false,
    endpoint_deleted: false,
    registry_deleted: false,
  };

  if (endpointId) {
    try {
      result.endpoint_park_attempted = true;
      await requestJson(`/serverless/${encodeURIComponent(endpointId)}`, apiKey, {
        method: "PATCH",
        body: { workers: { min: 0, max: 0, idleTimeout: IDLE_TIMEOUT_SECONDS } },
      });
    } catch {}
    try {
      await requestJson(`/serverless/${encodeURIComponent(endpointId)}`, apiKey, { method: "DELETE" });
      result.endpoint_deleted = true;
    } catch {}
  }

  if (registryId) {
    try {
      await requestJson(`/registries/${encodeURIComponent(registryId)}`, apiKey, { method: "DELETE" });
      result.registry_deleted = true;
    } catch {}
  }

  return result;
}

const apply = process.argv.includes("--apply");
if (
  apply &&
  text(process.env.AVANTIQO_VOICE_REALTIME_RUNPOD_LB_PROVISION_APPROVED).toUpperCase() !== "YES"
) {
  throw new Error("AVANTIQO_VOICE_REALTIME_RUNPOD_LB_PROVISION_APPROVED=YES_REQUIRED");
}

const newestMainSha = fetchNewestMainAndRequireCheckoutMatch("PREFLIGHT");
const evidence = certifiedImageEvidence();
const relaySecret = required("AVANTIQO_VOICE_REALTIME_RELAY_SECRET");
if (relaySecret.length < 32) throw new Error(`${CONTRACT}_RELAY_SECRET_MIN_32_REQUIRED`);
if (required("AVANTIQO_VOICE_REALTIME_RUNPOD_ENDPOINT_NAME") !== ENDPOINT_NAME) {
  throw new Error(`${CONTRACT}_ENDPOINT_NAME_ENV_MISMATCH`);
}

const apiKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const credential = localGhcrCredential();
const pull = await canPullGhcrImage(evidence.image, credential);
if (!pull.success || pull.public === true) {
  throw new Error(`${CONTRACT}_PRIVATE_CERTIFIED_IMAGE_PULL_REQUIRED`);
}

const [endpoints, registries] = await Promise.all([
  endpointList(apiKey),
  registryList(apiKey),
]);
const matches = exactEndpointMatches(endpoints);
const dedicatedRegistryPrefix = "avantiqo-ghcr-realtime-";
const existingDedicatedRegistries = registries.filter((registry) => text(registry?.name).startsWith(dedicatedRegistryPrefix));

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN_READ_ONLY",
  newest_main_sha: newestMainSha,
  certified_image: {
    image: evidence.image,
    digest: evidence.digest,
    source_sha: evidence.source_sha,
    newest_main_source_equivalent: true,
  },
  local_prerequisites: {
    relay_secret_configured: true,
    relay_secret_printed: false,
    endpoint_name_configured: true,
    local_ghcr_credential_source: credential.source,
    exact_private_image_pull_verified: true,
  },
  runpod_preflight: {
    endpoint_count: endpoints.length,
    exact_endpoint_matches: matches.length,
    endpoint_absent: matches.length === 0,
    registry_count: registries.length,
    existing_dedicated_realtime_registry_count: existingDedicatedRegistries.length,
    ambiguous_existing_registries_reused: false,
  },
  proposed_endpoint: {
    name: ENDPOINT_NAME,
    type: ENDPOINT_TYPE,
    image: evidence.image,
    registry: "[FRESH_DEDICATED_REALTIME_REGISTRY_ID]",
    gpu: { pools: [GPU_POOL], count: GPU_COUNT },
    workers: { min: 0, max: 0, idleTimeout: IDLE_TIMEOUT_SECONDS },
    scaling: { type: "REQUEST_COUNT", requestCount: REQUEST_COUNT_TARGET },
    ports: ["80/http"],
    relay_secret: "[CONFIGURED_NOT_PRINTED]",
  },
  apply_ready: matches.length === 0,
  explicit_apply_approval_required: true,
  fresh_registry_auth_created: false,
  endpoint_created: false,
  endpoint_verified_zero_zero: false,
  active_workers: 0,
  gpu_started: false,
  realtime_sessions_started: 0,
  transcription_performed: false,
  tts_touched: false,
  music_touched: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};

if (matches.length !== 0) {
  throw new Error(`${CONTRACT}_REALTIME_ENDPOINT_ALREADY_EXISTS:matches=${matches.length}`);
}

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  console.log(`${CONTRACT}=PASS`);
} else {
  let freshRegistryId = "";
  let endpointId = "";
  try {
    fetchNewestMainAndRequireCheckoutMatch("BEFORE_REGISTRY_WRITE");

    const digestShort = evidence.digest.replace(/^sha256:/, "").slice(0, 12);
    const registryName = `${dedicatedRegistryPrefix}${digestShort}-${Date.now().toString(36)}`;
    const registryCreate = await requestJson("/registries", apiKey, {
      method: "POST",
      body: {
        name: registryName,
        username: credential.username,
        password: credential.password,
      },
    });
    freshRegistryId = createdId(registryCreate.body, "registry");
    if (!freshRegistryId) throw new Error(`${CONTRACT}_CREATED_REGISTRY_ID_REQUIRED`);
    plan.fresh_registry_auth_created = true;

    fetchNewestMainAndRequireCheckoutMatch("BEFORE_ENDPOINT_WRITE");
    const beforeEndpointMatches = exactEndpointMatches(await endpointList(apiKey));
    if (beforeEndpointMatches.length !== 0) {
      throw new Error(`${CONTRACT}_CONCURRENT_ENDPOINT_CREATE_DETECTED`);
    }

    const endpointCreate = await requestJson("/serverless", apiKey, {
      method: "POST",
      body: {
        name: ENDPOINT_NAME,
        image: evidence.image,
        type: ENDPOINT_TYPE,
        gpu: { pools: [GPU_POOL], count: GPU_COUNT },
        disk: 30,
        ports: ["80/http"],
        env: {
          PORT: "80",
          PORT_HEALTH: "80",
          AVANTIQO_VOICE_STT_FOUNDATION_MODEL: FOUNDATION_MODEL,
          AVANTIQO_VOICE_REALTIME_RELAY_SECRET: relaySecret,
        },
        registry: freshRegistryId,
        workers: { min: 0, max: 0, idleTimeout: IDLE_TIMEOUT_SECONDS },
        scaling: { type: "REQUEST_COUNT", requestCount: REQUEST_COUNT_TARGET },
        flashboot: "FLASHBOOT",
      },
    });
    endpointId = createdId(endpointCreate.body, "endpoint");
    if (!endpointId) throw new Error(`${CONTRACT}_CREATED_ENDPOINT_ID_REQUIRED`);
    plan.endpoint_created = true;

    const [verifiedEndpoint, workerInventory] = await Promise.all([
      getEndpoint(endpointId, apiKey),
      getWorkers(endpointId, apiKey),
    ]);
    assertCreatedEndpoint(verifiedEndpoint, workerInventory, {
      endpointId,
      image: evidence.image,
      registryId: freshRegistryId,
      relaySecret,
    });

    plan.endpoint_verified_zero_zero = true;
    plan.active_workers = 0;
    plan.websocket_url = `wss://${endpointId}.api.runpod.ai${WS_PATH}`;
    plan.registry_auth_id_present = true;
    plan.endpoint_id_present = true;

    console.log(JSON.stringify(plan, null, 2));
    console.log(`${CONTRACT}=PASS`);
  } catch (error) {
    const rollback = await bestEffortRollback({ endpointId, registryId: freshRegistryId, apiKey });
    console.error(JSON.stringify({
      success: false,
      contract: CONTRACT,
      mode: "APPLY",
      error: redact(error instanceof Error ? error.message : error),
      rollback,
      endpoint_left_intentionally_running: false,
      realtime_session_started: false,
      transcription_performed: false,
      secrets_printed: false,
    }, null, 2));
    throw new Error(`${CONTRACT}_APPLY_FAILED_AFTER_ROLLBACK_ATTEMPT`);
  }
}
