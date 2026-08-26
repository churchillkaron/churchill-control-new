import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_VOICE_TTS_BOUND_TEMPLATE_INSPECTION_V1";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function commandList(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const scalar = text(value);
  return scalar ? [scalar] : [];
}

async function request(pathname, key) {
  const response = await fetch(`${REST}${pathname}`, {
    headers: {
      Authorization: `Bearer ${key}`,
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
    throw new Error(`RUNPOD_VOICE_TTS_TEMPLATE_INSPECTION_HTTP_${response.status}`);
  }
  return body || {};
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");

const endpoint = await request(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(endpoint?.id) !== endpointId) {
  throw new Error("AVANTIQO_VOICE_TTS_TEMPLATE_INSPECTION_ENDPOINT_MISMATCH");
}

const templateId = text(endpoint?.templateId || endpoint?.template?.id);
if (!templateId) {
  throw new Error("AVANTIQO_VOICE_TTS_TEMPLATE_INSPECTION_TEMPLATE_ID_REQUIRED");
}

const templatesRaw = await request(
  "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
  managementKey,
);
const templates = normalizeList(templatesRaw, ["templates"]);
if (!templates) {
  throw new Error("AVANTIQO_VOICE_TTS_TEMPLATE_INSPECTION_TEMPLATE_LIST_INVALID");
}
const template = templates.find((item) => text(item?.id) === templateId);
if (!template) {
  throw new Error("AVANTIQO_VOICE_TTS_TEMPLATE_INSPECTION_BOUND_TEMPLATE_NOT_FOUND");
}

const dockerEntrypoint = commandList(template?.dockerEntrypoint);
const dockerStartCmd = commandList(template?.dockerStartCmd);
const envKeys = Object.keys(object(template?.env)).sort();
const launchOverridePresent = dockerEntrypoint.length > 0 || dockerStartCmd.length > 0;

const result = {
  success: true,
  contract: CONTRACT,
  read_only: true,
  mutation_performed: false,
  generation_submitted: false,
  endpoint: {
    id: endpointId,
    name: text(endpoint?.name) || null,
    template_id: templateId,
    workers_min: Number.isFinite(Number(endpoint?.workersMin)) ? Number(endpoint.workersMin) : null,
    workers_max: Number.isFinite(Number(endpoint?.workersMax)) ? Number(endpoint.workersMax) : null,
  },
  template: {
    id: templateId,
    name: text(template?.name) || null,
    image: text(template?.imageName) || null,
    docker_entrypoint: dockerEntrypoint,
    docker_start_cmd: dockerStartCmd,
    launch_override_present: launchOverridePresent,
    image_default_cmd_expected: ["/bin/sh", "/app/bootstrap.sh"],
    container_registry_auth_configured: Boolean(text(template?.containerRegistryAuthId)),
    env_keys: envKeys,
    env_values_printed: false,
    volume_in_gb: Number.isFinite(Number(template?.volumeInGb)) ? Number(template.volumeInGb) : null,
    volume_mount_path: text(template?.volumeMountPath) || null,
  },
  diagnosis: launchOverridePresent
    ? "BOUND_TEMPLATE_OVERRIDES_IMAGE_LAUNCH_COMMAND"
    : "BOUND_TEMPLATE_USES_IMAGE_DEFAULT_LAUNCH_COMMAND",
  production_deploy_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(result, null, 2));
