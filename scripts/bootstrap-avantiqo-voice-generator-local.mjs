import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const ENV_LOCAL = path.resolve(process.cwd(), ".env.local");
const REGISTRY_AUTH_NAME = "avantiqo-ghcr-readonly";
const CONTRACT = "AVANTIQO_VOICE_GENERATOR_BOOTSTRAP_V1";
const STT_ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const TTS_ENDPOINT_NAME = "avantiqo-voice-tts-v1";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
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

async function rest(pathname, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 600);
    const error = new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function normalizeRegistryAuthResponse(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const preferredKeys = [
    "containerRegistryAuths",
    "containerRegistryCreds",
    "registryAuths",
    "registryCredentials",
    "credentials",
    "auths",
    "data",
    "items",
    "results",
  ];
  for (const key of preferredKeys) {
    if (Array.isArray(value[key])) return value[key];
  }

  const records = [];
  const seen = new Set();
  function visit(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (text(node.id) && text(node.name)) records.push(node);
    for (const nested of Object.values(node)) visit(nested, depth + 1);
  }
  visit(value);
  return records;
}

function registryDescriptor(item = {}) {
  return [
    item?.name,
    item?.registry,
    item?.registryUrl,
    item?.registry_url,
    item?.serverAddress,
    item?.server_address,
    item?.host,
    item?.url,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");
}

function resolveExistingRegistryAuth(items) {
  const explicitId = text(process.env.AVANTIQO_VOICE_RUNPOD_REGISTRY_AUTH_ID);
  if (explicitId) {
    const matches = items.filter((item) => text(item?.id) === explicitId);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error("AVANTIQO_VOICE_RUNPOD_REGISTRY_AUTH_ID_AMBIGUOUS");
  }

  const exact = items.filter((item) => text(item?.name) === REGISTRY_AUTH_NAME);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error("AVANTIQO_VOICE_RUNPOD_GHCR_AUTH_AMBIGUOUS");

  const ghcr = items.filter((item) => /ghcr|github/i.test(registryDescriptor(item)));
  if (ghcr.length === 1) return ghcr[0];
  if (ghcr.length > 1) throw new Error("AVANTIQO_VOICE_RUNPOD_GHCR_AUTH_AMBIGUOUS");
  return null;
}

async function imageEvidence() {
  let parsed = null;
  try {
    parsed = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch {
    throw new Error("AVANTIQO_VOICE_IMMUTABLE_WORKER_IMAGE_EVIDENCE_REQUIRED");
  }
  if (parsed?.success !== true || parsed?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1") {
    throw new Error("AVANTIQO_VOICE_WORKER_IMAGES_NOT_PASSED");
  }

  const images = {
    stt: text(parsed?.stt?.immutable_image_reference),
    tts: text(parsed?.tts?.immutable_image_reference),
  };
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(images.stt)) {
    throw new Error("AVANTIQO_VOICE_STT_IMMUTABLE_IMAGE_REQUIRED");
  }
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(images.tts)) {
    throw new Error("AVANTIQO_VOICE_TTS_IMMUTABLE_IMAGE_REQUIRED");
  }
  return images;
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
  if (!match) throw new Error("AVANTIQO_VOICE_GHCR_IMAGE_REFERENCE_INVALID");
  return { repository: match[1], reference: match[2] };
}

async function canPullGhcrImage(image, credential = null) {
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
  if (first.ok) return true;
  if (first.status !== 401) return false;

  const challenge = parseBearerChallenge(first.headers.get("www-authenticate"));
  if (!challenge) return false;
  const tokenUrl = new URL(challenge.realm);
  tokenUrl.searchParams.set("service", challenge.service || "ghcr.io");
  tokenUrl.searchParams.set("scope", challenge.scope || `repository:${repository}:pull`);

  const tokenHeaders = { Accept: "application/json" };
  if (credential) {
    tokenHeaders.Authorization = `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString("base64")}`;
  }
  const tokenResponse = await fetch(tokenUrl, {
    method: "GET",
    headers: tokenHeaders,
    signal: AbortSignal.timeout(30_000),
  });
  if (!tokenResponse.ok) return false;
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  const registryToken = text(tokenBody.token || tokenBody.access_token);
  if (!registryToken) return false;

  const manifest = await fetch(manifestUrl, {
    method: "GET",
    headers: {
      Accept: accept,
      Authorization: `Bearer ${registryToken}`,
    },
    signal: AbortSignal.timeout(30_000),
  });
  return manifest.ok;
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
    throw new Error("AVANTIQO_VOICE_GHCR_USERNAME_AND_TOKEN_REQUIRED_TOGETHER");
  }

  const username = commandOutput("gh", ["api", "user", "--jq", ".login"]);
  const password = commandOutput("gh", ["auth", "token", "--hostname", "github.com"]);
  if (username && password) return { username, password, source: "GH_CLI" };
  return null;
}

async function ensureRunpodRegistryAuth(managementKey, images) {
  const raw = await rest("/containerregistryauth", managementKey);
  let items = normalizeRegistryAuthResponse(raw);
  let existing = resolveExistingRegistryAuth(items);
  if (existing) {
    return { auth: existing, created: false, credential_source: "EXISTING_RUNPOD" };
  }

  const publicAccess = await Promise.all([
    canPullGhcrImage(images.stt),
    canPullGhcrImage(images.tts),
  ]);
  if (publicAccess.every(Boolean)) {
    throw new Error("AVANTIQO_VOICE_GHCR_IMAGES_PUBLIC_BUT_PROVISIONER_REQUIRES_AUTH_REPAIR_REQUIRED");
  }

  const credential = localGhcrCredential();
  if (!credential) {
    throw new Error(
      "AVANTIQO_VOICE_GHCR_PULL_CREDENTIAL_REQUIRED:run_gh_auth_refresh_-h_github.com_-s_read:packages_or_set_CR_PAT",
    );
  }

  const validated = await Promise.all([
    canPullGhcrImage(images.stt, credential),
    canPullGhcrImage(images.tts, credential),
  ]);
  if (!validated.every(Boolean)) {
    throw new Error(
      "AVANTIQO_VOICE_GHCR_PULL_ACCESS_REQUIRED:run_gh_auth_refresh_-h_github.com_-s_read:packages_or_use_classic_PAT_read:packages",
    );
  }

  const freshRaw = await rest("/containerregistryauth", managementKey);
  items = normalizeRegistryAuthResponse(freshRaw);
  existing = resolveExistingRegistryAuth(items);
  if (existing) {
    return { auth: existing, created: false, credential_source: "EXISTING_RUNPOD_AFTER_RECHECK" };
  }

  let created;
  try {
    created = await rest("/containerregistryauth", managementKey, {
      method: "POST",
      body: {
        name: REGISTRY_AUTH_NAME,
        username: credential.username,
        password: credential.password,
      },
    });
  } catch (error) {
    if (Number(error?.status) !== 409) throw error;
    const retryItems = normalizeRegistryAuthResponse(await rest("/containerregistryauth", managementKey));
    const raced = resolveExistingRegistryAuth(retryItems);
    if (!raced) throw error;
    return { auth: raced, created: false, credential_source: "EXISTING_RUNPOD_RACE" };
  }

  const id = text(created?.id);
  if (!id) throw new Error("AVANTIQO_VOICE_RUNPOD_CREATED_REGISTRY_AUTH_ID_REQUIRED");
  return {
    auth: { id, name: text(created?.name) || REGISTRY_AUTH_NAME },
    created: true,
    credential_source: credential.source,
  };
}

function normalizeEndpointList(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["endpoints", "serverlessEndpoints", "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function exactEndpoint(items, name) {
  const matches = items.filter((item) => text(item?.name) === name);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

function updateLocalEndpointBindings(bindings) {
  if (!fs.existsSync(ENV_LOCAL)) throw new Error("ENV_LOCAL_REQUIRED");
  let source = fs.readFileSync(ENV_LOCAL, "utf8");
  for (const [name, value] of Object.entries(bindings)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^(?:export\\s+)?${escaped}=.*$`, "m");
    const line = `${name}=${value}`;
    if (pattern.test(source)) source = source.replace(pattern, line);
    else {
      if (source.length && !source.endsWith("\n")) source += "\n";
      source += `${line}\n`;
    }
  }
  const temp = `${ENV_LOCAL}.${process.pid}.tmp`;
  fs.writeFileSync(temp, source, { mode: 0o600 });
  fs.renameSync(temp, ENV_LOCAL);
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`AVANTIQO_VOICE_CHILD_PROCESS_FAILED:${path.basename(args[0] || command)}:${result.status}`);
}

if (!process.argv.includes("--apply")) {
  throw new Error("AVANTIQO_VOICE_BOOTSTRAP_REQUIRES_APPLY");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
required("RUNPOD_API_KEY");
const images = await imageEvidence();

console.log(JSON.stringify({
  contract: CONTRACT,
  phase: "REGISTRY_AUTH",
  production_web_deploy: false,
  pricing_activation_performed: false,
  secret_values_printed: false,
}, null, 2));

const registry = await ensureRunpodRegistryAuth(managementKey, images);
const registryAuthId = text(registry.auth?.id);
if (!registryAuthId) throw new Error("AVANTIQO_VOICE_RUNPOD_REGISTRY_AUTH_ID_REQUIRED");

console.log(JSON.stringify({
  contract: CONTRACT,
  phase: "REGISTRY_AUTH_READY",
  registry_auth_created: registry.created,
  credential_source: registry.credential_source,
  registry_auth_id_present: true,
  secret_values_printed: false,
}, null, 2));

const childEnv = {
  ...process.env,
  AVANTIQO_VOICE_RUNPOD_PROVISION_APPROVED: "YES",
  AVANTIQO_VOICE_RUNPOD_REGISTRY_AUTH_ID: registryAuthId,
};

run(process.execPath, [
  "scripts/run-with-runpod-registry-auth-normalized-local.mjs",
  "scripts/provision-avantiqo-voice-runpod-endpoints-local.mjs",
  "--apply",
], childEnv);

const endpointRaw = await rest("/endpoints?includeTemplate=true&includeWorkers=false", managementKey);
const endpoints = normalizeEndpointList(endpointRaw);
const sttEndpoint = exactEndpoint(endpoints, STT_ENDPOINT_NAME);
const ttsEndpoint = exactEndpoint(endpoints, TTS_ENDPOINT_NAME);
const bindings = {
  RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID: text(sttEndpoint.id),
  RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID: text(ttsEndpoint.id),
};
if (!bindings.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID || !bindings.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID) {
  throw new Error("AVANTIQO_VOICE_ENDPOINT_IDS_REQUIRED_AFTER_PROVISION");
}
updateLocalEndpointBindings(bindings);

const smokeEnv = {
  ...process.env,
  ...bindings,
};
run(process.execPath, ["scripts/smoke-avantiqo-voice-generator.mjs"], smokeEnv);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  registry_auth_created: registry.created,
  stt_endpoint_ready: true,
  tts_endpoint_ready: true,
  roundtrip_smoke_executed: true,
  audio_output: "/tmp/avantiqo-voice-generator-smoke.wav",
  report_output: "/tmp/avantiqo-voice-generator-smoke.json",
  production_web_deploy: false,
  pricing_activation_performed: false,
  secret_values_printed: false,
}, null, 2));
