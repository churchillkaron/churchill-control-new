import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertAvantiqoRunPodCertifiedImageBinding,
  AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGES,
  AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_SOURCE_SHA,
} from "../lib/intelligence/runtime/AvantiqoRunPodCertifiedImageBinding.js";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_PROVISION_RECOVERY_V1";
const TRAINER_NAME = "avantiqo-intelligence-trainer-v1";
const CODE_NAME = "avantiqo-code-v1";
const SHARED_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const REQUIRED_VOLUME_SIZE_GB = 160;
const EXPECTED_IMAGE = AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGES.trainer;
const ENV_FILE_VARIABLES = [
  "AVANTIQO_INTELLIGENCE_RUNPOD_ENV_FILE",
  "AVANTIQO_INTELLIGENCE_READINESS_ENV_FILE",
];

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 5) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

function decodeAssignmentValue(rawValue) {
  let value = String(rawValue ?? "").trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    const quote = value[0];
    value = value.slice(1, -1);
    if (quote === '"') {
      value = value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }
  return value;
}

function explicitEnvPath() {
  for (const name of ENV_FILE_VARIABLES) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  const fallback = path.resolve(process.cwd(), ".env.local");
  return fs.existsSync(fallback) ? fallback : "";
}

function relevantEnvName(name) {
  return (
    /^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name) ||
    name === "RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID" ||
    name === "AVANTIQO_INTELLIGENCE_TRAINER_LOCAL_BINDING_ADOPT_APPROVED"
  );
}

function loadRelevantLocalEnv() {
  const envPath = explicitEnvPath();
  if (!envPath) {
    return {
      path_available: false,
      parsed_without_execution: false,
      relevant_assignment_count: 0,
      secret_values_printed: false,
    };
  }
  const source = fs.readFileSync(envPath, "utf8");
  let relevantAssignmentCount = 0;
  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = rawLine.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
    );
    if (!match) continue;
    const [, name, rawValue] = match;
    if (!relevantEnvName(name)) continue;
    relevantAssignmentCount += 1;
    const value = decodeAssignmentValue(rawValue);
    if (!text(process.env[name]) && value) process.env[name] = value;
  }
  return {
    path_available: true,
    parsed_without_execution: true,
    malformed_non_assignment_lines_ignored: true,
    relevant_assignment_count: relevantAssignmentCount,
    secret_values_printed: false,
  };
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw, 1000);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(pathname, credential) {
  return readJson(
    await fetch(`${REST_BASE}${pathname}`, {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "AVANTIQO_INTELLIGENCE_TRAINER_RECOVERY_REST",
  );
}

function managementCredentialCandidates() {
  const preferred = ["RUNPOD_MANAGEMENT_API_KEY", "RUNPOD_API_KEY"];
  const discovered = Object.keys(process.env)
    .filter((name) => /^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name))
    .sort();
  const seenNames = new Set();
  const seenValues = new Set();
  const candidates = [];
  for (const name of [...preferred, ...discovered]) {
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const value = text(process.env[name]);
    if (!value || seenValues.has(value)) continue;
    seenValues.add(value);
    candidates.push({ name, value });
  }
  return candidates;
}

async function resolveManagementCredential() {
  const candidates = managementCredentialCandidates();
  if (!candidates.length) {
    throw new Error("RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED_FOR_INTELLIGENCE_TRAINER_RECOVERY");
  }
  const rejectedStatuses = [];
  for (const candidate of candidates) {
    const response = await fetch(
      `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
      {
        headers: {
          Authorization: `Bearer ${candidate.value}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (response.ok) {
      const body = await readJson(response, "AVANTIQO_INTELLIGENCE_TRAINER_RECOVERY_MANAGEMENT_PROBE");
      const endpoints = normalizeListResponse(body, ["endpoints", "serverlessEndpoints"]);
      if (!endpoints) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
      return {
        credential: candidate.value,
        source: candidate.name,
        candidate_count: candidates.length,
        endpoints,
      };
    }
    if ([401, 403].includes(response.status)) {
      rejectedStatuses.push(response.status);
      await response.text().catch(() => "");
      continue;
    }
    const detail = text(await response.text(), 500);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_RECOVERY_MANAGEMENT_PROBE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  throw new Error(
    `RUNPOD_MANAGEMENT_SCOPE_CREDENTIAL_NOT_FOUND:candidates=${candidates.length}:rejected_statuses=${rejectedStatuses.join(",") || "NONE"}`,
  );
}

function resolveTemplate(endpoint, templates) {
  const embedded = object(endpoint?.template);
  if (text(embedded?.imageName || embedded?.image)) {
    return { template: embedded, source: "ENDPOINT_INCLUDE_TEMPLATE" };
  }
  const templateId = text(endpoint?.templateId || embedded?.id, 200);
  if (!templateId) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_RECOVERY_TEMPLATE_ID_REQUIRED");
  }
  const matches = templates.filter((template) => text(template?.id, 200) === templateId);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_RECOVERY_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`,
    );
  }
  return { template: matches[0], source: "ENDPOINT_BOUND_TEMPLATE_LIST" };
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint?.networkVolumeId),
    ...list(endpoint?.networkVolumeIds).map((value) => text(value)),
  ].filter(Boolean))];
}

function safeEndpoint(endpoint, resolvedTemplate) {
  const template = object(resolvedTemplate?.template);
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId || template?.id) || null,
    template_resolution_source: resolvedTemplate?.source || null,
    template_image: text(template?.imageName || template?.image) || null,
    exact_certified_image_binding:
      text(template?.imageName || template?.image) === EXPECTED_IMAGE,
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value)).filter(Boolean),
    data_center_ids: list(endpoint?.dataCenterIds).map((value) => text(value)).filter(Boolean),
    network_volume_ids: endpointVolumeIds(endpoint),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout),
  };
}

function safeTemplate(template = {}) {
  const env = object(template?.env);
  return {
    id: text(template?.id) || null,
    name: text(template?.name) || null,
    image_name: text(template?.imageName || template?.image) || null,
    registry_auth_configured: Boolean(text(template?.containerRegistryAuthId)),
    container_disk_gb: finite(template?.containerDiskInGb),
    environment_contract: {
      trainer_enabled: text(env.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED) === "true",
      output_root: text(env.AVANTIQO_INTELLIGENCE_TRAINER_OUTPUT_ROOT) || null,
      hf_home: text(env.HF_HOME) || null,
      transformers_cache: text(env.TRANSFORMERS_CACHE) || null,
      tokenizers_parallelism: text(env.TOKENIZERS_PARALLELISM) || null,
    },
  };
}

function writeEndpointBinding(endpointId) {
  const envPath = explicitEnvPath();
  if (!envPath) return { updated: false, reason: "NO_LOCAL_ENV_PATH" };
  const source = fs.readFileSync(envPath, "utf8");
  const name = "RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID";
  const nextLine = `${name}=${endpointId}`;
  const pattern = new RegExp(`^(?:export\\s+)?${name}=.*$`, "m");
  const next = pattern.test(source)
    ? source.replace(pattern, nextLine)
    : `${source}${source.length && !source.endsWith("\n") ? "\n" : ""}${nextLine}\n`;
  if (next === source) return { updated: false, reason: "ALREADY_CURRENT" };
  const tempPath = path.join(
    os.tmpdir(),
    `avantiqo-intelligence-trainer-recovery-env-${process.pid}-${Date.now()}.tmp`,
  );
  fs.writeFileSync(tempPath, next, { mode: 0o600 });
  fs.renameSync(tempPath, envPath);
  return { updated: true, reason: "CERTIFIED_TRAINER_ENDPOINT_ID_ADOPTED" };
}

const localEnv = loadRelevantLocalEnv();
const adopt = process.argv.includes("--adopt");
if (
  adopt &&
  !yes(process.env.AVANTIQO_INTELLIGENCE_TRAINER_LOCAL_BINDING_ADOPT_APPROVED)
) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_LOCAL_BINDING_ADOPT_APPROVED=YES_REQUIRED");
}

const management = await resolveManagementCredential();
const managementKey = management.credential;
const [templatesRaw, volumesRaw] = await Promise.all([
  rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  ),
  rest("/networkvolumes", managementKey),
]);
const templates = normalizeListResponse(templatesRaw, ["templates"]);
const volumes = normalizeListResponse(volumesRaw, ["networkVolumes", "volumes"]);
if (!templates) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
if (!volumes) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const trainerMatches = management.endpoints.filter(
  (endpoint) => text(endpoint?.name) === TRAINER_NAME,
);
if (trainerMatches.length !== 1) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_TRAINER_RECOVERY_ENDPOINT_RESOLUTION_FAILED:matches=${trainerMatches.length}`,
  );
}
const trainerEndpoint = trainerMatches[0];
const resolvedTemplate = resolveTemplate(trainerEndpoint, templates);
const trainer = safeEndpoint(trainerEndpoint, resolvedTemplate);
const template = safeTemplate(resolvedTemplate.template);

const volumeMatches = volumes.filter((volume) => text(volume?.name) === SHARED_VOLUME_NAME);
if (volumeMatches.length !== 1) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_TRAINER_RECOVERY_VOLUME_RESOLUTION_FAILED:matches=${volumeMatches.length}`,
  );
}
const volume = volumeMatches[0];
const volumeId = text(volume?.id);
const volumeSizeGb = finite(volume?.size ?? volume?.sizeGb, 0);
const volumeDataCenterId = text(volume?.dataCenterId);

const codeMatches = management.endpoints.filter((endpoint) => text(endpoint?.name) === CODE_NAME);
if (codeMatches.length !== 1) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_TRAINER_RECOVERY_CODE_ENDPOINT_RESOLUTION_FAILED:matches=${codeMatches.length}`,
  );
}
const code = {
  id: text(codeMatches[0]?.id) || null,
  name: text(codeMatches[0]?.name) || null,
  workers_min: finite(codeMatches[0]?.workersMin),
  workers_max: finite(codeMatches[0]?.workersMax),
};

const dataCenterConstraintSatisfied =
  trainer.data_center_ids.length === 0 ||
  trainer.data_center_ids.includes(volumeDataCenterId);
const templateEnv = template.environment_contract;
const templateEnvReady =
  templateEnv.trainer_enabled === true &&
  templateEnv.output_root === "/runpod-volume/avantiqo-intelligence-training" &&
  templateEnv.hf_home === "/runpod-volume/huggingface-cache" &&
  templateEnv.transformers_cache === "/runpod-volume/huggingface-cache" &&
  templateEnv.tokenizers_parallelism === "false";

const checks = {
  exact_endpoint_name: trainer.name === TRAINER_NAME,
  exact_certified_image: trainer.exact_certified_image_binding === true,
  template_registry_auth_present: template.registry_auth_configured === true,
  template_container_disk_at_least_30_gb: Number(template.container_disk_gb || 0) >= 30,
  template_environment_contract: templateEnvReady,
  shared_volume_at_least_160_gb: volumeSizeGb >= REQUIRED_VOLUME_SIZE_GB,
  shared_volume_attached: trainer.network_volume_ids.includes(volumeId),
  data_center_constraint_satisfied: dataCenterConstraintSatisfied,
  gpu_count_at_least_one: Number(trainer.gpu_count || 0) >= 1,
  trainer_zero_min_workers: Number(trainer.workers_min || 0) === 0,
  trainer_max_one_worker: Number(trainer.workers_max || 0) === 1,
  code_restored_zero_min: Number(code.workers_min || 0) === 0,
  code_restored_max_one: Number(code.workers_max || 0) === 1,
};
const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
if (failedChecks.length) {
  console.log(JSON.stringify({
    success: false,
    contract: CONTRACT,
    mode: adopt ? "ADOPT" : "READ_ONLY",
    certified_source_sha: AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_SOURCE_SHA,
    local_env: localEnv,
    trainer,
    template,
    volume: {
      id: volumeId || null,
      name: text(volume?.name) || null,
      size_gb: volumeSizeGb,
      data_center_id: volumeDataCenterId || null,
    },
    code_endpoint: code,
    checks,
    failed_checks: failedChecks,
    next_action: "REPAIR_EXISTING_TRAINER_ENDPOINT_DO_NOT_CREATE_DUPLICATE",
    governance: {
      runpod_mutation_performed: false,
      local_env_mutation_performed: false,
      provider_job_submitted: false,
      training_started: false,
      production_model_promoted: false,
      production_web_deploy: false,
      secret_values_printed: false,
    },
  }, null, 2));
  process.exitCode = 2;
} else {
  const certifiedBinding = await assertAvantiqoRunPodCertifiedImageBinding({
    component: "trainer",
    endpointId: trainer.id,
    managementApiKey: managementKey,
  });
  const localBinding = adopt
    ? writeEndpointBinding(trainer.id)
    : { updated: false, reason: "READ_ONLY_MODE" };
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: adopt ? "ADOPT" : "READ_ONLY",
    certified_source_sha: AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_SOURCE_SHA,
    local_env: localEnv,
    management_credential: {
      source_variable: management.source,
      candidate_count: management.candidate_count,
      scope_verified_by_read_only_endpoint_list: true,
      value_exposed: false,
    },
    trainer,
    template,
    volume: {
      id: volumeId,
      name: text(volume?.name) || null,
      size_gb: volumeSizeGb,
      data_center_id: volumeDataCenterId || null,
    },
    code_endpoint: code,
    checks,
    certified_binding: certifiedBinding,
    local_binding: localBinding,
    next_action: "RUN_MODEL_IMPROVEMENT_READINESS_NO_TRAINING_YET",
    governance: {
      runpod_mutation_performed: false,
      local_env_mutation_performed: localBinding.updated === true,
      provider_job_submitted: false,
      training_started: false,
      production_model_promoted: false,
      production_web_deploy: false,
      secret_values_printed: false,
    },
  }, null, 2));
}
