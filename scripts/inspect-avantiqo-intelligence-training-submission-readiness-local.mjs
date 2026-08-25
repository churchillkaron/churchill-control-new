import { readFileSync } from "node:fs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINING_SUBMISSION_READINESS_V1";
const TRAINER_NAME = "avantiqo-intelligence-trainer-v1";
const SHARED_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const REQUIRED_VOLUME_SIZE_GB = 160;
const CERTIFIED_SOURCE_SHA = "bef2ff27b4774e66960a08322ebe8e5ee9f19dfb";
const CERTIFIED_TRAINER_IMAGE =
  "ghcr.io/churchillkaron/avantiqo-intelligence-trainer@sha256:eb24423075767c15d476c2ad0c9695482addf68e28b2b85af4768dc6a606bb4f";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const LOCAL_ENV_PATH_VARIABLES = [
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

function normalizeList(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 5) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeList(value[key], candidateKeys, depth + 1);
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
  for (const name of LOCAL_ENV_PATH_VARIABLES) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  return "";
}

function relevantEnvName(name) {
  return (
    /^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name) ||
    name === "RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID" ||
    name === "AVANTIQO_INTELLIGENCE_TRAINER_ENABLED"
  );
}

function hydrateLocalEnv() {
  const envPath = explicitEnvPath();
  if (!envPath) {
    return {
      explicit_env_file_requested: false,
      parsed_without_execution: false,
      relevant_assignment_count: 0,
      nonempty_runpod_api_key_count: 0,
      secret_values_printed: false,
    };
  }
  const source = readFileSync(envPath, "utf8");
  let relevantAssignmentCount = 0;
  let nonemptyRunpodApiKeyCount = 0;
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
    if (/^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name) && text(value)) {
      nonemptyRunpodApiKeyCount += 1;
    }
  }
  return {
    explicit_env_file_requested: true,
    parsed_without_execution: true,
    malformed_non_assignment_lines_ignored: true,
    relevant_assignment_count: relevantAssignmentCount,
    nonempty_runpod_api_key_count: nonemptyRunpodApiKeyCount,
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
    const detail = text(body?.message || body?.error || body?.detail || raw, 800);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
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
    "AVANTIQO_INTELLIGENCE_TRAINING_SUBMISSION_READINESS_REST",
  );
}

async function queueHealthRaw(endpointId, credential) {
  const response = await fetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
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
  return {
    ok: response.ok,
    status: response.status,
    body: body ?? {},
  };
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
    throw new Error(
      "RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED_FOR_INTELLIGENCE_TRAINING_SUBMISSION_READINESS",
    );
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
      const body = await readJson(
        response,
        "AVANTIQO_INTELLIGENCE_TRAINING_SUBMISSION_READINESS_MANAGEMENT_PROBE",
      );
      const endpoints = normalizeList(body, ["endpoints", "serverlessEndpoints"]);
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
      `AVANTIQO_INTELLIGENCE_TRAINING_SUBMISSION_READINESS_MANAGEMENT_PROBE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  throw new Error(
    `RUNPOD_MANAGEMENT_SCOPE_CREDENTIAL_NOT_FOUND:candidates=${candidates.length}:rejected_statuses=${rejectedStatuses.join(",") || "NONE"}`,
  );
}

function resolveEndpoint(endpoints) {
  const configuredId = text(
    process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID,
    200,
  );
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id, 200) === configuredId);
    if (matches.length !== 1) {
      return {
        endpoint: null,
        resolution: "CONFIGURED_ID_NOT_UNIQUE",
        match_count: matches.length,
      };
    }
    return {
      endpoint: matches[0],
      resolution:
        text(matches[0]?.name) === TRAINER_NAME
          ? "CONFIGURED_ID"
          : "CONFIGURED_ID_NAME_MISMATCH",
      match_count: 1,
    };
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === TRAINER_NAME);
  return {
    endpoint: matches.length === 1 ? matches[0] : null,
    resolution: matches.length === 1 ? "EXACT_NAME" : "EXACT_NAME_NOT_UNIQUE",
    match_count: matches.length,
  };
}

function resolveTemplate(endpoint, templates) {
  if (!endpoint) return { template: null, source: "ENDPOINT_NOT_RESOLVED" };
  const embedded = object(endpoint?.template);
  if (text(embedded?.imageName || embedded?.image, 1200)) {
    return { template: embedded, source: "ENDPOINT_INCLUDE_TEMPLATE" };
  }
  const templateId = text(endpoint?.templateId || embedded?.id, 200);
  if (!templateId) return { template: null, source: "NO_TEMPLATE_ID" };
  const matches = templates.filter((template) => text(template?.id, 200) === templateId);
  return {
    template: matches.length === 1 ? matches[0] : null,
    source: matches.length === 1 ? "ENDPOINT_BOUND_TEMPLATE_LIST" : "TEMPLATE_NOT_UNIQUE",
  };
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint?.networkVolumeId, 200),
    ...list(endpoint?.networkVolumeIds).map((value) => text(value, 200)),
  ].filter(Boolean))];
}

function healthCounters(body = {}) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      retried: finite(jobs.retried, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

const localEnv = hydrateLocalEnv();
const management = await resolveManagementCredential();
const managementKey = management.credential;
const [templatesBody, volumesBody] = await Promise.all([
  rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  ),
  rest("/networkvolumes", managementKey),
]);
const templates = normalizeList(templatesBody, ["templates"]) || [];
const volumes = normalizeList(volumesBody, ["networkVolumes", "volumes"]) || [];
const trainerResolution = resolveEndpoint(management.endpoints);
const endpoint = trainerResolution.endpoint;
const resolvedTemplate = resolveTemplate(endpoint, templates);
const template = object(resolvedTemplate.template);
const endpointId = text(endpoint?.id, 200);
const volumeIds = endpointVolumeIds(endpoint);
const attachedVolumes = volumes.filter((volume) => volumeIds.includes(text(volume?.id, 200)));
const canonicalAttachedVolumes = attachedVolumes.filter(
  (volume) => text(volume?.name) === SHARED_VOLUME_NAME,
);
const canonicalVolume = canonicalAttachedVolumes.length === 1 ? canonicalAttachedVolumes[0] : null;
const templateEnv = object(template?.env);
const trainerImage = text(template?.imageName || template?.image, 1200);

const runtimeQueueKey = text(process.env.RUNPOD_API_KEY, 4000);
const managementQueueProbe = endpointId
  ? await queueHealthRaw(endpointId, managementKey)
  : { ok: false, status: null, body: {} };
const runtimeQueueProbe = endpointId && runtimeQueueKey
  ? await queueHealthRaw(endpointId, runtimeQueueKey)
  : { ok: false, status: null, body: {} };
const runtimeQueueHealth = runtimeQueueProbe.ok
  ? healthCounters(runtimeQueueProbe.body)
  : null;

const dataCenterIds = list(endpoint?.dataCenterIds)
  .map((value) => text(value, 120))
  .filter(Boolean);
const canonicalVolumeDataCenter = text(canonicalVolume?.dataCenterId, 120);
const dataCenterConstraintSatisfied = Boolean(
  canonicalVolume &&
    canonicalVolumeDataCenter &&
    (dataCenterIds.length === 0 || dataCenterIds.includes(canonicalVolumeDataCenter)),
);

const checks = {
  endpoint_resolved_exactly_once:
    Boolean(endpoint) && trainerResolution.match_count === 1,
  endpoint_name_exact: text(endpoint?.name) === TRAINER_NAME,
  endpoint_local_binding_present: Boolean(
    text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID),
  ),
  exact_certified_image_binding: trainerImage === CERTIFIED_TRAINER_IMAGE,
  template_registry_auth_present: Boolean(text(template?.containerRegistryAuthId)),
  template_container_disk_at_least_30_gb:
    Number(template?.containerDiskInGb || 0) >= 30,
  template_trainer_enabled:
    text(templateEnv.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED).toLowerCase() === "true",
  template_output_root:
    text(templateEnv.AVANTIQO_INTELLIGENCE_TRAINER_OUTPUT_ROOT) ===
    "/runpod-volume/avantiqo-intelligence-training",
  template_hf_cache:
    text(templateEnv.HF_HOME) === "/runpod-volume/huggingface-cache" &&
    text(templateEnv.TRANSFORMERS_CACHE) === "/runpod-volume/huggingface-cache",
  canonical_shared_volume_attached: Boolean(canonicalVolume),
  canonical_shared_volume_at_least_160_gb:
    Number(canonicalVolume?.size || canonicalVolume?.sizeGb || 0) >= REQUIRED_VOLUME_SIZE_GB,
  data_center_constraint_satisfied: dataCenterConstraintSatisfied,
  gpu_count_at_least_one: Number(endpoint?.gpuCount || 0) >= 1,
  trainer_workers_min_zero: Number(endpoint?.workersMin || 0) === 0,
  trainer_workers_max_one: Number(endpoint?.workersMax || 0) === 1,
  execution_timeout_two_hours:
    Number(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout || 0) === 7_200_000,
  runtime_runpod_api_key_present: Boolean(runtimeQueueKey),
  runtime_runpod_api_key_queue_read_authorized: runtimeQueueProbe.ok === true,
  queue_has_no_pending_job:
    Boolean(runtimeQueueHealth) &&
    runtimeQueueHealth.jobs.in_queue === 0 &&
    runtimeQueueHealth.jobs.in_progress === 0,
};

const failedChecks = Object.entries(checks)
  .filter(([, passed]) => passed !== true)
  .map(([name]) => name);
const externalInfrastructureReady = failedChecks.length === 0;
const managementQueueReadable = managementQueueProbe.ok === true;

let nextAction = "TRAINING_SUBMISSION_INFRASTRUCTURE_READY_PREPARE_OR_SELECT_TRAINING_JOB";
if (!endpoint) {
  nextAction = "TRAINER_ENDPOINT_RESOLUTION_REPAIR_REQUIRED";
} else if (trainerImage !== CERTIFIED_TRAINER_IMAGE) {
  nextAction = "TRAINER_CERTIFIED_IMAGE_REPAIR_REQUIRED";
} else if (!canonicalVolume) {
  nextAction = "TRAINER_CANONICAL_SHARED_VOLUME_ATTACHMENT_REQUIRED";
} else if (Number(canonicalVolume?.size || canonicalVolume?.sizeGb || 0) < REQUIRED_VOLUME_SIZE_GB) {
  nextAction = "TRAINER_SHARED_VOLUME_CAPACITY_REPAIR_REQUIRED";
} else if (!runtimeQueueKey && managementQueueReadable) {
  nextAction = "RUNPOD_API_KEY_LOCAL_RUNTIME_BINDING_REQUIRED_MANAGEMENT_KEY_QUEUE_READS_OK";
} else if (!runtimeQueueKey) {
  nextAction = "RUNPOD_API_KEY_LOCAL_RUNTIME_BINDING_REQUIRED";
} else if (!runtimeQueueProbe.ok) {
  nextAction = managementQueueReadable
    ? "RUNPOD_API_KEY_QUEUE_SCOPE_REPAIR_REQUIRED_MANAGEMENT_KEY_QUEUE_READS_OK"
    : "RUNPOD_QUEUE_CREDENTIAL_SCOPE_REPAIR_REQUIRED";
} else if (
  runtimeQueueHealth.jobs.in_queue > 0 ||
  runtimeQueueHealth.jobs.in_progress > 0
) {
  nextAction = "WAIT_FOR_EXISTING_TRAINER_QUEUE_TO_CLEAR_BEFORE_NEW_TRAINING";
} else if (!externalInfrastructureReady) {
  nextAction = "TRAINING_SUBMISSION_INFRASTRUCTURE_REPAIR_REQUIRED";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  certified_source_sha: CERTIFIED_SOURCE_SHA,
  foundation_model: FOUNDATION_MODEL,
  local_env: localEnv,
  management_credential: {
    source_variable: management.source,
    candidate_count: management.candidate_count,
    scope_verified_by_read_only_endpoint_list: true,
    queue_read_authorized: managementQueueReadable,
    value_exposed: false,
  },
  trainer: {
    resolution: trainerResolution.resolution,
    match_count: trainerResolution.match_count,
    endpoint: endpoint ? {
      id: endpointId,
      name: text(endpoint?.name) || null,
      template_id: text(endpoint?.templateId || template?.id) || null,
      template_resolution_source: resolvedTemplate.source,
      image_name: trainerImage || null,
      exact_certified_image_binding: trainerImage === CERTIFIED_TRAINER_IMAGE,
      gpu_count: finite(endpoint?.gpuCount),
      gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value)).filter(Boolean),
      data_center_ids: dataCenterIds,
      network_volume_ids: volumeIds,
      workers_min: finite(endpoint?.workersMin),
      workers_max: finite(endpoint?.workersMax),
      idle_timeout_seconds: finite(endpoint?.idleTimeout),
      execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout),
    } : null,
    template_environment: {
      trainer_enabled:
        text(templateEnv.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED).toLowerCase() === "true",
      output_root: text(templateEnv.AVANTIQO_INTELLIGENCE_TRAINER_OUTPUT_ROOT) || null,
      hf_home: text(templateEnv.HF_HOME) || null,
      transformers_cache: text(templateEnv.TRANSFORMERS_CACHE) || null,
      tokenizers_parallelism: text(templateEnv.TOKENIZERS_PARALLELISM) || null,
    },
  },
  storage: {
    canonical_attached_volume: canonicalVolume ? {
      id: text(canonicalVolume?.id) || null,
      name: text(canonicalVolume?.name) || null,
      size_gb: finite(canonicalVolume?.size ?? canonicalVolume?.sizeGb),
      data_center_id: canonicalVolumeDataCenter || null,
    } : null,
    trainer_artifact_volume_ready: Boolean(
      canonicalVolume &&
      Number(canonicalVolume?.size || canonicalVolume?.sizeGb || 0) >= REQUIRED_VOLUME_SIZE_GB,
    ),
    candidate_endpoint_and_adapter_binding_deferred_until_training_completion: true,
  },
  queue_submission_path: {
    runtime_variable: "RUNPOD_API_KEY",
    runtime_key_present: Boolean(runtimeQueueKey),
    runtime_key_health_status: runtimeQueueProbe.status,
    runtime_key_queue_read_authorized: runtimeQueueProbe.ok === true,
    management_key_queue_read_authorized: managementQueueReadable,
    health: runtimeQueueHealth,
    provider_job_submitted: false,
  },
  checks,
  failed_checks: failedChecks,
  external_training_submission_infrastructure_ready: externalInfrastructureReady,
  next_action: nextAction,
  governance: {
    management_read_only: true,
    queue_read_only: true,
    provider_job_submitted: false,
    gpu_job_submitted: false,
    training_started: false,
    endpoint_mutated: false,
    template_mutated: false,
    network_volume_mutated: false,
    candidate_endpoint_created: false,
    production_model_promoted: false,
    production_web_deploy: false,
    secrets_in_output: false,
  },
}, null, 2));
