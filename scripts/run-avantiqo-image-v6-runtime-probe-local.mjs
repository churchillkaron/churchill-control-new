const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENDPOINT_NAME = "avantiqo-image-v1";

const text = (value) => String(value ?? "").trim();

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function readJson(response, code) {
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${code}_HTTP_${response.status}`);
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${code}_INVALID_JSON`);
  }
}

async function readEndpoint(endpointId, managementKey) {
  const response = await fetch(`${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_IMAGE_V6_QUEUE_BRIDGE_ENDPOINT");
}

async function validateQueueCredential(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  await response.arrayBuffer();
  return response.ok;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const endpoint = await readEndpoint(endpointId, managementKey);
if (text(endpoint?.id) !== endpointId || text(endpoint?.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_V6_QUEUE_BRIDGE_ENDPOINT_IDENTITY_INVALID");
}

const dedicatedKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY);
const genericKey = text(process.env.RUNPOD_API_KEY);
const candidates = [
  dedicatedKey ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", credential: dedicatedKey } : null,
  genericKey ? { source: "RUNPOD_API_KEY", credential: genericKey } : null,
  { source: "RUNPOD_MANAGEMENT_API_KEY", credential: managementKey },
].filter(Boolean);

let selected = null;
for (const candidate of candidates) {
  if (await validateQueueCredential(endpointId, candidate.credential)) {
    selected = candidate;
    break;
  }
}
if (!selected) {
  throw new Error("AVANTIQO_IMAGE_V6_QUEUE_CREDENTIAL_SOURCE_NOT_FOUND");
}

process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY = selected.credential;
console.log(`AVANTIQO_IMAGE_V6_QUEUE_CREDENTIAL_SOURCE=${selected.source}`);
console.log("AVANTIQO_IMAGE_V6_QUEUE_CREDENTIAL_VALIDATED=true");
console.log("AVANTIQO_IMAGE_V6_QUEUE_CREDENTIAL_VALUE_PRINTED=false");
console.log("AVANTIQO_IMAGE_V6_QUEUE_CREDENTIAL_PERSISTED=false");
console.log("AVANTIQO_IMAGE_V6_QUEUE_CREDENTIAL_ENDPOINT_MUTATED=false");
console.log("AVANTIQO_IMAGE_V6_QUEUE_CREDENTIAL_PROVIDER_JOB_SUBMITTED=false");

await import("./probe-avantiqo-image-v6-runtime-local.mjs");
