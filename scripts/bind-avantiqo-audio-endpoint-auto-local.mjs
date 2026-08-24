import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REST_BASE = "https://rest.runpod.io/v1";
const ENDPOINT_NAME = "avantiqo-audio-v1";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function rest(path, credential) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 800)}`);
  }
  return body;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");

const configuredId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
const exactNameMatches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
let selected = null;

if (configuredId) {
  const configuredMatches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
  if (configuredMatches.length !== 1) {
    throw new Error(`AVANTIQO_AUDIO_ENDPOINT_CONFIGURED_ID_NOT_FOUND:matches=${configuredMatches.length}`);
  }
  if (text(configuredMatches[0]?.name) !== ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_AUDIO_ENDPOINT_CONFIGURED_ID_NAME_MISMATCH:actual=${text(configuredMatches[0]?.name) || "MISSING"}`);
  }
  selected = configuredMatches[0];
} else {
  if (exactNameMatches.length !== 1) {
    throw new Error(`AVANTIQO_AUDIO_ENDPOINT_AUTO_RESOLUTION_FAILED:name=${ENDPOINT_NAME}:matches=${exactNameMatches.length}`);
  }
  selected = exactNameMatches[0];
}

const endpointId = text(selected?.id);
if (!endpointId) throw new Error("AVANTIQO_AUDIO_ENDPOINT_AUTO_RESOLUTION_ID_MISSING");

const collisions = [
  ["image", process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID],
  ["cinema", process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID],
  ["code", process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID],
  ["intelligence", process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID],
  ["voice_stt", process.env.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID],
  ["voice_tts", process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID],
  ["lipsync", process.env.RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID],
].filter(([, id]) => text(id) === endpointId);
if (collisions.length) {
  throw new Error(`AVANTIQO_AUDIO_ENDPOINT_COLLIDES_WITH_OTHER_ENGINE:${collisions.map(([label]) => label).join(",")}`);
}

console.log(`AVANTIQO_AUDIO_ENDPOINT_RESOLUTION=${configuredId ? "ENV_VERIFIED" : "EXACT_NAME"}`);
console.log(`AVANTIQO_AUDIO_ENDPOINT_NAME=${ENDPOINT_NAME}`);
console.log("AVANTIQO_AUDIO_ENDPOINT_ID_VALUE_PRINTED=false");
console.log("AVANTIQO_AUDIO_ENDPOINT_MODEL_GENERATION_PERFORMED=false");

const binder = fileURLToPath(new URL("./bind-avantiqo-audio-endpoint-local.mjs", import.meta.url));
const result = spawnSync(process.execPath, [binder, endpointId], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`AVANTIQO_AUDIO_ENDPOINT_BIND_CHILD_SIGNAL:${result.signal}`);
process.exit(result.status ?? 1);
