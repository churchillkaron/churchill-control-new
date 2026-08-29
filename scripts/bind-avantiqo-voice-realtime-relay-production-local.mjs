#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_REALTIME_RELAY_PRODUCTION_BIND_V1";
const PRODUCTION_PROJECT_REF = "vfsjqabpkcbiuerhzugk";
const FUNCTION_NAME = "avantiqo-voice-realtime-relay";
const CLIENT_PROTOCOL = "avantiqo-voice-realtime-v1";
const ENDPOINT_NAME = "avantiqo-voice-stt-realtime-v1";
const ENDPOINT_TYPE = "LOAD_BALANCER";
const GPU_POOL = "AMPERE_16";
const GPU_COUNT = 1;
const IDLE_TIMEOUT_SECONDS = 5;
const REQUEST_COUNT_TARGET = 1;
const FOUNDATION_MODEL = "openai/whisper-large-v3-turbo";
const WS_PATH = "/v1/realtime/transcribe";
const RUNPOD_V2_BASE = "https://api.runpod.io/v2";
const BINDER_PATH = "scripts/bind-avantiqo-voice-realtime-relay-production-local.mjs";
const ENV_LOADER_PATH = "scripts/load-avantiqo-env.mjs";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-stt-realtime-worker-image.json";
const RELAY_SOURCE_PATH = "supabase/functions/avantiqo-voice-realtime-relay/index.ts";
const SAFE_LEASE_PATH = "supabase/functions/_shared/avantiqo-voice-realtime-safe-lease.ts";
const SUPABASE_CONFIG_PATH = "supabase/config.toml";
const APPROVAL_ENV = "AVANTIQO_VOICE_REALTIME_RELAY_PRODUCTION_BIND_APPROVED";
const VOICE_CRITICAL_PATHS = [
  BINDER_PATH,
  ENV_LOADER_PATH,
  IMAGE_EVIDENCE_PATH,
  RELAY_SOURCE_PATH,
  SAFE_LEASE_PATH,
  SUPABASE_CONFIG_PATH,
];

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[REDACTED]")
    .replace(/(AVANTIQO_VOICE_REALTIME_RELAY_SECRET["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[REDACTED]")
    .slice(0, 1400);
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${CONTRACT}_GIT_${String(args[0] || "COMMAND").toUpperCase()}_FAILED:${redact(result.stderr || result.stdout)}`);
  }
  return text(result.stdout);
}

function runCommand(command, args, label, { quietSuccess = true } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr || result.stdout || "UNKNOWN_FAILURE";
    throw new Error(`${CONTRACT}_${label}_FAILED:${redact(detail)}`);
  }
  const stdout = text(result.stdout);
  if (!quietSuccess && stdout) console.log(stdout);
  return stdout;
}

function gitBlob(ref, path) {
  return runGit(["rev-parse", `${ref}:${path}`]);
}

function fetchNewestMainAndRequireVoiceEquivalent(label) {
  runGit(["fetch", "origin", "main", "--quiet"]);
  const head = runGit(["rev-parse", "HEAD"]);
  const newest = runGit(["rev-parse", "origin/main"]);
  const changedCriticalPaths = VOICE_CRITICAL_PATHS.filter(
    (path) => gitBlob(head, path) !== gitBlob(newest, path),
  );
  if (changedCriticalPaths.length) {
    throw new Error(
      `${CONTRACT}_${label}_VOICE_CRITICAL_SOURCE_CHANGED:` +
      `head=${head}:origin_main=${newest}:paths=${changedCriticalPaths.join(",")}`,
    );
  }
  return {
    head,
    newest,
    main_advanced: head !== newest,
    voice_critical_source_equivalent: true,
  };
}

function gitShow(path) {
  return runGit(["show", `origin/main:${path}`]);
}

function certifiedImage() {
  const evidence = JSON.parse(gitShow(IMAGE_EVIDENCE_PATH));
  const image = text(evidence?.immutable_image_reference);
  if (
    evidence?.success !== true ||
    evidence?.contract !== "AVANTIQO_VOICE_REALTIME_STT_WORKER_IMAGE_RESULT_V1" ||
    evidence?.source_sha_matches_trigger !== true ||
    evidence?.build_job_result !== "success" ||
    evidence?.preflight_outcome !== "success" ||
    evidence?.build_outcome !== "success" ||
    evidence?.offline_model_baked !== true ||
    text(evidence?.foundation_model) !== FOUNDATION_MODEL ||
    text(evidence?.realtime_contract) !== "AVANTIQO_VOICE_STT_REALTIME_V1" ||
    text(evidence?.capability) !== "ai.speech.to.text.realtime" ||
    text(evidence?.websocket_path) !== WS_PATH ||
    !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)
  ) {
    throw new Error(`${CONTRACT}_CERTIFIED_IMAGE_REQUIRED`);
  }
  return {
    image,
    digest: text(evidence?.image_digest),
    source_sha: text(evidence?.source_sha),
  };
}

function assertRelaySourceContracts() {
  const relay = gitShow(RELAY_SOURCE_PATH);
  const safeLease = gitShow(SAFE_LEASE_PATH);
  const config = gitShow(SUPABASE_CONFIG_PATH);

  const relayFragments = [
    `const RELAY_CONTRACT = "AVANTIQO_VOICE_REALTIME_RELAY_V1"`,
    `const REALTIME_CONTRACT = "AVANTIQO_VOICE_STT_REALTIME_V1"`,
    `const CLIENT_PROTOCOL = "${CLIENT_PROTOCOL}"`,
    `Deno.env.get("AVANTIQO_VOICE_REALTIME_RUNPOD_WS_URL")`,
    `Deno.env.get("AVANTIQO_VOICE_REALTIME_RUNPOD_API_KEY")`,
    `Deno.env.get("AVANTIQO_VOICE_REALTIME_RELAY_SECRET")`,
    `Deno.env.get("AVANTIQO_VOICE_REALTIME_RELAY_ENABLED")`,
    `Deno.env.get("AVANTIQO_VOICE_REALTIME_ENGINE_CERTIFIED")`,
    `Deno.env.get("AVANTIQO_VOICE_REALTIME_RELEASE_APPROVED")`,
    `realtimeLease = await acquireVoiceRealtimeSafeLease(`,
  ];
  for (const fragment of relayFragments) {
    if (!relay.includes(fragment)) throw new Error(`${CONTRACT}_RELAY_SOURCE_CONTRACT_INCOMPLETE`);
  }

  const safeLeaseFragments = [
    `CANONICAL_ENDPOINT_NAME = "${ENDPOINT_NAME}"`,
    `CANONICAL_ENDPOINT_TYPE = "${ENDPOINT_TYPE}"`,
    `CANONICAL_GPU_POOL = "${GPU_POOL}"`,
    `REST_BASE = "${RUNPOD_V2_BASE}"`,
    `Deno.env.get("AVANTIQO_VOICE_REALTIME_RUNPOD_MANAGEMENT_API_KEY")`,
    `worker_inventory_api: "/v2/serverless/{id}/workers"`,
  ];
  for (const fragment of safeLeaseFragments) {
    if (!safeLease.includes(fragment)) throw new Error(`${CONTRACT}_SAFE_LEASE_SOURCE_CONTRACT_INCOMPLETE`);
  }

  const functionBlock = `[functions.${FUNCTION_NAME}]`;
  const functionIndex = config.indexOf(functionBlock);
  if (functionIndex < 0) throw new Error(`${CONTRACT}_SUPABASE_FUNCTION_CONFIG_REQUIRED`);
  const functionTail = config.slice(functionIndex, functionIndex + 220);
  if (!/verify_jwt\s*=\s*false/.test(functionTail)) {
    throw new Error(`${CONTRACT}_SUPABASE_FUNCTION_VERIFY_JWT_FALSE_REQUIRED`);
  }
}

function supabaseProjectRefFromUrl(rawUrl) {
  const hostname = new URL(rawUrl).hostname;
  const ref = text(hostname.split(".")[0]);
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error(`${CONTRACT}_SUPABASE_PROJECT_REF_INVALID`);
  return ref;
}

async function requestJson(url, apiKey, options = {}) {
  const response = await fetch(url, {
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
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.detail || body?.message || body?.error || raw || "EMPTY_BODY")}`);
  }
  return body ?? {};
}

function normalizeList(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  if (Array.isArray(value?.data?.[key])) return value.data[key];
  return [];
}

async function runpodSnapshot(apiKey, expectedImage, relaySecret) {
  const endpointListRaw = await requestJson(`${RUNPOD_V2_BASE}/serverless`, apiKey);
  const endpoints = normalizeList(endpointListRaw, "endpoints");
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`${CONTRACT}_REALTIME_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }

  const endpointId = text(matches[0]?.id);
  if (!endpointId) throw new Error(`${CONTRACT}_REALTIME_ENDPOINT_ID_REQUIRED`);

  const [endpointRaw, workersRaw] = await Promise.all([
    requestJson(`${RUNPOD_V2_BASE}/serverless/${encodeURIComponent(endpointId)}`, apiKey),
    requestJson(`${RUNPOD_V2_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, apiKey),
  ]);

  const endpoint = object(endpointRaw);
  const workers = normalizeList(workersRaw, "workers");
  const summary = object(workersRaw?.summary);
  const bounds = object(endpoint?.workers);
  const scaling = object(endpoint?.scaling);
  const gpu = object(endpoint?.gpu);
  const pools = list(gpu?.pools).map(text).filter(Boolean);
  const env = object(endpoint?.env);
  const ports = list(endpoint?.ports).map(text).filter(Boolean);

  const failures = [];
  if (text(endpoint?.id) !== endpointId) failures.push("ENDPOINT_ID_MISMATCH");
  if (text(endpoint?.name) !== ENDPOINT_NAME) failures.push("ENDPOINT_NAME_MISMATCH");
  if (text(endpoint?.type) !== ENDPOINT_TYPE) failures.push("ENDPOINT_TYPE_MISMATCH");
  if (text(endpoint?.image) !== expectedImage) failures.push("IMAGE_MISMATCH");
  if (!text(endpoint?.registry)) failures.push("REGISTRY_BINDING_MISSING");
  if (pools.length !== 1 || pools[0] !== GPU_POOL || finite(gpu?.count, -1) !== GPU_COUNT) failures.push("GPU_CONFIG_MISMATCH");
  if (finite(bounds?.min, -1) !== 0 || finite(bounds?.max, -1) !== 0 || finite(bounds?.idleTimeout, -1) !== IDLE_TIMEOUT_SECONDS) failures.push("REST_STATE_NOT_ZERO_ZERO");
  if (text(scaling?.type) !== "REQUEST_COUNT" || finite(scaling?.requestCount, -1) !== REQUEST_COUNT_TARGET) failures.push("SCALING_MISMATCH");
  if (!ports.includes("80/http")) failures.push("PORT_80_HTTP_MISSING");
  if (text(env.PORT) !== "80" || text(env.PORT_HEALTH) !== "80") failures.push("PORT_ENV_MISMATCH");
  if (text(env.AVANTIQO_VOICE_STT_FOUNDATION_MODEL) !== FOUNDATION_MODEL) failures.push("FOUNDATION_MODEL_ENV_MISMATCH");
  if (text(env.AVANTIQO_VOICE_REALTIME_RELAY_SECRET) !== relaySecret) failures.push("RELAY_SECRET_ENDPOINT_MISMATCH");
  if (workers.length !== 0) failures.push("ACTIVE_WORKER_PRESENT");
  if (finite(summary?.total, 0) !== 0) failures.push("WORKER_SUMMARY_NOT_ZERO");
  if (failures.length) throw new Error(`${CONTRACT}_RUNPOD_PREFLIGHT_FAILED:${failures.join("|")}`);

  return {
    endpoint_id: endpointId,
    websocket_url: `wss://${endpointId}.api.runpod.ai${WS_PATH}`,
    workers_min: 0,
    workers_max: 0,
    active_workers: 0,
    image: expectedImage,
    registry_bound: true,
  };
}

function supabaseCliVersion() {
  return runCommand("supabase", ["--version"], "SUPABASE_CLI_VERSION");
}

function listRemoteFunctions() {
  return runCommand(
    "supabase",
    ["functions", "list", "--project-ref", PRODUCTION_PROJECT_REF],
    "SUPABASE_FUNCTION_LIST",
  );
}

function remoteFunctionPresent(output) {
  return text(output).includes(FUNCTION_NAME);
}

async function writeSecretsFile(values) {
  const path = join(tmpdir(), `.avantiqo-voice-realtime-secrets-${process.pid}-${Date.now()}.env`);
  const body = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value).replace(/[\r\n]/g, "")}`)
    .join("\n") + "\n";
  await writeFile(path, body, { encoding: "utf8", mode: 0o600 });
  return path;
}

async function disabledGateProbe(functionUrl, publishableKey = "") {
  const url = new URL(functionUrl);
  const headers = {
    Connection: "Upgrade",
    Upgrade: "websocket",
    "Sec-WebSocket-Version": "13",
    "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
    "Sec-WebSocket-Protocol": CLIENT_PROTOCOL,
    Accept: "application/json",
    ...(publishableKey ? { apikey: publishableKey } : {}),
  };

  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers,
      timeout: 30_000,
    });

    let settled = false;
    request.on("upgrade", (_response, socket) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`${CONTRACT}_RELEASE_GATE_UNEXPECTEDLY_OPEN`));
    });
    request.on("response", (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (raw.length < 64_000) raw += chunk;
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch {}
        const error = text(body?.error);
        if (error !== "AVANTIQO_VOICE_REALTIME_RELAY_DISABLED") {
          reject(new Error(`${CONTRACT}_DISABLED_GATE_PROBE_UNEXPECTED:${response.statusCode}:${redact(error || raw)}`));
          return;
        }
        resolve({
          status: response.statusCode,
          disabled_gate_confirmed: true,
          realtime_streaming_certified: body?.realtime_streaming_certified === true,
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error(`${CONTRACT}_DISABLED_GATE_PROBE_TIMEOUT`)));
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.end();
  });
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const preflightSource = fetchNewestMainAndRequireVoiceEquivalent("PREFLIGHT");
const newestMainSha = preflightSource.newest;
assertRelaySourceContracts();
const evidence = certifiedImage();

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL", process.env.SUPABASE_URL).replace(/\/+$/, "");
const actualProjectRef = supabaseProjectRefFromUrl(supabaseUrl);
if (actualProjectRef !== PRODUCTION_PROJECT_REF) {
  throw new Error(`${CONTRACT}_PRODUCTION_PROJECT_MISMATCH:${actualProjectRef}`);
}

const relaySecret = required("AVANTIQO_VOICE_REALTIME_RELAY_SECRET");
if (relaySecret.length < 32) throw new Error(`${CONTRACT}_RELAY_SECRET_MIN_32_REQUIRED`);
if (required("AVANTIQO_VOICE_REALTIME_RUNPOD_ENDPOINT_NAME") !== ENDPOINT_NAME) {
  throw new Error(`${CONTRACT}_ENDPOINT_NAME_ENV_MISMATCH`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const websocketKey = required("RUNPOD_API_KEY", managementKey);
const publishableKey = text(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const cliVersion = supabaseCliVersion();
const runpodBefore = await runpodSnapshot(managementKey, evidence.image, relaySecret);
const remoteFunctionsBefore = listRemoteFunctions();
const functionPresentBefore = remoteFunctionPresent(remoteFunctionsBefore);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN_READ_ONLY",
  checkout_sha: preflightSource.head,
  newest_main_sha: newestMainSha,
  parallel_main_advance_tolerated: preflightSource.main_advanced,
  voice_critical_source_equivalent: true,
  production_project_ref: PRODUCTION_PROJECT_REF,
  production_project_match: true,
  supabase_cli_version: cliVersion || "present",
  relay_source_contract_valid: true,
  safe_lease_source_contract_valid: true,
  verify_jwt_false_configured: true,
  certified_image: {
    image: evidence.image,
    digest: evidence.digest,
    source_sha: evidence.source_sha,
  },
  runpod: {
    endpoint_id_present: true,
    websocket_url: runpodBefore.websocket_url,
    image_matches_certified: true,
    registry_bound: true,
    workers_min: runpodBefore.workers_min,
    workers_max: runpodBefore.workers_max,
    active_workers: runpodBefore.active_workers,
  },
  production_function: {
    existed_before: functionPresentBefore,
    expected_verify_jwt: false,
  },
  secret_binding: {
    relay_secret_configured_locally: true,
    relay_secret_printed: false,
    runpod_websocket_key_configured: true,
    runpod_management_key_configured: true,
    websocket_url_derived_from_verified_endpoint: true,
  },
  release_gates_to_store: {
    relay_enabled: false,
    engine_certified: false,
    release_approved: "NO",
  },
  apply_ready: !functionPresentBefore,
  explicit_apply_approval_required: true,
  secrets_updated: false,
  production_function_deployed: false,
  disabled_gate_verified: false,
  runpod_endpoint_mutated: false,
  workers_scaled: false,
  gpu_started: false,
  realtime_session_started: false,
  transcription_performed: false,
  tts_touched: false,
  music_touched: false,
  secrets_printed: false,
};

if (functionPresentBefore) {
  throw new Error(`${CONTRACT}_PRODUCTION_FUNCTION_ALREADY_EXISTS_RECONCILIATION_REQUIRED`);
}

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  console.log(`${CONTRACT}=PASS`);
} else {
  let secretsFile = "";
  try {
    fetchNewestMainAndRequireVoiceEquivalent("BEFORE_SECRET_WRITE");
    const runpodBeforeSecretWrite = await runpodSnapshot(managementKey, evidence.image, relaySecret);
    if (runpodBeforeSecretWrite.endpoint_id !== runpodBefore.endpoint_id) {
      throw new Error(`${CONTRACT}_ENDPOINT_CHANGED_BEFORE_SECRET_WRITE`);
    }

    secretsFile = await writeSecretsFile({
      AVANTIQO_VOICE_REALTIME_RUNPOD_WS_URL: runpodBefore.websocket_url,
      AVANTIQO_VOICE_REALTIME_RUNPOD_API_KEY: websocketKey,
      AVANTIQO_VOICE_REALTIME_RUNPOD_MANAGEMENT_API_KEY: managementKey,
      AVANTIQO_VOICE_REALTIME_RELAY_SECRET: relaySecret,
      AVANTIQO_VOICE_REALTIME_RUNPOD_ENDPOINT_NAME: ENDPOINT_NAME,
      AVANTIQO_VOICE_REALTIME_RELAY_ENABLED: "false",
      AVANTIQO_VOICE_REALTIME_ENGINE_CERTIFIED: "false",
      AVANTIQO_VOICE_REALTIME_RELEASE_APPROVED: "NO",
    });

    runCommand(
      "supabase",
      ["secrets", "set", "--project-ref", PRODUCTION_PROJECT_REF, "--env-file", secretsFile],
      "SUPABASE_SECRET_SET",
    );
    plan.secrets_updated = true;
    await rm(secretsFile, { force: true });
    secretsFile = "";

    fetchNewestMainAndRequireVoiceEquivalent("BEFORE_FUNCTION_DEPLOY");
    const functionListImmediatelyBeforeDeploy = listRemoteFunctions();
    if (remoteFunctionPresent(functionListImmediatelyBeforeDeploy)) {
      throw new Error(`${CONTRACT}_CONCURRENT_FUNCTION_DEPLOY_DETECTED`);
    }

    runCommand(
      "supabase",
      ["functions", "deploy", FUNCTION_NAME, "--project-ref", PRODUCTION_PROJECT_REF, "--no-verify-jwt"],
      "SUPABASE_FUNCTION_DEPLOY",
    );
    plan.production_function_deployed = true;

    const functionListAfter = listRemoteFunctions();
    if (!remoteFunctionPresent(functionListAfter)) {
      throw new Error(`${CONTRACT}_DEPLOYED_FUNCTION_NOT_LISTED`);
    }

    const functionUrl = `${supabaseUrl}/functions/v1/${FUNCTION_NAME}`;
    const gateProbe = await disabledGateProbe(functionUrl, publishableKey);
    if (gateProbe.disabled_gate_confirmed !== true || gateProbe.realtime_streaming_certified === true) {
      throw new Error(`${CONTRACT}_DISABLED_GATE_VERIFY_FAILED`);
    }
    plan.disabled_gate_verified = true;

    const runpodAfter = await runpodSnapshot(managementKey, evidence.image, relaySecret);
    if (runpodAfter.endpoint_id !== runpodBefore.endpoint_id) {
      throw new Error(`${CONTRACT}_RUNPOD_ENDPOINT_CHANGED_AFTER_DEPLOY`);
    }
    plan.runpod.after_deploy_workers_min = runpodAfter.workers_min;
    plan.runpod.after_deploy_workers_max = runpodAfter.workers_max;
    plan.runpod.after_deploy_active_workers = runpodAfter.active_workers;

    console.log(JSON.stringify(plan, null, 2));
    console.log(`${CONTRACT}=PASS`);
  } catch (error) {
    if (secretsFile) await rm(secretsFile, { force: true }).catch(() => null);
    console.error(JSON.stringify({
      success: false,
      contract: CONTRACT,
      mode: "APPLY",
      error: redact(error instanceof Error ? error.message : error),
      release_gates_intended_closed: true,
      runpod_endpoint_mutation_performed: false,
      realtime_session_started: false,
      transcription_performed: false,
      secrets_printed: false,
    }, null, 2));
    throw new Error(`${CONTRACT}_APPLY_FAILED`);
  }
}
