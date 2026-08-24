import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const AUDIO_TEMPLATE_NAME = "avantiqo-audio-v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-audio-worker-image.json";
const CONTRACT = "AVANTIQO_AUDIO_RUNPOD_ENDPOINT_PROVISION_V1";
const DEFAULT_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA L4",
  "NVIDIA RTX A5000",
  "NVIDIA GeForce RTX 3090",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function commaList(value) {
  return text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function imageEvidence() {
  let parsed = null;
  try {
    parsed = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_WORKER_IMAGE_EVIDENCE_REQUIRED");
  }
  if (parsed?.success !== true || parsed?.contract !== "AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V1") {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_WORKER_IMAGE_EVIDENCE_INVALID");
  }
  const image = text(parsed.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_WORKER_IMAGE_REFERENCE_INVALID");
  }
  return { image, source_sha: text(parsed.source_sha) || null };
}

function desiredTemplateEnv() {
  return {
    ACESTEP_CHECKPOINTS_DIR: "/opt/ace-step/checkpoints",
    AVANTIQO_AUDIO_DEVICE: "cuda",
    AVANTIQO_AUDIO_MODEL_FAMILY: "ACE_STEP_1_5",
    AVANTIQO_AUDIO_FOUNDATION_MODEL: "ACE-Step/Ace-Step1.5",
    AVANTIQO_AUDIO_MODEL_VARIANT: "acestep-v15-turbo",
    AVANTIQO_AUDIO_MODEL_SOURCE: "huggingface",
    AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES: "ai.music.generate",
    AVANTIQO_AUDIO_FITNESS_LOAD_MODEL: "false",
    ACESTEP_INIT_LLM: "false",
    HF_HOME: "/opt/ace-step/checkpoints/.hf-cache",
  };
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: Number.isFinite(Number(endpoint.workersMin)) ? Number(endpoint.workersMin) : null,
    workers_max: Number.isFinite(Number(endpoint.workersMax)) ? Number(endpoint.workersMax) : null,
    network_volume_id: text(endpoint.networkVolumeId) || null,
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
    volume_mount_path: text(template.volumeMountPath) || null,
  };
}

function resolveRegistryAuth(registryAuths) {
  const explicitId = text(process.env.AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_ID);
  if (explicitId) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicitId);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_ID_NOT_FOUND:matches=${matches.length}`);
    }
    return matches[0];
  }

  const candidates = registryAuths.filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(`AVANTIQO_AUDIO_RUNPOD_GHCR_AUTH_AMBIGUOUS:matches=${candidates.length}`);
  }
  return null;
}

const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_AUDIO_RUNPOD_PROVISION_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_AUDIO_RUNPOD_PROVISION_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const image = await imageEvidence();
const [endpoints, templates, registryAuths] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=false", managementKey),
  rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  ),
  rest("/containerregistryauth", managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
if (!Array.isArray(registryAuths)) throw new Error("RUNPOD_REGISTRY_AUTH_LIST_INVALID");

const endpointMatches = endpoints.filter((endpoint) => text(endpoint?.name) === AUDIO_ENDPOINT_NAME);
if (endpointMatches.length > 1) {
  throw new Error(`AVANTIQO_AUDIO_ENDPOINT_NAME_AMBIGUOUS:matches=${endpointMatches.length}`);
}
if (endpointMatches.length === 1) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_exists: true,
    endpoint: safeEndpoint(endpointMatches[0]),
    mutation_performed: false,
    next_action: "PROVISION_AUDIO_NETWORK_VOLUME_THEN_REPAIR_AND_FINGERPRINT",
    production_deploy_performed: false,
    generation_submitted: false,
  }, null, 2));
  process.exit(0);
}

const exactTemplates = templates.filter((template) => text(template?.name) === AUDIO_TEMPLATE_NAME);
if (exactTemplates.length > 1) {
  throw new Error(`AVANTIQO_AUDIO_TEMPLATE_NAME_AMBIGUOUS:matches=${exactTemplates.length}`);
}

const registryAuth = resolveRegistryAuth(registryAuths);
const configuredGpuTypeIds = commaList(process.env.AVANTIQO_AUDIO_RUNPOD_GPU_TYPE_IDS);
const gpuTypeIds = configuredGpuTypeIds.length
  ? configuredGpuTypeIds.slice(0, 3)
  : [...DEFAULT_GPU_TYPE_IDS];
const workersMax = Math.max(1, Math.min(10, Number(process.env.AVANTIQO_AUDIO_RUNPOD_WORKERS_MAX || 2)));
const idleTimeout = Math.max(1, Math.min(3600, Number(process.env.AVANTIQO_AUDIO_RUNPOD_IDLE_TIMEOUT_SECONDS || 5)));

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_exists: false,
  immutable_worker_image: image.image,
  source_sha: image.source_sha,
  existing_template: exactTemplates[0] ? safeTemplate(exactTemplates[0]) : null,
  template_creation_required: exactTemplates.length === 0,
  ghcr_registry_auth_found: Boolean(registryAuth),
  ghcr_registry_auth_id_present: Boolean(text(registryAuth?.id)),
  gpu_type_ids: gpuTypeIds,
  gpu_policy: configuredGpuTypeIds.length
    ? "EXPLICIT_OVERRIDE"
    : "ECONOMICAL_24GB_NO_LM_PRIORITY",
  workers_min: 0,
  workers_max: workersMax,
  idle_timeout_seconds: idleTimeout,
  initial_cache_persistence: "EPHEMERAL_UNTIL_NETWORK_VOLUME_ATTACHED",
  mutation_performed: false,
  production_deploy_performed: false,
  generation_submitted: false,
  next_action: !registryAuth && exactTemplates.length === 0
    ? "CONFIGURE_RUNPOD_GHCR_REGISTRY_AUTH"
    : apply
      ? "CREATE_AUDIO_TEMPLATE_AND_ENDPOINT"
      : "APPROVE_AUDIO_ENDPOINT_PROVISION",
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let template = exactTemplates[0] || null;
if (!template) {
  if (!registryAuth) {
    throw new Error("AVANTIQO_AUDIO_RUNPOD_GHCR_REGISTRY_AUTH_REQUIRED_FOR_PRIVATE_IMAGE");
  }
  template = await rest("/templates", managementKey, {
    method: "POST",
    body: {
      imageName: image.image,
      name: AUDIO_TEMPLATE_NAME,
      category: "NVIDIA",
      containerDiskInGb: 30,
      containerRegistryAuthId: text(registryAuth.id),
      dockerEntrypoint: [],
      dockerStartCmd: [],
      env: desiredTemplateEnv(),
      isPublic: false,
      isServerless: true,
      ports: [],
      readme: "Avantiqo-owned Music worker. ACE-Step 1.5 turbo, LM disabled, generation-only certification lane.",
      volumeInGb: 0,
      volumeMountPath: "/workspace",
    },
  });
}

const templateId = text(template?.id);
if (!templateId) throw new Error("AVANTIQO_AUDIO_CREATED_TEMPLATE_ID_REQUIRED");
if (text(template?.imageName) && text(template.imageName) !== image.image) {
  throw new Error("AVANTIQO_AUDIO_EXISTING_TEMPLATE_IMAGE_MISMATCH_REPAIR_REQUIRED");
}

// Re-list endpoints immediately before the endpoint mutation to prevent duplicate creation.
const freshEndpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
const freshMatches = Array.isArray(freshEndpoints)
  ? freshEndpoints.filter((endpoint) => text(endpoint?.name) === AUDIO_ENDPOINT_NAME)
  : [];
if (freshMatches.length) {
  throw new Error(`AVANTIQO_AUDIO_ENDPOINT_APPEARED_REPLAN_REQUIRED:matches=${freshMatches.length}`);
}

const endpoint = await rest("/endpoints", managementKey, {
  method: "POST",
  body: {
    templateId,
    computeType: "GPU",
    executionTimeoutMs: 30 * 60 * 1000,
    flashboot: true,
    gpuCount: 1,
    gpuTypeIds,
    idleTimeout,
    name: AUDIO_ENDPOINT_NAME,
    scalerType: "QUEUE_DELAY",
    scalerValue: 4,
    workersMax,
    workersMin: 0,
  },
});

const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_AUDIO_CREATED_ENDPOINT_ID_REQUIRED");
const verified = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=false`,
  managementKey,
);
if (text(verified?.name) !== AUDIO_ENDPOINT_NAME || text(verified?.templateId) !== templateId) {
  throw new Error("AVANTIQO_AUDIO_ENDPOINT_PROVISION_VERIFY_FAILED");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint_exists: true,
  endpoint: safeEndpoint(verified),
  template: safeTemplate(verified.template || template),
  template_created: exactTemplates.length === 0,
  endpoint_created: true,
  mutation_performed: true,
  next_action: "PROVISION_AUDIO_NETWORK_VOLUME_THEN_REPAIR_BIND_FINGERPRINT_PREFLIGHT",
}, null, 2));
