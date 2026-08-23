import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REST_BASE = "https://rest.runpod.io/v1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function request(path, credential) {
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpoints = await request("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");

const configuredId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const exactNameMatches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
let selected = null;

if (configuredId) {
  const configuredMatches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
  if (configuredMatches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_ENDPOINT_CONFIGURED_ID_NOT_FOUND:matches=${configuredMatches.length}`);
  }
  if (text(configuredMatches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error(
      `AVANTIQO_IMAGE_ENDPOINT_CONFIGURED_ID_NAME_MISMATCH:actual=${text(configuredMatches[0]?.name) || "MISSING"}`,
    );
  }
  selected = configuredMatches[0];
} else {
  if (exactNameMatches.length !== 1) {
    throw new Error(
      `AVANTIQO_IMAGE_ENDPOINT_AUTO_RESOLUTION_FAILED:name=${IMAGE_ENDPOINT_NAME}:matches=${exactNameMatches.length}`,
    );
  }
  selected = exactNameMatches[0];
}

const endpointId = text(selected?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_ENDPOINT_AUTO_RESOLUTION_ID_MISSING");

console.log(`AVANTIQO_IMAGE_ENDPOINT_RESOLUTION=${configuredId ? "ENV_VERIFIED" : "EXACT_NAME"}`);
console.log(`AVANTIQO_IMAGE_ENDPOINT_NAME=${IMAGE_ENDPOINT_NAME}`);
console.log("AVANTIQO_IMAGE_ENDPOINT_SECRET_VALUE_PRINTED=false");

const childScript = fileURLToPath(
  new URL("./unblock-avantiqo-image-cache-worker-local.mjs", import.meta.url),
);
const childArgs = process.argv.slice(2);
const result = spawnSync(process.execPath, [childScript, ...childArgs], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID: endpointId,
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.signal) {
  throw new Error(`AVANTIQO_IMAGE_CACHE_REPAIR_CHILD_SIGNAL:${result.signal}`);
}
process.exit(result.status ?? 1);
