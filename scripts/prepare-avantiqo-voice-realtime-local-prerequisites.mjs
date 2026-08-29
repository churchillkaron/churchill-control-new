import { randomBytes } from "node:crypto";
import { chmod, lstat, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_REALTIME_LOCAL_PREREQUISITES_V1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-stt-realtime-worker-image.json";
const ENDPOINT_NAME = "avantiqo-voice-stt-realtime-v1";
const RELAY_SECRET_KEY = "AVANTIQO_VOICE_REALTIME_RELAY_SECRET";
const ENDPOINT_NAME_KEY = "AVANTIQO_VOICE_REALTIME_RUNPOD_ENDPOINT_NAME";
const MIN_RELAY_SECRET_LENGTH = 32;

const text = (value) => String(value ?? "").trim();

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 1000);
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
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${CONTRACT}_GIT_${String(args[0] || "COMMAND").toUpperCase()}_FAILED:${redact(result.stderr || result.stdout)}`);
  }
  return text(result.stdout);
}

function certifiedRealtimeImage() {
  runGit(["fetch", "origin", "main", "--quiet"]);
  const evidence = JSON.parse(runGit(["show", `origin/main:${IMAGE_EVIDENCE_PATH}`]));
  const image = text(evidence?.immutable_image_reference);
  if (
    evidence?.success !== true ||
    evidence?.contract !== "AVANTIQO_VOICE_REALTIME_STT_WORKER_IMAGE_RESULT_V1" ||
    evidence?.source_sha_matches_trigger !== true ||
    evidence?.build_job_result !== "success" ||
    evidence?.preflight_outcome !== "success" ||
    evidence?.build_outcome !== "success" ||
    evidence?.offline_model_baked !== true ||
    text(evidence?.foundation_model) !== "openai/whisper-large-v3-turbo" ||
    text(evidence?.foundation_revision) !== "41f01f3fe87f28c78e2fbf8b568835947dd65ed9" ||
    text(evidence?.realtime_contract) !== "AVANTIQO_VOICE_STT_REALTIME_V1" ||
    text(evidence?.capability) !== "ai.speech.to.text.realtime" ||
    text(evidence?.websocket_path) !== "/v1/realtime/transcribe" ||
    !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)
  ) {
    throw new Error(`${CONTRACT}_CERTIFIED_REALTIME_IMAGE_REQUIRED`);
  }
  return {
    image,
    digest: text(evidence?.image_digest),
    source_sha: text(evidence?.source_sha),
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

async function resolvedEnvPath() {
  const envPath = join(process.cwd(), ".env.local");
  try {
    const info = await lstat(envPath);
    if (info.isSymbolicLink()) return realpath(envPath);
    return envPath;
  } catch {
    return envPath;
  }
}

function envValueFromText(raw, key) {
  const pattern = new RegExp(`^${key}=([^\\r\\n]*)$`, "m");
  const match = raw.match(pattern);
  if (!match) return "";
  const value = text(match[1]);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function setEnvValue(raw, key, value) {
  const lines = raw.split(/\r?\n/).filter((line) => !line.startsWith(`${key}=`));
  while (lines.length && lines.at(-1) === "") lines.pop();
  lines.push(`${key}=${value}`);
  return `${lines.join("\n")}\n`;
}

async function writeEnvSafely(envPath, raw) {
  const dir = dirname(envPath);
  const temp = join(dir, `.env.local.avantiqo-voice-realtime-${process.pid}-${Date.now()}.tmp`);
  let mode = 0o600;
  try {
    mode = (await stat(envPath)).mode & 0o777;
  } catch {}
  await writeFile(temp, raw, { encoding: "utf8", mode });
  await chmod(temp, mode);
  await rename(temp, envPath);
}

const applyLocal = process.argv.includes("--apply-local");
if (
  applyLocal &&
  text(process.env.AVANTIQO_VOICE_REALTIME_LOCAL_PREREQUISITES_APPROVED).toUpperCase() !== "YES"
) {
  throw new Error("AVANTIQO_VOICE_REALTIME_LOCAL_PREREQUISITES_APPROVED=YES_REQUIRED");
}

const evidence = certifiedRealtimeImage();
const credential = localGhcrCredential();
const pull = await canPullGhcrImage(evidence.image, credential);
if (!pull.success) {
  throw new Error(`${CONTRACT}_READ_PACKAGES_REQUIRED`);
}

const envPath = await resolvedEnvPath();
let envRaw = "";
try {
  envRaw = await readFile(envPath, "utf8");
} catch {}

const rawRelaySecret = envValueFromText(envRaw, RELAY_SECRET_KEY);
const rawEndpointName = envValueFromText(envRaw, ENDPOINT_NAME_KEY);
const processRelaySecret = text(process.env[RELAY_SECRET_KEY]);
const processEndpointName = text(process.env[ENDPOINT_NAME_KEY]);
const existingRelaySecret = rawRelaySecret || processRelaySecret;
const existingEndpointName = rawEndpointName || processEndpointName;

if (existingEndpointName && existingEndpointName !== ENDPOINT_NAME) {
  throw new Error(`${CONTRACT}_ENDPOINT_NAME_CONFLICT`);
}

let relaySecretGenerated = false;
let endpointNameStored = false;
let relaySecretStored = existingRelaySecret.length >= MIN_RELAY_SECRET_LENGTH;

if (applyLocal) {
  let nextRaw = envRaw;
  if (!relaySecretStored) {
    const generated = randomBytes(48).toString("base64url");
    nextRaw = setEnvValue(nextRaw, RELAY_SECRET_KEY, generated);
    relaySecretStored = true;
    relaySecretGenerated = true;
  }
  if (existingEndpointName !== ENDPOINT_NAME || rawEndpointName !== ENDPOINT_NAME) {
    nextRaw = setEnvValue(nextRaw, ENDPOINT_NAME_KEY, ENDPOINT_NAME);
    endpointNameStored = true;
  }
  if (nextRaw !== envRaw) {
    await writeEnvSafely(envPath, nextRaw);
  }
}

const dedicatedRegistryAuthRequired = pull.public !== true;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: applyLocal ? "APPLY_LOCAL_ONLY" : "PLAN_LOCAL_ONLY",
  newest_main_sha: runGit(["rev-parse", "origin/main"]),
  certified_image: {
    image: evidence.image,
    digest: evidence.digest,
    source_sha: evidence.source_sha,
  },
  ghcr: {
    local_credential_source: credential.source,
    exact_certified_image_pull_verified: true,
    image_public: pull.public,
    dedicated_runpod_registry_auth_required: dedicatedRegistryAuthRequired,
    runpod_registry_auth_strategy: dedicatedRegistryAuthRequired
      ? "CREATE_FRESH_DEDICATED_REALTIME_AUTH_ON_EXPLICIT_RUNPOD_APPLY"
      : "NO_REGISTRY_AUTH_REQUIRED_PUBLIC_IMAGE",
    existing_ambiguous_registry_auths_reused: false,
  },
  local_configuration: {
    relay_secret_minimum_length: MIN_RELAY_SECRET_LENGTH,
    relay_secret_configured: relaySecretStored,
    relay_secret_generated_now: relaySecretGenerated,
    relay_secret_printed: false,
    endpoint_name: ENDPOINT_NAME,
    endpoint_name_configured: applyLocal ? true : existingEndpointName === ENDPOINT_NAME,
    endpoint_name_stored_now: endpointNameStored,
  },
  next_runpod_mutation_requires_explicit_approval: true,
  runpod_registry_auth_created: false,
  runpod_endpoint_created: false,
  runpod_endpoint_updated: false,
  workers_scaled: false,
  gpu_started: false,
  realtime_sessions_started: 0,
  transcription_performed: false,
  tts_touched: false,
  music_touched: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));

console.log(`${CONTRACT}=PASS`);
