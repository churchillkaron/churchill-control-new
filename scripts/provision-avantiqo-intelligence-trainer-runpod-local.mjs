import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_RUNPOD_PROVISION_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const TEMPLATE_NAME = "avantiqo-intelligence-trainer-v1";
const DEFAULT_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const CERTIFIED_SOURCE_SHA = "bef2ff27b4774e66960a08322ebe8e5ee9f19dfb";
const CERTIFIED_TRAINER_IMAGE =
  "ghcr.io/churchillkaron/avantiqo-intelligence-trainer@sha256:eb24423075767c15d476c2ad0c9695482addf68e28b2b85af4768dc6a606bb4f";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const MIN_GPU_MEMORY_GB = 80;
const MIN_NETWORK_VOLUME_GB = 80;
const DEFAULT_EXECUTION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 5;
const ENV_FILE_VARIABLES = [
  "AVANTIQO_INTELLIGENCE_RUNPOD_ENV_FILE",
  "AVANTIQO_INTELLIGENCE_READINESS_ENV_FILE",
];

const GPU_PROFILES = Object.freeze([
  Object.freeze({
    key: "A100_80GB",
    match: /(?:A100.*80\s*GB|80\s*GB.*A100|A100-SXM4-80GB)/i,
    exclude: /\bMIG\b/i,
    vram_gb: 80,
    economy_preference: 1000,
  }),
  Object.freeze({
    key: "RTX_PRO_6000_96GB",
    match: /RTX\s*PRO\s*6000/i,
    exclude: /\bMIG\b/i,
    vram_gb: 96,
    economy_preference: 900,
  }),
  Object.freeze({
    key: "H100_80GB",
    match: /\bH100\b/i,
    exclude: /NVL|\bMIG\b/i,
    vram_gb: 80,
    economy_preference: 800,
  }),
  Object.freeze({
    key: "H100_NVL_94GB",
    match: /H100.*NVL|NVL.*H100/i,
    exclude: /\bMIG\b/i,
    vram_gb: 94,
    economy_preference: 700,
  }),
  Object.freeze({
    key: "H200_141GB",
    match: /\bH200\b/i,
    exclude: /\bMIG\b/i,
    vram_gb: 141,
    economy_preference: 600,
  }),
  Object.freeze({
    key: "B200_180GB",
    match: /\bB200\b/i,
    exclude: /\bMIG\b/i,
    vram_gb: 180,
    economy_preference: 500,
  }),
]);

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

function unique(values) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value, 40).toUpperCase()] || 0);
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
    name === "AVANTIQO_INTELLIGENCE_RUNPOD_REGISTRY_AUTH_ID" ||
    name === "AVANTIQO_INTELLIGENCE_TRAINER_NETWORK_VOLUME_ID" ||
    name === "AVANTIQO_INTELLIGENCE_TRAINER_GPU_TYPE_IDS" ||
    name === "AVANTIQO_INTELLIGENCE_TRAINER_RUNPOD_PROVISION_APPROVED"
  );
}

function loadRelevantLocalEnv() {
  const envPath = explicitEnvPath();
  if (!envPath) {
    return {
      path_available: false,
      parsed_without_execution: false,
      relevant_assignment_count: 0,
      nonempty_runpod_api_key_count: 0,
      secret_values_printed: false,
    };
  }
  let source;
  try {
    source = fs.readFileSync(envPath, "utf8");
  } catch (error) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_PROVISION_ENV_READ_FAILED:${text(error?.code || error?.message || error, 300)}`,
    );
  }
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
    if (/^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name) && value) nonemptyRunpodApiKeyCount += 1;
  }
  return {
    path_available: true,
    parsed_without_execution: true,
    malformed_non_assignment_lines_ignored: true,
    relevant_assignment_count: relevantAssignmentCount,
    nonempty_runpod_api_key_count: nonemptyRunpodApiKeyCount,
    secret_values_printed: false,
  };
}

function commaList(value) {
  return unique(text(value).split(",").map((entry) => entry.trim()).filter(Boolean));
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

function registryAuthDescriptor(item = {}) {
  return [
    item?.name,
    item?.registry,
    item?.registryUrl,
    item?.registry_url,
    item?.serverAddress,
    item?.server_address,
    item?.url,
    item?.host,
  ]
    .map((value) => text(value))
    .filter(Boolean)
    .join(" ");
}

function looksLikeRegistryAuthRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!text(value.id)) return false;
  return Boolean(
    registryAuthDescriptor(value) ||
    Object.prototype.hasOwnProperty.call(value, "username") ||
    Object.prototype.hasOwnProperty.call(value, "password") ||
    Object.prototype.hasOwnProperty.call(value, "credential") ||
    Object.prototype.hasOwnProperty.call(value, "credentials")
  );
}

function normalizeRegistryAuthResponse(value) {
  const preferred = normalizeListResponse(value, [
    "containerRegistryAuths",
    "containerRegistryCreds",
    "registryAuths",
    "registryCredentials",
    "credentials",
    "auths",
  ]);
  if (preferred) return preferred;
  const records = [];
  const seen = new Set();
  function visit(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    if (looksLikeRegistryAuthRecord(node)) records.push(node);
    for (const child of Object.values(node)) visit(child, depth + 1);
  }
  visit(value);
  return records;
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
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

async function rest(pathname, credential, options = {}) {
  return readJson(
    await fetch(`${REST_BASE}${pathname}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    }),
    "AVANTIQO_INTELLIGENCE_TRAINER_PROVISION_REST",
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
    throw new Error("RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED_FOR_INTELLIGENCE_TRAINER_PROVISION");
  }
  const rejectedStatuses = [];
  for (const candidate of candidates) {
    const response = await fetch(
      `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=false`,
      {
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
        endpoints_body: await readJson(response, "AVANTIQO_INTELLIGENCE_TRAINER_PROVISION_MANAGEMENT_PROBE"),
      };
    }
    if ([401, 403].includes(response.status)) {
      rejectedStatuses.push(response.status);
      await response.text().catch(() => "");
      continue;
    }
    const detail = text(await response.text(), 500);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_PROVISION_MANAGEMENT_PROBE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  throw new Error(
    `RUNPOD_MANAGEMENT_SCOPE_CREDENTIAL_NOT_FOUND:candidates=${candidates.length}:rejected_statuses=${rejectedStatuses.join(",") || "NONE"}`,
  );
}

async function discoverDatacenters(managementKey) {
  const query = `
    query AvantiqoIntelligenceTrainerCapacity($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
        storageSupport
        gpuAvailability(input: $input) {
          available
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: MIN_GPU_MEMORY_GB,
          secureCloud: true,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
      1000,
    );
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_GPU_AVAILABILITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`,
    );
  }
  return body.data.dataCenters;
}

function gpuProfile(gpu = {}) {
  const label = [gpu?.gpuTypeId, gpu?.gpuTypeDisplayName, gpu?.displayName]
    .map((value) => text(value))
    .filter(Boolean)
    .join(" ");
  if (/\bMIG\b/i.test(label)) return null;
  return (
    GPU_PROFILES.find(
      (profile) =>
        profile.match.test(label) && !(profile.exclude && profile.exclude.test(label)),
    ) || null
  );
}

function capacityRows(dataCenters) {
  const rows = [];
  for (const dataCenter of list(dataCenters)) {
    for (const gpu of list(dataCenter?.gpuAvailability)) {
      const profile = gpuProfile(gpu);
      if (!profile || profile.vram_gb < MIN_GPU_MEMORY_GB) continue;
      rows.push({
        data_center_id: text(dataCenter?.id) || null,
        data_center_name: text(dataCenter?.name) || null,
        location: text(dataCenter?.location) || null,
        storage_support: dataCenter?.storageSupport === true,
        gpu_type_id: text(gpu?.gpuTypeId) || null,
        gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId) || null,
        profile: profile.key,
        vram_gb: profile.vram_gb,
        available: gpu?.available === true,
        stock_status: text(gpu?.stockStatus).toUpperCase() || "UNAVAILABLE",
        stock_rank: stockRank(gpu?.stockStatus),
        economy_preference: profile.economy_preference,
      });
    }
  }
  return rows.filter((row) => row.gpu_type_id && row.data_center_id);
}

function rankCapacity(rows) {
  return [...rows].sort(
    (left, right) =>
      right.stock_rank - left.stock_rank ||
      right.economy_preference - left.economy_preference ||
      right.vram_gb - left.vram_gb ||
      left.gpu_type_id.localeCompare(right.gpu_type_id),
  );
}

function resolveRegistryAuth(registryAuths) {
  const explicitId = text(process.env.AVANTIQO_INTELLIGENCE_RUNPOD_REGISTRY_AUTH_ID);
  if (explicitId) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicitId);
    if (matches.length !== 1) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_RUNPOD_REGISTRY_AUTH_ID_NOT_FOUND:matches=${matches.length}`,
      );
    }
    return matches[0];
  }
  const candidates = registryAuths.filter((item) =>
    /ghcr|github/i.test(registryAuthDescriptor(item)),
  );
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_RUNPOD_GHCR_AUTH_AMBIGUOUS:matches=${candidates.length}`,
    );
  }
  return null;
}

function resolveVolume(volumes) {
  const explicitId = text(process.env.AVANTIQO_INTELLIGENCE_TRAINER_NETWORK_VOLUME_ID);
  const matches = explicitId
    ? volumes.filter((volume) => text(volume?.id) === explicitId)
    : volumes.filter((volume) => text(volume?.name) === DEFAULT_VOLUME_NAME);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_NETWORK_VOLUME_RESOLUTION_FAILED:matches=${matches.length}`,
    );
  }
  const volume = matches[0];
  const sizeGb = finite(volume?.size ?? volume?.sizeGb, 0);
  const dataCenterId = text(volume?.dataCenterId);
  if (sizeGb < MIN_NETWORK_VOLUME_GB) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_NETWORK_VOLUME_TOO_SMALL:size_gb=${sizeGb}`,
    );
  }
  if (!dataCenterId) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_NETWORK_VOLUME_DATACENTER_REQUIRED");
  }
  return volume;
}

function exactByName(items, name, errorPrefix) {
  const matches = items.filter((item) => text(item?.name) === name);
  if (matches.length > 1) {
    throw new Error(`${errorPrefix}_AMBIGUOUS:matches=${matches.length}`);
  }
  return matches[0] || null;
}

function safeVolume(volume = {}) {
  return {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: finite(volume?.size ?? volume?.sizeGb),
    data_center_id: text(volume?.dataCenterId) || null,
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template?.id) || null,
    name: text(template?.name) || null,
    image_name: text(template?.imageName || template?.image) || null,
    exact_certified_image_binding:
      text(template?.imageName || template?.image) === CERTIFIED_TRAINER_IMAGE,
    registry_auth_configured: Boolean(text(template?.containerRegistryAuthId)),
    container_disk_gb: finite(template?.containerDiskInGb),
  };
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    text(endpoint?.networkVolumeId),
    ...list(endpoint?.networkVolumeIds).map((value) => text(value)),
  ]);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    template_image: text(endpoint?.template?.imageName || endpoint?.template?.image) || null,
    exact_certified_image_binding:
      text(endpoint?.template?.imageName || endpoint?.template?.image) ===
      CERTIFIED_TRAINER_IMAGE,
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

function desiredTemplateEnv() {
  return {
    AVANTIQO_INTELLIGENCE_TRAINER_ENABLED: "true",
    AVANTIQO_INTELLIGENCE_TRAINER_OUTPUT_ROOT:
      "/runpod-volume/avantiqo-intelligence-training",
    HF_HOME: "/runpod-volume/huggingface-cache",
    TRANSFORMERS_CACHE: "/runpod-volume/huggingface-cache",
    TOKENIZERS_PARALLELISM: "false",
  };
}

function templateIssues(template, registryAuthId) {
  if (!template) return ["missing"];
  const env = object(template?.env);
  const issues = [];
  if (text(template?.imageName || template?.image) !== CERTIFIED_TRAINER_IMAGE) {
    issues.push("certified_image");
  }
  if (text(template?.containerRegistryAuthId) !== registryAuthId) issues.push("registry_auth");
  if (finite(template?.containerDiskInGb, 0) < 30) issues.push("container_disk");
  for (const [name, value] of Object.entries(desiredTemplateEnv())) {
    if (text(env[name]) !== value) issues.push(`env:${name}`);
  }
  return issues;
}

function writeEndpointBinding(endpointId) {
  const envPath = explicitEnvPath();
  if (!envPath) {
    return { updated: false, reason: "NO_LOCAL_ENV_PATH" };
  }
  const source = fs.readFileSync(envPath, "utf8");
  const name = "RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID";
  const nextLine = `${name}=${endpointId}`;
  const pattern = new RegExp(`^(?:export\\s+)?${name}=.*$`, "m");
  let next = source;
  if (pattern.test(source)) {
    next = source.replace(pattern, nextLine);
  } else {
    next = `${source}${source.length && !source.endsWith("\n") ? "\n" : ""}${nextLine}\n`;
  }
  if (next === source) return { updated: false, reason: "ALREADY_CURRENT" };
  const tempPath = path.join(
    os.tmpdir(),
    `avantiqo-intelligence-trainer-env-${process.pid}-${Date.now()}.tmp`,
  );
  fs.writeFileSync(tempPath, next, { mode: 0o600 });
  fs.renameSync(tempPath, envPath);
  return { updated: true, reason: "TRAINER_ENDPOINT_ID_WRITTEN" };
}

const localEnv = loadRelevantLocalEnv();
const apply = process.argv.includes("--apply");
if (
  apply &&
  text(process.env.AVANTIQO_INTELLIGENCE_TRAINER_RUNPOD_PROVISION_APPROVED).toUpperCase() !==
    "YES"
) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_RUNPOD_PROVISION_APPROVED=YES_REQUIRED");
}

const management = await resolveManagementCredential();
const managementKey = management.credential;
const [templatesRaw, volumesRaw, registryAuthRaw, dataCenters] = await Promise.all([
  rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  ),
  rest("/networkvolumes", managementKey),
  rest("/containerregistryauth", managementKey),
  discoverDatacenters(managementKey),
]);

const endpoints = normalizeListResponse(management.endpoints_body, ["endpoints", "serverlessEndpoints"]);
const templates = normalizeListResponse(templatesRaw, ["templates"]);
const volumes = normalizeListResponse(volumesRaw, ["networkVolumes", "volumes"]);
if (!endpoints) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!templates) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
if (!volumes) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
const registryAuths = normalizeRegistryAuthResponse(registryAuthRaw);

const existingEndpoint = exactByName(
  endpoints,
  ENDPOINT_NAME,
  "AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_NAME",
);
const existingTemplate = exactByName(
  templates,
  TEMPLATE_NAME,
  "AVANTIQO_INTELLIGENCE_TRAINER_TEMPLATE_NAME",
);
const registryAuth = resolveRegistryAuth(registryAuths);
const volume = resolveVolume(volumes);
const volumeSummary = safeVolume(volume);
const volumeDataCenterId = volumeSummary.data_center_id;

const allCapacity = rankCapacity(capacityRows(dataCenters));
const eligibleTargetRegionCapacity = allCapacity.filter(
  (row) =>
    row.storage_support &&
    row.data_center_id === volumeDataCenterId &&
    row.available &&
    row.stock_rank > 0,
);
const configuredGpuTypeIds = commaList(process.env.AVANTIQO_INTELLIGENCE_TRAINER_GPU_TYPE_IDS);
const selectedGpuTypeIds = configuredGpuTypeIds.length
  ? configuredGpuTypeIds.filter((id) =>
      eligibleTargetRegionCapacity.some((row) => row.gpu_type_id === id),
    )
  : unique(eligibleTargetRegionCapacity.slice(0, 3).map((row) => row.gpu_type_id));

const alternativeRegions = unique(
  allCapacity
    .filter(
      (row) =>
        row.storage_support &&
        row.data_center_id !== volumeDataCenterId &&
        row.available &&
        row.stock_rank > 0,
    )
    .map((row) => row.data_center_id),
).map((dataCenterId) => ({
  data_center_id: dataCenterId,
  capacity: allCapacity
    .filter(
      (row) =>
        row.data_center_id === dataCenterId && row.available && row.stock_rank > 0,
    )
    .slice(0, 5),
}));

const existingTemplateIssues = existingTemplate
  ? templateIssues(existingTemplate, text(registryAuth?.id))
  : [];
const existingEndpointSummary = existingEndpoint ? safeEndpoint(existingEndpoint) : null;
const existingEndpointReady = Boolean(
  existingEndpointSummary &&
    existingEndpointSummary.exact_certified_image_binding &&
    existingEndpointSummary.network_volume_ids.includes(volumeSummary.id) &&
    existingEndpointSummary.data_center_ids.includes(volumeDataCenterId) &&
    Number(existingEndpointSummary.gpu_count || 0) >= 1 &&
    Number(existingEndpointSummary.workers_min || 0) === 0,
);

let nextAction;
if (existingEndpointReady) {
  nextAction = "TRAINER_ENDPOINT_ALREADY_READY_RUN_CERTIFIED_BINDING_READINESS";
} else if (existingEndpoint) {
  nextAction = "EXISTING_TRAINER_ENDPOINT_REPAIR_REQUIRED_DO_NOT_CREATE_DUPLICATE";
} else if (!registryAuth) {
  nextAction = "CONFIGURE_GHCR_REGISTRY_AUTH_BEFORE_TRAINER_PROVISION";
} else if (existingTemplateIssues.length) {
  nextAction = "EXISTING_TRAINER_TEMPLATE_REPAIR_REQUIRED_BEFORE_ENDPOINT_PROVISION";
} else if (!eligibleTargetRegionCapacity.length || !selectedGpuTypeIds.length) {
  nextAction = alternativeRegions.length
    ? "PLAN_DEDICATED_INTELLIGENCE_TRAINING_VOLUME_IN_STOCKED_80GB_GPU_REGION"
    : "WAIT_FOR_80GB_PLUS_GPU_CAPACITY";
} else if (apply) {
  nextAction = "CREATE_CERTIFIED_TRAINER_TEMPLATE_AND_ZERO_SCALE_ENDPOINT";
} else {
  nextAction = "APPROVE_ZERO_SCALE_TRAINER_ENDPOINT_PROVISION";
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  certified_source_sha: CERTIFIED_SOURCE_SHA,
  certified_trainer_image: CERTIFIED_TRAINER_IMAGE,
  foundation_model: FOUNDATION_MODEL,
  local_env: localEnv,
  management_credential: {
    source_variable: management.source,
    candidate_count: management.candidate_count,
    scope_verified_by_read_only_endpoint_list: true,
    value_exposed: false,
  },
  existing: {
    endpoint: existingEndpointSummary,
    endpoint_ready: existingEndpointReady,
    template: existingTemplate ? safeTemplate(existingTemplate) : null,
    template_issues: existingTemplateIssues,
  },
  registry_auth: {
    ghcr_auth_found: Boolean(registryAuth),
    id_present: Boolean(text(registryAuth?.id)),
    value_exposed: false,
  },
  storage: {
    selected_network_volume: volumeSummary,
    minimum_size_gb: MIN_NETWORK_VOLUME_GB,
    mount_contract: "/runpod-volume",
    shared_model_cache_path: "/runpod-volume/huggingface-cache",
    trainer_output_path: "/runpod-volume/avantiqo-intelligence-training",
  },
  gpu_policy: {
    minimum_vram_gb: MIN_GPU_MEMORY_GB,
    bf16_required: true,
    mig_allowed: false,
    configured_override_requested: configuredGpuTypeIds,
    target_region_available_capacity: eligibleTargetRegionCapacity,
    selected_gpu_type_ids: selectedGpuTypeIds,
    alternative_stocked_regions: alternativeRegions.slice(0, 8),
  },
  desired_endpoint: {
    name: ENDPOINT_NAME,
    workers_min: 0,
    workers_max: 1,
    gpu_count: 1,
    gpu_type_ids: selectedGpuTypeIds,
    data_center_ids: [volumeDataCenterId],
    network_volume_id: volumeSummary.id,
    idle_timeout_seconds: DEFAULT_IDLE_TIMEOUT_SECONDS,
    execution_timeout_ms: DEFAULT_EXECUTION_TIMEOUT_MS,
  },
  next_action: nextAction,
  governance: {
    provider_job_submitted: false,
    training_started: false,
    candidate_endpoint_created: false,
    production_model_promoted: false,
    production_web_deploy: false,
    secret_values_printed: false,
    mutation_performed: false,
  },
};

if (!apply || existingEndpointReady) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (existingEndpoint) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_EXISTS_REPAIR_REQUIRED");
}
if (!registryAuth) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_GHCR_REGISTRY_AUTH_REQUIRED");
}
if (existingTemplateIssues.length) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_TRAINER_TEMPLATE_REPAIR_REQUIRED:${existingTemplateIssues.join("|")}`,
  );
}
if (!eligibleTargetRegionCapacity.length || !selectedGpuTypeIds.length) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_80GB_GPU_CAPACITY_REQUIRED_IN_VOLUME_REGION");
}
if (
  configuredGpuTypeIds.length &&
  selectedGpuTypeIds.length !== configuredGpuTypeIds.length
) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_GPU_OVERRIDE_NOT_FULLY_AVAILABLE");
}

let template = existingTemplate;
let templateCreated = false;
if (!template) {
  template = await rest("/templates", managementKey, {
    method: "POST",
    body: {
      imageName: CERTIFIED_TRAINER_IMAGE,
      name: TEMPLATE_NAME,
      category: "NVIDIA",
      containerDiskInGb: 30,
      containerRegistryAuthId: text(registryAuth.id),
      dockerEntrypoint: [],
      dockerStartCmd: [],
      env: desiredTemplateEnv(),
      isPublic: false,
      isServerless: true,
      ports: [],
      readme:
        "Avantiqo-owned Qwen3-30B-A3B Thinking BF16 LoRA trainer. Certified immutable image. Dedicated model-improvement lane only; no production inference promotion.",
      volumeInGb: 0,
      volumeMountPath: "/workspace",
    },
  });
  templateCreated = true;
}

const templateId = text(template?.id);
if (!templateId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_TEMPLATE_ID_REQUIRED");
const templateAfterCreate = safeTemplate(template);
if (!templateAfterCreate.exact_certified_image_binding) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_TEMPLATE_CERTIFIED_IMAGE_BINDING_REQUIRED");
}

const freshEndpointsRaw = await rest(
  "/endpoints?includeTemplate=true&includeWorkers=false",
  managementKey,
);
const freshEndpoints = normalizeListResponse(freshEndpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!freshEndpoints) throw new Error("RUNPOD_FRESH_ENDPOINT_LIST_INVALID");
const freshMatches = freshEndpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (freshMatches.length) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_APPEARED_REPLAN_REQUIRED:matches=${freshMatches.length}`,
  );
}

const endpoint = await rest("/endpoints", managementKey, {
  method: "POST",
  body: {
    templateId,
    computeType: "GPU",
    executionTimeoutMs: DEFAULT_EXECUTION_TIMEOUT_MS,
    flashboot: true,
    gpuCount: 1,
    gpuTypeIds: selectedGpuTypeIds,
    dataCenterIds: [volumeDataCenterId],
    networkVolumeId: volumeSummary.id,
    idleTimeout: DEFAULT_IDLE_TIMEOUT_SECONDS,
    name: ENDPOINT_NAME,
    scalerType: "QUEUE_DELAY",
    scalerValue: 2,
    workersMax: 1,
    workersMin: 0,
  },
});
const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_CREATED_ENDPOINT_ID_REQUIRED");

const verified = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=false`,
  managementKey,
);
const verifiedSummary = safeEndpoint(verified);
if (
  verifiedSummary.name !== ENDPOINT_NAME ||
  verifiedSummary.template_id !== templateId ||
  verifiedSummary.template_image !== CERTIFIED_TRAINER_IMAGE ||
  !verifiedSummary.network_volume_ids.includes(volumeSummary.id) ||
  !verifiedSummary.data_center_ids.includes(volumeDataCenterId) ||
  Number(verifiedSummary.gpu_count || 0) < 1 ||
  Number(verifiedSummary.workers_min || 0) !== 0
) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_PROVISION_VERIFY_FAILED");
}

const envBinding = writeEndpointBinding(endpointId);
console.log(
  JSON.stringify(
    {
      ...plan,
      mode: "APPLY",
      created: {
        template_created: templateCreated,
        endpoint_created: true,
        template: safeTemplate(verified?.template || template),
        endpoint: verifiedSummary,
        local_env_endpoint_binding_updated: envBinding.updated,
        local_env_endpoint_binding_reason: envBinding.reason,
      },
      next_action: "RUN_CERTIFIED_IMAGE_BINDING_READINESS_BEFORE_ANY_TRAINING",
      governance: {
        ...plan.governance,
        mutation_performed: true,
        provider_job_submitted: false,
        training_started: false,
        workers_min_zero_verified: true,
      },
    },
    null,
    2,
  ),
);
