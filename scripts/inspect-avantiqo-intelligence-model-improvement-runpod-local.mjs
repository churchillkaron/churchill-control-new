const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_MODEL_IMPROVEMENT_RUNPOD_READINESS_V1";
const TRAINER_NAME = "avantiqo-intelligence-trainer-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-candidate-v1";
const CERTIFIED_SOURCE_SHA = "bef2ff27b4774e66960a08322ebe8e5ee9f19dfb";
const CERTIFIED_TRAINER_IMAGE =
  "ghcr.io/churchillkaron/avantiqo-intelligence-trainer@sha256:eb24423075767c15d476c2ad0c9695482addf68e28b2b85af4768dc6a606bb4f";
const CERTIFIED_CANDIDATE_IMAGE =
  "ghcr.io/churchillkaron/avantiqo-intelligence-candidate@sha256:3e19d865a23567ae24bbef9ec562261cbceaa79bacaee71a36475cd911848ee7";

function text(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeList(value, candidateKey, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [candidateKey, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeList(value[key], candidateKey, depth + 1);
    if (normalized) return normalized;
  }
  return null;
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
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(pathname, credential) {
  return readJson(
    await fetch(`${REST_BASE}${pathname}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "AVANTIQO_INTELLIGENCE_MODEL_IMPROVEMENT_READINESS_REST",
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
    const value = text(process.env[name], 4000);
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
      "RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED_FOR_READ_ONLY_INTELLIGENCE_READINESS:NO_NONEMPTY_RUNPOD_API_KEYS",
    );
  }
  const rejectedStatuses = [];
  for (const candidate of candidates) {
    const response = await fetch(
      `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=false`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${candidate.value}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (response.ok) {
      return {
        credential: candidate.value,
        source: candidate.name,
        candidate_count: candidates.length,
        endpoints_body: await readJson(
          response,
          "AVANTIQO_INTELLIGENCE_MODEL_IMPROVEMENT_READINESS_MANAGEMENT_PROBE",
        ),
      };
    }
    if (response.status === 401 || response.status === 403) {
      await response.text().catch(() => "");
      rejectedStatuses.push(response.status);
      continue;
    }
    const detail = text(await response.text(), 500);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_MODEL_IMPROVEMENT_READINESS_MANAGEMENT_PROBE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  throw new Error(
    `RUNPOD_MANAGEMENT_SCOPE_CREDENTIAL_NOT_FOUND:candidates=${candidates.length}:rejected_statuses=${rejectedStatuses.join(",") || "NONE"}`,
  );
}

function resolveEndpoint(endpoints, configuredId, exactName) {
  const id = text(configuredId, 200);
  if (id) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id, 200) === id);
    if (matches.length !== 1) {
      return { endpoint: null, resolution: "CONFIGURED_ID_NOT_UNIQUE", match_count: matches.length };
    }
    return {
      endpoint: matches[0],
      resolution: text(matches[0]?.name) === exactName ? "CONFIGURED_ID" : "CONFIGURED_ID_NAME_MISMATCH",
      match_count: 1,
    };
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name, 240) === exactName);
  return {
    endpoint: matches.length === 1 ? matches[0] : null,
    resolution: matches.length === 1 ? "EXACT_NAME" : "EXACT_NAME_NOT_UNIQUE",
    match_count: matches.length,
  };
}

function resolveTemplate(endpoint, templates) {
  if (!endpoint) return { template: null, source: "ENDPOINT_NOT_RESOLVED" };
  const embedded = object(endpoint.template);
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

function safeEnv(value = {}) {
  const env = object(value);
  const visible = new Set([
    "AVANTIQO_INTELLIGENCE_TRAINER_ENABLED",
    "AVANTIQO_INTELLIGENCE_CANDIDATE_ENABLED",
    "AVANTIQO_INTELLIGENCE_CANDIDATE_ADAPTER_PATH",
    "HF_HOME",
    "TRANSFORMERS_CACHE",
    "MAX_CONCURRENCY",
  ]);
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => visible.has(key))
      .map(([key, val]) => [key, key.endsWith("ADAPTER_PATH") ? Boolean(text(val)) : text(val, 300)]),
  );
}

function safeEndpoint(endpoint, resolvedTemplate, expectedImage) {
  if (!endpoint) return null;
  const template = object(resolvedTemplate?.template);
  const image = text(template?.imageName || template?.image, 1200) || null;
  const networkVolumeIds = [
    text(endpoint?.networkVolumeId, 200),
    ...list(endpoint?.networkVolumeIds).map((value) => text(value, 200)),
  ].filter(Boolean);
  return {
    id: text(endpoint?.id, 200) || null,
    name: text(endpoint?.name, 240) || null,
    template_id: text(endpoint?.templateId || template?.id, 200) || null,
    template_resolution_source: resolvedTemplate?.source || null,
    image_name: image,
    exact_certified_image_binding: image === expectedImage,
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value, 240)).filter(Boolean),
    data_center_ids: list(endpoint?.dataCenterIds).map((value) => text(value, 120)).filter(Boolean),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
    network_volume_ids: [...new Set(networkVolumeIds)],
    network_volume_attached: networkVolumeIds.length > 0,
    environment: {
      endpoint: safeEnv(endpoint?.env),
      template: safeEnv(template?.env),
    },
  };
}

function safeVolume(volume = {}) {
  return {
    id: text(volume?.id, 200) || null,
    name: text(volume?.name, 240) || null,
    size_gb: finite(volume?.size),
    data_center_id: text(volume?.dataCenterId, 120) || null,
  };
}

const management = await resolveManagementCredential();
const managementKey = management.credential;
const [templatesBody, volumesBody] = await Promise.all([
  rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  ),
  rest("/networkvolumes", managementKey),
]);
const endpoints = normalizeList(management.endpoints_body, "endpoints") || [];
const templates = normalizeList(templatesBody, "templates") || [];
const volumes = normalizeList(volumesBody, "networkVolumes") || [];

const trainerResolution = resolveEndpoint(
  endpoints,
  process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID,
  TRAINER_NAME,
);
const candidateResolution = resolveEndpoint(
  endpoints,
  process.env.RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID,
  CANDIDATE_NAME,
);
const trainerTemplate = resolveTemplate(trainerResolution.endpoint, templates);
const candidateTemplate = resolveTemplate(candidateResolution.endpoint, templates);
const trainer = safeEndpoint(trainerResolution.endpoint, trainerTemplate, CERTIFIED_TRAINER_IMAGE);
const candidate = safeEndpoint(candidateResolution.endpoint, candidateTemplate, CERTIFIED_CANDIDATE_IMAGE);

const trainerVolumeIds = new Set(list(trainer?.network_volume_ids));
const candidateVolumeIds = new Set(list(candidate?.network_volume_ids));
const sharedVolumeIds = [...trainerVolumeIds].filter((id) => candidateVolumeIds.has(id));
const trainerReady = Boolean(
  trainer &&
    trainer.exact_certified_image_binding === true &&
    trainer.network_volume_attached === true &&
    Number(trainer.gpu_count || 0) >= 1,
);
const candidateImageReady = Boolean(
  candidate &&
    candidate.exact_certified_image_binding === true &&
    candidate.network_volume_attached === true &&
    Number(candidate.gpu_count || 0) >= 1,
);

const report = {
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  certified_source_sha: CERTIFIED_SOURCE_SHA,
  management_credential: {
    source_variable: management.source,
    candidate_count: management.candidate_count,
    scope_verified_by_read_only_endpoint_list: true,
    value_exposed: false,
  },
  trainer: {
    resolution: trainerResolution.resolution,
    match_count: trainerResolution.match_count,
    endpoint: trainer,
    ready_for_governed_training_submission: trainerReady,
  },
  candidate: {
    resolution: candidateResolution.resolution,
    match_count: candidateResolution.match_count,
    endpoint: candidate,
    certified_image_ready: candidateImageReady,
    adapter_binding_deferred_until_training_completion: true,
  },
  storage: {
    shared_trainer_candidate_network_volume_ids: sharedVolumeIds,
    shared_training_artifact_volume_ready: sharedVolumeIds.length > 0,
    account_network_volumes: volumes.map(safeVolume),
  },
  next_action: !trainer
    ? "PREPARE_DEDICATED_TRAINER_ENDPOINT_PLAN"
    : !trainer.exact_certified_image_binding
      ? "PLAN_TRAINER_CERTIFIED_IMAGE_REBIND"
      : !trainer.network_volume_attached
        ? "PLAN_TRAINING_NETWORK_VOLUME_ATTACHMENT"
        : !candidate
          ? "TRAINER_READY_CANDIDATE_ENDPOINT_CAN_REMAIN_DEFERRED"
          : !candidate.exact_certified_image_binding
            ? "PLAN_CANDIDATE_CERTIFIED_IMAGE_REBIND"
            : sharedVolumeIds.length === 0
              ? "PLAN_SHARED_TRAINING_ARTIFACT_VOLUME"
              : "MODEL_IMPROVEMENT_ENDPOINTS_READINESS_CONFIRMED",
  governance: {
    management_read_only: true,
    provider_job_submitted: false,
    training_started: false,
    endpoint_mutated: false,
    template_mutated: false,
    network_volume_mutated: false,
    candidate_probe_submitted: false,
    production_model_promoted: false,
    production_web_deploy: false,
    secrets_in_output: false,
  },
};

console.log(JSON.stringify(report));
