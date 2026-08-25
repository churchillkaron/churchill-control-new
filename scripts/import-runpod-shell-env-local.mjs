import { readFile, rename, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";

const envPath = process.argv[2];
if (!envPath) {
  console.error("AVANTIQO_RUNPOD_LOCAL_IMPORT=FAIL:ENV_PATH_REQUIRED");
  process.exit(1);
}

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const allowedKeys = Object.freeze([
  "RUNPOD_API_KEY",
  "RUNPOD_MANAGEMENT_API_KEY",
  "RUNPOD_AVANTIQO_IMAGE_API_KEY",
  "RUNPOD_AVANTIQO_VIDEO_API_KEY",
  "RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_CODE_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID",
]);

const endpointSpecs = Object.freeze([
  ["RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID", ["avantiqo-image-v1"]],
  ["RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID", ["avantiqo-cinema-v1"]],
  ["RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID", ["avantiqo-intelligence-v1"]],
  ["RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID", ["avantiqo-intelligence-trainer-v1"]],
  ["RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID", ["avantiqo-intelligence-candidate-v1"]],
  ["RUNPOD_AVANTIQO_CODE_ENDPOINT_ID", ["avantiqo-code-v1"]],
  ["RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID", ["avantiqo-voice-stt-v1"]],
  [
    "RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID",
    ["avantiqo-voice-tts-v1-recovery-20260825", "avantiqo-voice-tts-v1"],
  ],
  ["RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID", ["avantiqo-audio-v1"]],
  ["RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID", ["avantiqo-lipsync-v1"]],
]);

function normalizeList(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeList(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

async function readEndpoints(credential) {
  const response = await fetch(
    "https://rest.runpod.io/v1/endpoints?includeTemplate=false&includeWorkers=false",
    {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = new Error(`RUNPOD_REST_HTTP_${response.status}`);
    error.httpStatus = response.status;
    throw error;
  }
  const endpoints = normalizeList(body, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  return endpoints;
}

function resolveEndpoint(endpoints, acceptedNames) {
  for (const name of acceptedNames) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.name) === name);
    if (matches.length > 1) throw new Error(`RUNPOD_ENDPOINT_NAME_AMBIGUOUS:${name}:${matches.length}`);
    if (matches.length === 1 && text(matches[0]?.id)) return text(matches[0].id);
  }
  return "";
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function statusLine(key, value) {
  return `${key}=${value ? "YES" : "NO"}`;
}

const originalSource = await readFile(envPath, "utf8");
const local = parseEnv(originalSource);

const localOrProcess = (key) => text(process.env[key]) || text(local[key]);
const runtimeKey =
  localOrProcess("RUNPOD_API_KEY") ||
  localOrProcess("RUNPOD_MANAGEMENT_API_KEY");

if (!runtimeKey) {
  console.log("AVANTIQO_RUNPOD_LOCAL_IMPORT_SOURCE=NONE");
  console.log("AVANTIQO_RUNPOD_LOCAL_IMPORT_SECRET_VALUES_PRINTED=false");
  process.exit(2);
}

const managementKey =
  localOrProcess("RUNPOD_MANAGEMENT_API_KEY") ||
  runtimeKey;

let endpoints;
try {
  endpoints = await readEndpoints(managementKey);
} catch (error) {
  if (managementKey !== runtimeKey && [401, 403].includes(Number(error?.httpStatus))) {
    endpoints = await readEndpoints(runtimeKey);
  } else {
    throw error;
  }
}

const values = {};
for (const key of allowedKeys) {
  const value = localOrProcess(key);
  if (value) values[key] = value;
}

values.RUNPOD_API_KEY = runtimeKey;
values.RUNPOD_MANAGEMENT_API_KEY = managementKey;
values.RUNPOD_AVANTIQO_IMAGE_API_KEY ||= runtimeKey;
values.RUNPOD_AVANTIQO_VIDEO_API_KEY ||= runtimeKey;

let discoveredEndpointCount = 0;
for (const [envName, acceptedNames] of endpointSpecs) {
  const resolved = resolveEndpoint(endpoints, acceptedNames);
  if (!resolved) continue;
  if (values[envName] !== resolved) discoveredEndpointCount += 1;
  values[envName] = resolved;
}

if (!text(values.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID)) {
  throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_NOT_RESOLVED");
}

const intelligenceEndpointExists = endpoints.some(
  (endpoint) => text(endpoint?.id) === text(values.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID),
);
if (!intelligenceEndpointExists) {
  throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_NOT_LIVE");
}

let source = originalSource;
let updatedCount = 0;
for (const [key, value] of Object.entries(values)) {
  if (!allowedKeys.includes(key) || !text(value)) continue;
  const nextLine = `${key}=${JSON.stringify(String(value))}`;
  const pattern = new RegExp(`^(?:export\\s+)?${escaped(key)}=.*$`, "m");
  if (pattern.test(source)) {
    const current = source.match(pattern)?.[0] || "";
    if (current === nextLine) continue;
    source = source.replace(pattern, nextLine);
    updatedCount += 1;
  } else {
    if (source.length && !source.endsWith("\n")) source += "\n";
    source += `${nextLine}\n`;
    updatedCount += 1;
  }
}

if (updatedCount > 0) {
  const temporaryPath = join(
    dirname(envPath),
    `.env.local.avantiqo-runpod-${process.pid}-${Date.now()}.tmp`,
  );
  await writeFile(temporaryPath, source, { mode: 0o600 });
  await rename(temporaryPath, envPath);
}
await chmod(envPath, 0o600);

const configured = Object.fromEntries(
  allowedKeys.map((key) => [key, Boolean(text(values[key]))]),
);

console.log("AVANTIQO_RUNPOD_LOCAL_IMPORT_SOURCE=SHELL_OR_ENV_LOCAL");
console.log("AVANTIQO_RUNPOD_LOCAL_IMPORT_AUTH_VALIDATED=YES");
console.log(`AVANTIQO_RUNPOD_LOCAL_IMPORT_UPDATED_COUNT=${updatedCount}`);
console.log(`AVANTIQO_RUNPOD_LOCAL_IMPORT_DISCOVERED_ENDPOINT_COUNT=${discoveredEndpointCount}`);
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_API_KEY_CONFIGURED", configured.RUNPOD_API_KEY));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_MANAGEMENT_KEY_CONFIGURED", configured.RUNPOD_MANAGEMENT_API_KEY));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_IMAGE_ENDPOINT_CONFIGURED", configured.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_VIDEO_ENDPOINT_CONFIGURED", configured.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_INTELLIGENCE_ENDPOINT_CONFIGURED", configured.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_INTELLIGENCE_TRAINER_ENDPOINT_CONFIGURED", configured.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_INTELLIGENCE_CANDIDATE_ENDPOINT_CONFIGURED", configured.RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_CODE_ENDPOINT_CONFIGURED", configured.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_VOICE_STT_ENDPOINT_CONFIGURED", configured.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_VOICE_TTS_ENDPOINT_CONFIGURED", configured.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_AUDIO_ENDPOINT_CONFIGURED", configured.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID));
console.log(statusLine("AVANTIQO_LOCAL_RUNPOD_LIPSYNC_ENDPOINT_CONFIGURED", configured.RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID));
console.log("AVANTIQO_RUNPOD_LOCAL_IMPORT_ENV_LOCAL_MODE=0600");
console.log("AVANTIQO_RUNPOD_LOCAL_IMPORT_SECRET_VALUES_PRINTED=false");
console.log("AVANTIQO_RUNPOD_LOCAL_IMPORT=PASS");
