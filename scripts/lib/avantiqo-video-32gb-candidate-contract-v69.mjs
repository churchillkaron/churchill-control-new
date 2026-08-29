import { readFile } from "node:fs/promises";

export const VIDEO_32GB_CANDIDATE_CONTRACT = "AVANTIQO_VIDEO_32GB_CANDIDATE_POOL_CONTRACT_V69";
export const VIDEO_32GB_CANDIDATE_ENDPOINT_NAME = "avantiqo-video-32gb-candidate-v1";
export const VIDEO_PRODUCTION_ENDPOINT_NAME = "avantiqo-cinema-production-v1";
export const VIDEO_32GB_CANDIDATE_POOL_ID = "ADA_32_PRO";
export const VIDEO_32GB_CANDIDATE_PRIMARY_GPU = "NVIDIA RTX PRO 4500 Blackwell";
export const VIDEO_32GB_CANDIDATE_SECONDARY_GPU = "NVIDIA GeForce RTX 5090";
export const VIDEO_32GB_CANDIDATE_APPROVED_GPUS = Object.freeze([
  VIDEO_32GB_CANDIDATE_PRIMARY_GPU,
  VIDEO_32GB_CANDIDATE_SECONDARY_GPU,
]);
export const VIDEO_32GB_CANDIDATE_DATA_CENTER = "EU-RO-1";
export const VIDEO_32GB_CANDIDATE_CACHE_VOLUME_NAME = "avantiqo-video-cache-eu-ro-1";
export const VIDEO_32GB_CANDIDATE_IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-32gb-candidate.json";
export const VIDEO_32GB_CANDIDATE_IMAGE_CONTRACT = "AVANTIQO_VIDEO_32GB_CANDIDATE_IMAGE_RESULT_V1";
export const VIDEO_32GB_CANDIDATE_RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_32GB_GROUP_OFFLOAD_V1";
export const VIDEO_32GB_CANDIDATE_MEMORY_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_32GB_MEMORY_PROFILE_V1";
export const VIDEO_32GB_CANDIDATE_ENTRYPOINT_REVISION = "AVANTIQO_VIDEO_HANDLER_V5_WAN22_32GB_GROUP_OFFLOAD_V1";
export const VIDEO_32GB_CANDIDATE_QUALITY_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1";
export const VIDEO_T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
export const VIDEO_I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";

const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_BASE = "https://api.runpod.io/graphql";
const TERMINAL_WORKER_STATES = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

export function text(value) {
  return String(value ?? "").trim();
}

export function list(value) {
  return Array.isArray(value) ? value : [];
}

export function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function unique(values) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = normalizeRows(value[key], keys, depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function desiredEnv() {
  return {
    AVANTIQO_VIDEO_DEVICE: "cuda",
    AVANTIQO_VIDEO_DTYPE: "bfloat16",
    AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL: "1",
    AVANTIQO_VIDEO_HF_CACHE_ROOT: "/runpod-volume/huggingface-cache/hub",
    AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB: "400",
    AVANTIQO_VIDEO_T2V_MODEL: VIDEO_T2V_MODEL,
    AVANTIQO_VIDEO_I2V_MODEL: VIDEO_I2V_MODEL,
    AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES: "ai.video.generate,ai.video.image_to_video",
    AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED: "0",
  };
}

export function endpointTemplateId(endpoint = {}) {
  const embedded = endpoint?.template;
  return text(
    endpoint?.templateId ??
    endpoint?.template_id ??
    (typeof embedded === "string" ? embedded : embedded?.id),
  );
}

export function endpointVolumeIds(endpoint = {}) {
  const primary = text(endpoint?.networkVolumeId ?? endpoint?.network_volume_id);
  const additional = list(endpoint?.networkVolumeIds ?? endpoint?.network_volume_ids)
    .map((entry) => text(
      typeof entry === "string"
        ? entry
        : entry?.networkVolumeId ?? entry?.network_volume_id ?? entry?.id,
    ))
    .filter(Boolean);
  return unique([primary, ...additional]);
}

export function endpointGpuTypeIds(endpoint = {}) {
  return unique(endpoint?.gpuTypeIds ?? endpoint?.gpu_type_ids);
}

export function workersMin(endpoint = {}) {
  return finite(endpoint?.workersMin ?? endpoint?.workers_min, -1);
}

export function workersMax(endpoint = {}) {
  return finite(endpoint?.workersMax ?? endpoint?.workers_max, -1);
}

export function activeManagementWorkers(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status && !TERMINAL_WORKER_STATES.has(status)) return true;
    if (desired && !TERMINAL_WORKER_STATES.has(desired)) return true;
    return !status && !desired;
  });
}

export function managementHourlyCost(endpoint = {}) {
  return activeManagementWorkers(endpoint).reduce(
    (sum, worker) => sum + Math.max(0, finite(worker?.adjustedCostPerHr ?? worker?.costPerHr, 0) || 0),
    0,
  );
}

export function stableEndpointSnapshot(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: endpointTemplateId(endpoint) || null,
    workers_min: workersMin(endpoint),
    workers_max: workersMax(endpoint),
    gpu_type_ids: endpointGpuTypeIds(endpoint),
    network_volume_ids: endpointVolumeIds(endpoint),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.execution_timeout_ms, null),
    idle_timeout: finite(endpoint?.idleTimeout ?? endpoint?.idle_timeout, null),
  };
}

function templateSummary(template = {}) {
  return {
    id: text(template?.id) || null,
    name: text(template?.name) || null,
    image_name: text(template?.imageName ?? template?.image_name) || null,
    container_disk_gb: finite(template?.containerDiskInGb ?? template?.container_disk_gb, null),
    registry_auth_configured: Boolean(text(template?.containerRegistryAuthId ?? template?.container_registry_auth_id)),
  };
}

function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2, AVAILABLE: 1 })[text(value).toUpperCase()] || 0;
}

function gpuMetadata(capacity, id) {
  return list(capacity?.gpuTypes).find((gpu) => text(gpu?.id) === id) || null;
}

function gpuAvailabilityRow(capacity, dataCenterId, gpuId) {
  const dataCenter = list(capacity?.dataCenters).find((row) => text(row?.id) === dataCenterId);
  if (!dataCenter) return null;
  const matches = list(dataCenter?.gpuAvailability).filter((row) => text(row?.gpuTypeId) === gpuId);
  if (matches.length !== 1) return null;
  return matches[0];
}

export async function runpodRest(managementKey, pathname, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`AVANTIQO_VIDEO_32GB_RUNPOD_REST_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

export async function runpodGraphql(managementKey, query, variables = {}) {
  const response = await fetch(`${GRAPHQL_BASE}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 AvantiqoVideo32GbCandidate",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_VIDEO_32GB_RUNPOD_GRAPHQL_HTTP_${response.status}`);
  }
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (errors.length) {
    throw new Error(`AVANTIQO_VIDEO_32GB_RUNPOD_GRAPHQL:${errors.join(" | ").slice(0, 900)}`);
  }
  if (!body?.data) throw new Error("AVANTIQO_VIDEO_32GB_RUNPOD_GRAPHQL_DATA_REQUIRED");
  return body.data;
}

export async function reassertVideo32gbCandidatePool({ managementKey, inspected }) {
  const candidate = inspected?.candidate_endpoint;
  const endpointId = text(candidate?.id);
  const endpointName = text(candidate?.name);
  const templateId = endpointTemplateId(candidate);
  const volumeIds = endpointVolumeIds(candidate);
  if (!endpointId || endpointName !== VIDEO_32GB_CANDIDATE_ENDPOINT_NAME || !templateId) {
    throw new Error("AVANTIQO_VIDEO_32GB_POOL_REASSERT_CANDIDATE_IDENTITY_INVALID");
  }
  if (workersMin(candidate) !== 0 || workersMax(candidate) !== 0) {
    throw new Error("AVANTIQO_VIDEO_32GB_POOL_REASSERT_REQUIRES_PARKED_0_0");
  }
  if (activeManagementWorkers(candidate).length !== 0 || managementHourlyCost(candidate) !== 0) {
    throw new Error("AVANTIQO_VIDEO_32GB_POOL_REASSERT_ACTIVE_WORKER_FORBIDDEN");
  }
  if (volumeIds.length !== 1 || volumeIds[0] !== text(inspected?.cache_volume?.id)) {
    throw new Error("AVANTIQO_VIDEO_32GB_POOL_REASSERT_CACHE_BINDING_INVALID");
  }

  const input = {
    id: endpointId,
    name: VIDEO_32GB_CANDIDATE_ENDPOINT_NAME,
    templateId,
    gpuIds: VIDEO_32GB_CANDIDATE_POOL_ID,
    workersMin: 0,
    workersMax: 0,
    networkVolumeId: volumeIds[0],
  };
  const idleTimeout = finite(candidate?.idleTimeout ?? candidate?.idle_timeout, null);
  if (idleTimeout !== null && idleTimeout >= 0) input.idleTimeout = idleTimeout;
  const scalerType = text(candidate?.scalerType ?? candidate?.scaler_type);
  if (scalerType) input.scalerType = scalerType;
  const scalerValue = finite(candidate?.scalerValue ?? candidate?.scaler_value, null);
  if (scalerValue !== null && scalerValue > 0) input.scalerValue = scalerValue;

  const mutation = `
    mutation AvantiqoVideo32GbPoolReassert($input: EndpointInput!) {
      saveEndpoint(input: $input) {
        id
        name
        gpuIds
        templateId
        workersMin
        workersMax
      }
    }
  `;
  const data = await runpodGraphql(managementKey, mutation, { input });
  const saved = data?.saveEndpoint;
  if (
    text(saved?.id) !== endpointId ||
    text(saved?.name) !== VIDEO_32GB_CANDIDATE_ENDPOINT_NAME ||
    text(saved?.gpuIds) !== VIDEO_32GB_CANDIDATE_POOL_ID ||
    text(saved?.templateId) !== templateId ||
    workersMin(saved) !== 0 ||
    workersMax(saved) !== 0
  ) {
    throw new Error(`AVANTIQO_VIDEO_32GB_POOL_REASSERT_RESPONSE_INVALID:${JSON.stringify({
      id: text(saved?.id) || null,
      name: text(saved?.name) || null,
      gpu_ids: text(saved?.gpuIds) || null,
      template_id: text(saved?.templateId) || null,
      workers_min: workersMin(saved),
      workers_max: workersMax(saved),
    })}`);
  }

  const after = await runpodRest(
    managementKey,
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  );
  if (
    text(after?.id) !== endpointId ||
    text(after?.name) !== VIDEO_32GB_CANDIDATE_ENDPOINT_NAME ||
    endpointTemplateId(after) !== templateId ||
    workersMin(after) !== 0 ||
    workersMax(after) !== 0 ||
    endpointVolumeIds(after).length !== 1 ||
    endpointVolumeIds(after)[0] !== volumeIds[0] ||
    activeManagementWorkers(after).length !== 0 ||
    managementHourlyCost(after) !== 0
  ) {
    throw new Error("AVANTIQO_VIDEO_32GB_POOL_REASSERT_POST_STATE_INVALID");
  }

  return {
    pool_id: VIDEO_32GB_CANDIDATE_POOL_ID,
    control_plane_verified_by_mutation_response: true,
    endpoint_id: endpointId,
    workers_min: 0,
    workers_max: 0,
    rest_after: stableEndpointSnapshot(after),
  };
}

async function imageEvidence() {
  let evidence = null;
  try {
    evidence = JSON.parse(await readFile(VIDEO_32GB_CANDIDATE_IMAGE_EVIDENCE_PATH, "utf8"));
  } catch (error) {
    throw new Error(`AVANTIQO_VIDEO_32GB_IMAGE_EVIDENCE_REQUIRED:${error?.code || "READ_FAILED"}`);
  }
  const valid =
    evidence?.success === true &&
    text(evidence?.contract) === VIDEO_32GB_CANDIDATE_IMAGE_CONTRACT &&
    evidence?.source_sha_matches_trigger === true &&
    text(evidence?.source_sha) === text(evidence?.trigger_sha) &&
    text(evidence?.entrypoint) === "handler_v5.py" &&
    text(evidence?.runtime_revision) === VIDEO_32GB_CANDIDATE_RUNTIME_REVISION &&
    text(evidence?.memory_contract) === VIDEO_32GB_CANDIDATE_MEMORY_CONTRACT &&
    Number(evidence?.target_minimum_vram_gb) === 32 &&
    text(evidence?.group_offload_type) === "leaf_level" &&
    evidence?.group_offload_stream === true &&
    evidence?.quantization_enabled === false &&
    evidence?.layerwise_casting_enabled === false &&
    text(evidence?.diffusion_dtype) === "bfloat16" &&
    text(evidence?.vae_decode_dtype) === "float32" &&
    text(evidence?.quality_contract_preserved) === VIDEO_32GB_CANDIDATE_QUALITY_CONTRACT &&
    text(evidence?.configured_text_to_video_foundation) === VIDEO_T2V_MODEL &&
    text(evidence?.configured_image_to_video_foundation) === VIDEO_I2V_MODEL &&
    evidence?.candidate_only === true &&
    evidence?.production_rebind_performed === false &&
    evidence?.runpod_endpoint_mutation_performed === false &&
    evidence?.runpod_worker_mutation_performed === false &&
    evidence?.video_generation_submitted === false &&
    evidence?.external_paid_provider_contacted === false &&
    evidence?.secrets_in_output === false;
  if (!valid) throw new Error("AVANTIQO_VIDEO_32GB_IMAGE_EVIDENCE_INVALID");
  const image = text(evidence?.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VIDEO_32GB_IMMUTABLE_IMAGE_REQUIRED");
  }
  return {
    image,
    digest: text(evidence?.image_digest),
    source_sha: text(evidence?.source_sha),
    github_run_id: text(evidence?.github_run_id),
  };
}

function assertTemplate(template, image) {
  if (!template) throw new Error("AVANTIQO_VIDEO_32GB_TEMPLATE_REQUIRED");
  if (text(template?.imageName ?? template?.image_name) !== image.image) {
    throw new Error("AVANTIQO_VIDEO_32GB_TEMPLATE_IMAGE_MISMATCH");
  }
  const env = normalizeEnv(template?.env);
  const mismatches = Object.entries(desiredEnv())
    .filter(([key, expected]) => env[key] !== expected)
    .map(([key]) => key);
  if (mismatches.length) {
    throw new Error(`AVANTIQO_VIDEO_32GB_TEMPLATE_ENV_MISMATCH:${mismatches.join(",")}`);
  }
}

export async function inspectVideo32gbCandidate({ managementKey, productionEndpointId }) {
  if (!text(managementKey)) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  if (!text(productionEndpointId)) throw new Error("RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID_REQUIRED");

  const image = await imageEvidence();
  const capacityQuery = `
    query AvantiqoVideo32GbCandidateContract($input: GpuAvailabilityInput) {
      myself {
        endpoints {
          id
          name
          templateId
          gpuIds
          gpuCount
          workersMin
          workersMax
          networkVolumeId
          networkVolumeIds { networkVolumeId }
        }
      }
      gpuTypes { id displayName memoryInGb secureCloud communityCloud }
      serverlessGpuPools { id gpuTypeIds }
      dataCenters {
        id
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

  const [production, rawEndpoints, rawTemplates, rawVolumes, capacity] = await Promise.all([
    runpodRest(managementKey, `/endpoints/${encodeURIComponent(productionEndpointId)}?includeTemplate=true&includeWorkers=true`),
    runpodRest(managementKey, "/endpoints?includeTemplate=true&includeWorkers=true"),
    runpodRest(managementKey, "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false"),
    runpodRest(managementKey, "/networkvolumes"),
    runpodGraphql(managementKey, capacityQuery, {
      input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 32, secureCloud: true },
    }),
  ]);

  const endpoints = normalizeRows(rawEndpoints, ["endpoints", "serverlessEndpoints"]);
  const templates = normalizeRows(rawTemplates, ["templates"]);
  const volumes = normalizeRows(rawVolumes, ["networkVolumes", "networkvolumes"]);
  if (!endpoints.length || !templates.length || !volumes.length) {
    throw new Error("AVANTIQO_VIDEO_32GB_RUNPOD_INVENTORY_INVALID");
  }
  if (text(production?.id) !== productionEndpointId || text(production?.name) !== VIDEO_PRODUCTION_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VIDEO_32GB_PRODUCTION_ENDPOINT_IDENTITY_INVALID");
  }

  const candidateMatches = endpoints.filter((endpoint) => text(endpoint?.name) === VIDEO_32GB_CANDIDATE_ENDPOINT_NAME);
  if (candidateMatches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_ENDPOINT_REQUIRED:matches=${candidateMatches.length}`);
  }
  const candidate = candidateMatches[0];
  if (text(candidate?.id) === productionEndpointId) {
    throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_COLLIDES_WITH_PRODUCTION");
  }
  if (workersMin(candidate) !== 0 || workersMax(candidate) !== 0) {
    throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_NOT_PARKED:${workersMin(candidate)}/${workersMax(candidate)}`);
  }
  if (activeManagementWorkers(candidate).length !== 0 || managementHourlyCost(candidate) !== 0) {
    throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_ACTIVE_WORKER_PRESENT");
  }
  const restGpuTypes = endpointGpuTypeIds(candidate);
  if (restGpuTypes.some((gpuType) => !VIDEO_32GB_CANDIDATE_APPROVED_GPUS.includes(gpuType))) {
    throw new Error(`AVANTIQO_VIDEO_32GB_REST_GPU_TYPE_NOT_APPROVED:${restGpuTypes.join(",")}`);
  }

  const candidateTemplateId = endpointTemplateId(candidate);
  const candidateTemplate = templates.find((template) => text(template?.id) === candidateTemplateId) || null;
  assertTemplate(candidateTemplate, image);

  const volumeMatches = volumes.filter((volume) => text(volume?.name) === VIDEO_32GB_CANDIDATE_CACHE_VOLUME_NAME);
  if (volumeMatches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_32GB_CACHE_VOLUME_REQUIRED:matches=${volumeMatches.length}`);
  }
  const volume = volumeMatches[0];
  const volumeId = text(volume?.id);
  const volumeDc = text(volume?.dataCenterId ?? volume?.data_center_id);
  const volumeSizeGb = finite(volume?.size ?? volume?.sizeGb, null);
  if (!volumeId || volumeDc !== VIDEO_32GB_CANDIDATE_DATA_CENTER || !(volumeSizeGb >= 400)) {
    throw new Error("AVANTIQO_VIDEO_32GB_CACHE_VOLUME_CONTRACT_INVALID");
  }
  const candidateVolumes = endpointVolumeIds(candidate);
  if (candidateVolumes.length !== 1 || candidateVolumes[0] !== volumeId) {
    throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_CACHE_BINDING_INVALID");
  }
  if (!endpointVolumeIds(production).includes(volumeId)) {
    throw new Error("AVANTIQO_VIDEO_32GB_CACHE_NOT_SHARED_WITH_PRODUCTION_VIDEO");
  }

  const gqlEndpoints = list(capacity?.myself?.endpoints);
  const gqlCandidateMatches = gqlEndpoints.filter((endpoint) =>
    text(endpoint?.id) === text(candidate?.id) && text(endpoint?.name) === VIDEO_32GB_CANDIDATE_ENDPOINT_NAME,
  );
  if (gqlCandidateMatches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_32GB_GRAPHQL_CANDIDATE_REQUIRED:matches=${gqlCandidateMatches.length}`);
  }
  const gqlCandidate = gqlCandidateMatches[0];
  if (endpointTemplateId(gqlCandidate) !== candidateTemplateId) {
    throw new Error("AVANTIQO_VIDEO_32GB_GRAPHQL_TEMPLATE_MISMATCH");
  }
  if (workersMin(gqlCandidate) !== 0 || workersMax(gqlCandidate) !== 0) {
    throw new Error("AVANTIQO_VIDEO_32GB_GRAPHQL_CANDIDATE_NOT_PARKED");
  }
  const gqlVolumes = endpointVolumeIds(gqlCandidate);
  if (gqlVolumes.length !== 1 || gqlVolumes[0] !== volumeId) {
    throw new Error("AVANTIQO_VIDEO_32GB_GRAPHQL_CACHE_BINDING_INVALID");
  }
  const gpuPoolId = text(gqlCandidate?.gpuIds);
  if (gpuPoolId && gpuPoolId !== VIDEO_32GB_CANDIDATE_POOL_ID) {
    throw new Error(`AVANTIQO_VIDEO_32GB_SERVERLESS_POOL_INVALID:${gpuPoolId}`);
  }
  const poolMatches = list(capacity?.serverlessGpuPools).filter((pool) => text(pool?.id) === VIDEO_32GB_CANDIDATE_POOL_ID);
  if (poolMatches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_32GB_SERVERLESS_POOL_REQUIRED:matches=${poolMatches.length}`);
  }

  const liveGpuEvidence = VIDEO_32GB_CANDIDATE_APPROVED_GPUS.map((gpuId) => {
    const meta = gpuMetadata(capacity, gpuId);
    const availability = gpuAvailabilityRow(capacity, VIDEO_32GB_CANDIDATE_DATA_CENTER, gpuId);
    if (!meta) throw new Error(`AVANTIQO_VIDEO_32GB_GPU_METADATA_REQUIRED:${gpuId}`);
    if (meta?.secureCloud !== true || finite(meta?.memoryInGb, null) !== 32) {
      throw new Error(`AVANTIQO_VIDEO_32GB_GPU_METADATA_INVALID:${gpuId}`);
    }
    return {
      gpu_type_id: gpuId,
      display_name: text(meta?.displayName) || gpuId,
      memory_gb: finite(meta?.memoryInGb, null),
      secure_cloud: meta?.secureCloud === true,
      available_in_eu_ro_1: availability?.available === true,
      stock_status: text(availability?.stockStatus).toUpperCase() || "UNAVAILABLE",
      stock_rank: stockRank(availability?.stockStatus),
    };
  });
  const primary = liveGpuEvidence.find((entry) => entry.gpu_type_id === VIDEO_32GB_CANDIDATE_PRIMARY_GPU);
  if (!primary || primary.available_in_eu_ro_1 !== true || primary.stock_rank < 3) {
    throw new Error(`AVANTIQO_VIDEO_32GB_PRIMARY_CAPACITY_INSUFFICIENT:${primary?.stock_status || "UNAVAILABLE"}`);
  }

  return {
    contract: VIDEO_32GB_CANDIDATE_CONTRACT,
    candidate_endpoint: candidate,
    candidate_endpoint_summary: stableEndpointSnapshot(candidate),
    candidate_graphql: gqlCandidate,
    candidate_serverless_pool_id: gpuPoolId || null,
    candidate_serverless_pool_readback_supported: Boolean(gpuPoolId),
    candidate_serverless_pool_reassert_required: gpuPoolId !== VIDEO_32GB_CANDIDATE_POOL_ID,
    candidate_template: candidateTemplate,
    candidate_template_summary: templateSummary(candidateTemplate),
    immutable_image: image,
    cache_volume: {
      id: volumeId,
      name: VIDEO_32GB_CANDIDATE_CACHE_VOLUME_NAME,
      data_center_id: volumeDc,
      size_gb: volumeSizeGb,
    },
    approved_runtime_gpu_types: [...VIDEO_32GB_CANDIDATE_APPROVED_GPUS],
    live_gpu_evidence: liveGpuEvidence,
    physical_gpu_runtime_verification_required: true,
    production_endpoint: production,
    production_endpoint_snapshot: stableEndpointSnapshot(production),
  };
}

export async function assertVideoProductionUnchanged({ managementKey, productionEndpointId, before }) {
  const after = await runpodRest(
    managementKey,
    `/endpoints/${encodeURIComponent(productionEndpointId)}?includeTemplate=true&includeWorkers=true`,
  );
  const afterSnapshot = stableEndpointSnapshot(after);
  if (JSON.stringify(afterSnapshot) !== JSON.stringify(before)) {
    throw new Error("AVANTIQO_VIDEO_32GB_PRODUCTION_ENDPOINT_CHANGED");
  }
  return afterSnapshot;
}
