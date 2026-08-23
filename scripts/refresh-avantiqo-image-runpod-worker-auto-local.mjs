import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const IMAGE_SOURCE_PATH = "services/avantiqo-image-engine";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function resolveEndpointId(managementKey) {
  const configured = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  const response = await fetch(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
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
  if (!Array.isArray(body)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");

  if (configured) {
    const matches = body.filter((endpoint) => text(endpoint?.id) === configured);
    if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
      throw new Error("AVANTIQO_IMAGE_REFRESH_CONFIGURED_ENDPOINT_INVALID");
    }
    console.log("AVANTIQO_IMAGE_REFRESH_ENDPOINT_RESOLUTION=ENV_VERIFIED");
    return configured;
  }

  const matches = body.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_REFRESH_ENDPOINT_AUTO_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  const endpointId = text(matches[0]?.id);
  if (!endpointId) throw new Error("AVANTIQO_IMAGE_REFRESH_ENDPOINT_ID_MISSING");
  console.log("AVANTIQO_IMAGE_REFRESH_ENDPOINT_RESOLUTION=EXACT_NAME");
  console.log(`AVANTIQO_IMAGE_REFRESH_ENDPOINT_NAME=${IMAGE_ENDPOINT_NAME}`);
  console.log("AVANTIQO_IMAGE_REFRESH_ENDPOINT_SECRET_PRINTED=false");
  return endpointId;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = await resolveEndpointId(managementKey);

const syntax = spawnSync(
  "python3",
  [
    "-m",
    "py_compile",
    `${IMAGE_SOURCE_PATH}/handler.py`,
    `${IMAGE_SOURCE_PATH}/handler_v2.py`,
    `${IMAGE_SOURCE_PATH}/handler_v3.py`,
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
if (syntax.status !== 0) {
  throw new Error(
    `AVANTIQO_IMAGE_REFRESH_PYTHON_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout)}`,
  );
}
console.log("AVANTIQO_IMAGE_REFRESH_V3_SYNTAX=PASS");

const child = spawnSync(
  process.execPath,
  ["--env-file=.env.local", "scripts/refresh-avantiqo-image-runpod-worker-local.mjs", ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID: endpointId,
    },
  },
);

if (child.error) throw child.error;
if (child.signal) throw new Error(`AVANTIQO_IMAGE_REFRESH_CHILD_SIGNAL:${child.signal}`);
process.exit(child.status ?? 1);
