import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const ENV_LOCAL = path.resolve(process.cwd(), ".env.local");
const CONTRACT = "AVANTIQO_VOICE_RUNPOD_ENDPOINT_PROVISION_V1";
const DEFAULT_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA L4",
  "NVIDIA RTX A5000",
  "NVIDIA GeForce RTX 3090",
]);

const LANES = Object.freeze({
  stt: Object.freeze({
    endpointName: "avantiqo-voice-stt-v1",
    templateName: "avantiqo-voice-stt-v1",
    endpointEnv: "RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID",
    foundationModel: "openai/whisper-large-v3-turbo",
    cudaRuntime: "12.8",
    templateEnv: Object.freeze({
      AVANTIQO_VOICE_STT_FOUNDATION_MODEL: "openai/whisper-large-v3-turbo",
    }),
    readme: "Avantiqo-owned speech-to-text worker. Whisper large-v3-turbo certification lane.",
  }),
  tts: Object.freeze({
    endpointName: "avantiqo-voice-tts-v1",
    templateName: "avantiqo-voice-tts-v1",
    endpointEnv: "RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID",
    foundationModel: "resemble-ai/chatterbox:multilingual-v3",
    cudaRuntime: "12.4",
    templateEnv: Object.freeze({
      AVANTIQO_VOICE_TTS_FOUNDATION_MODEL: "resemble-ai/chatterbox:multilingual-v3",
      AVANTIQO_VOICE_TTS_DEVICE: "cuda",
    }),
    readme: "Avantiqo-owned multilingual text-to-speech worker. Chatterbox multilingual v3 certification lane.",
  }),
});

function text(value) {
  return String(value ?? "").trim();
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function imageEvidence() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch {
    throw new Error("AVANTIQO_VOICE_IMMUTABLE_WORKER_IMAGE_EVIDENCE_REQUIRED");
  }
  if (parsed?.success !== true || parsed?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1") {
    throw new Error("AVANTIQO_VOICE_WORKER_IMAGES_NOT_PASSED");
  }

  const evidence = {};
  for (const [laneName, lane] of Object.entries(LANES)) {
    const item = parsed?.[laneName] || {};
    const sourceSha = text(item.source_sha);
    const image = text(item.immutable_image_reference);
    if (
      item.success !== true ||
      item.source_sha_matches_trigger !== true ||
      item.import_smoke_passed_by_docker_build !== true ||
      text(item.foundation_model) !== lane.foundationModel ||
      text(item.cuda_runtime_expected) !== lane.cudaRuntime ||
      !/^[a-f0-9]{40}$/i.test(sourceSha) ||
      !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)
    ) {
      throw new Error(`AVANTIQO_VOICE_${laneName.toUpperCase()}_IMAGE_EVIDENCE_INVALID`);
    }
    evidence[laneName] = { image, sourceSha };
  }
  return evidence;
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    template_image: text(endpoint.template?.imageName) || null,
    workers_min: Number.isFinite(Number(endpoint.workersMin)) ? Number(endpoint.workersMin) : null,
    workers_max: Number.isFinite(Number(endpoint.workersMax)) ? Number(endpoint.workersMax) : null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
  };
}

function resolveRegistryAuth(registryAuths) {
  const explicitId = text(process.env.AVANTIQO_VOICE_RUNPOD_REGISTRY_AUTH_ID);
  if (explicitId) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicitId);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_VOICE_RUNPOD_REGISTRY_AUTH_ID_NOT_FOUND:matches=${matches.length}`);
    }
    return matches[0];
  }
  const candidates = registryAuths.filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(`AVANTIQO_VOICE_RUNPOD_GHCR_AUTH_AMBIGUOUS:matches=${candidates.length}`);
  }
  return null;
}

function exactByName(items, name, errorPrefix) {
  const matches = items.filter((item) => text(item?.name) === name);
  if (matches.length > 1) throw new Error(`${errorPrefix}_AMBIGUOUS:matches=${matches.length}`);
  return matches[0] || null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateLocalEnv(bindings) {
  if (!fs.existsSync(ENV_LOCAL)) throw new Error("ENV_LOCAL_REQUIRED");
  let source = fs.readFileSync(ENV_LOCAL, "utf8");
  let changed = 0;
  for (const [name, value] of Object.entries(bindings)) {
    const nextLine = `${name}=${value}`;
    const pattern = new RegExp(`^(?:export\\s+)?${escapeRegex(name)}=.*$`, "m");
    if (pattern.test(source)) {
      if ((source.match(pattern)?.[0] || "") !== nextLine) {
        source = source.replace(pattern, nextLine);
        changed += 1;
      }
    } else {
      if (source.length && !source.endsWith("\n")) source += "\n";
      source += `${nextLine}\n`;
      changed += 1;
    }
  }
  if (changed) {
    const temp = path.join(os.tmpdir(), `avantiqo-voice-env-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(temp, source, { mode: 0o600 });
    fs.renameSync(temp, ENV_LOCAL);
  }
  return changed;
}

const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_RUNPOD_PROVISION_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_RUNPOD_PROVISION_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const evidence = await imageEvidence();
const configuredGpuTypeIds = commaList(process.env.AVANTIQO_VOICE_RUNPOD_GPU_TYPE_IDS);
const gpuTypeIds = configuredGpuTypeIds.length ? configuredGpuTypeIds.slice(0, 3) : [...DEFAULT_GPU_TYPE_IDS];
const workersMax = Math.max(1, Math.min(2, Number(process.env.AVANTIQO_VOICE_RUNPOD_WORKERS_MAX || 1)));
const idleTimeout = Math.max(1, Math.min(3600, Number(process.env.AVANTIQO_VOICE_RUNPOD_IDLE_TIMEOUT_SECONDS || 10)));

let [endpoints, templates, registryAuths] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=false", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/containerregistryauth", managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
if (!Array.isArray(registryAuths)) throw new Error("RUNPOD_REGISTRY_AUTH_LIST_INVALID");

const registryAuth = resolveRegistryAuth(registryAuths);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  gpu_type_ids: gpuTypeIds,
  workers_min: 0,
  workers_max: workersMax,
  idle_timeout_seconds: idleTimeout,
  mutation_performed: false,
  local_env_updated: false,
  vercel_environment_updated: false,
  production_deploy_performed: false,
  generation_submitted: false,
  lanes: {},
};

for (const [laneName, lane] of Object.entries(LANES)) {
  const endpoint = exactByName(endpoints, lane.endpointName, `AVANTIQO_VOICE_${laneName.toUpperCase()}_ENDPOINT_NAME`);
  const template = exactByName(templates, lane.templateName, `AVANTIQO_VOICE_${laneName.toUpperCase()}_TEMPLATE_NAME`);
  const endpointImage = text(endpoint?.template?.imageName);
  if (endpoint && endpointImage && endpointImage !== evidence[laneName].image) {
    throw new Error(`AVANTIQO_VOICE_${laneName.toUpperCase()}_ENDPOINT_IMAGE_MISMATCH_REPAIR_REQUIRED`);
  }
  if (template && text(template.imageName) && text(template.imageName) !== evidence[laneName].image) {
    throw new Error(`AVANTIQO_VOICE_${laneName.toUpperCase()}_TEMPLATE_IMAGE_MISMATCH_REPAIR_REQUIRED`);
  }
  plan.lanes[laneName] = {
    endpoint_exists: Boolean(endpoint),
    endpoint: endpoint ? safeEndpoint(endpoint) : null,
    template_exists: Boolean(template),
    template: template ? safeTemplate(template) : null,
    immutable_worker_image: evidence[laneName].image,
    source_sha: evidence[laneName].sourceSha,
    foundation_model: lane.foundationModel,
    cuda_runtime: lane.cudaRuntime,
  };
}

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (!registryAuth && Object.values(plan.lanes).some((item) => !item.template_exists)) {
  throw new Error("AVANTIQO_VOICE_RUNPOD_GHCR_REGISTRY_AUTH_REQUIRED_FOR_PRIVATE_IMAGES");
}

for (const [laneName, lane] of Object.entries(LANES)) {
  let endpoint = exactByName(endpoints, lane.endpointName, `AVANTIQO_VOICE_${laneName.toUpperCase()}_ENDPOINT_NAME`);
  if (endpoint) continue;

  let template = exactByName(templates, lane.templateName, `AVANTIQO_VOICE_${laneName.toUpperCase()}_TEMPLATE_NAME`);
  if (!template) {
    template = await rest("/templates", managementKey, {
      method: "POST",
      body: {
        imageName: evidence[laneName].image,
        name: lane.templateName,
        category: "NVIDIA",
        containerDiskInGb: 30,
        containerRegistryAuthId: text(registryAuth.id),
        dockerEntrypoint: [],
        dockerStartCmd: [],
        env: lane.templateEnv,
        isPublic: false,
        isServerless: true,
        ports: [],
        readme: lane.readme,
        volumeInGb: 0,
        volumeMountPath: "/workspace",
      },
    });
    templates = [...templates, template];
    plan.mutation_performed = true;
  }

  const templateId = text(template?.id);
  if (!templateId) throw new Error(`AVANTIQO_VOICE_${laneName.toUpperCase()}_TEMPLATE_ID_REQUIRED`);
  if (text(template?.imageName) && text(template.imageName) !== evidence[laneName].image) {
    throw new Error(`AVANTIQO_VOICE_${laneName.toUpperCase()}_TEMPLATE_IMAGE_MISMATCH_REPAIR_REQUIRED`);
  }

  const freshEndpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
  const appeared = Array.isArray(freshEndpoints)
    ? freshEndpoints.filter((item) => text(item?.name) === lane.endpointName)
    : [];
  if (appeared.length > 1) {
    throw new Error(`AVANTIQO_VOICE_${laneName.toUpperCase()}_ENDPOINT_NAME_AMBIGUOUS:matches=${appeared.length}`);
  }
  if (appeared.length === 1) {
    endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=false", managementKey);
    continue;
  }

  endpoint = await rest("/endpoints", managementKey, {
    method: "POST",
    body: {
      templateId,
      computeType: "GPU",
      executionTimeoutMs: 15 * 60 * 1000,
      flashboot: true,
      gpuCount: 1,
      gpuTypeIds,
      idleTimeout,
      name: lane.endpointName,
      scalerType: "QUEUE_DELAY",
      scalerValue: 4,
      workersMax,
      workersMin: 0,
    },
  });
  if (!text(endpoint?.id)) throw new Error(`AVANTIQO_VOICE_${laneName.toUpperCase()}_CREATED_ENDPOINT_ID_REQUIRED`);
  plan.mutation_performed = true;
  endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=false", managementKey);
}

const bindings = {};
for (const [laneName, lane] of Object.entries(LANES)) {
  const endpoint = exactByName(endpoints, lane.endpointName, `AVANTIQO_VOICE_${laneName.toUpperCase()}_ENDPOINT_NAME`);
  if (!endpoint) throw new Error(`AVANTIQO_VOICE_${laneName.toUpperCase()}_ENDPOINT_REQUIRED_AFTER_PROVISION`);
  const endpointId = text(endpoint.id);
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  const endpointImage = text(endpoint.template?.imageName);
  if (!endpointId || !templateId) throw new Error(`AVANTIQO_VOICE_${laneName.toUpperCase()}_ENDPOINT_VERIFY_FAILED`);
  if (endpointImage && endpointImage !== evidence[laneName].image) {
    throw new Error(`AVANTIQO_VOICE_${laneName.toUpperCase()}_ENDPOINT_IMAGE_VERIFY_FAILED`);
  }
  bindings[lane.endpointEnv] = endpointId;
  plan.lanes[laneName].endpoint_exists = true;
  plan.lanes[laneName].endpoint = safeEndpoint(endpoint);
}

const localChanged = updateLocalEnv(bindings);
plan.local_env_updated = localChanged > 0;
plan.local_env_changed_count = localChanged;
plan.next_action = "RUN_ONE_SHOT_VOICE_GENERATOR_SMOKE";
console.log(JSON.stringify(plan, null, 2));
