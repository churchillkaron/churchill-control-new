import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_IMAGE_VIDEO_SHARED_VOLUME_EXPANSION_V2";
const TARGET_SIZE_GB = 160;
const MIN_CURRENT_SIZE_GB = 80;
const STORAGE_RATE_USD_PER_GB_MONTH = 0.07;
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const SHARED_GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V3";
const V5_ENTRYPOINT = "handler_v5.py";
const V5_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_VOLUME_QUOTA_GUARD_V1";
const V5_QUOTA_GUARD = "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1";
const COST_GUARDED_GPU_POOL = ["NVIDIA RTX PRO 6000 Blackwell Server Edition"];
const REQUIRED_IDLE_TIMEOUT_SECONDS = 10;

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1200)}`);
  }
  return text(result.stdout);
}
function requireCurrentMain(label) {
  command("git", ["fetch", "origin", "main"], `${label}_FETCH_MAIN_FAILED`);
  const branch = command("git", ["branch", "--show-current"], `${label}_BRANCH_READ_FAILED`);
  if (branch !== "main") throw new Error(`${label}_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], `${label}_HEAD_READ_FAILED`);
  const origin = command("git", ["rev-parse", "origin/main"], `${label}_ORIGIN_READ_FAILED`);
  if (head !== origin) throw new Error(`${label}_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  return head;
}
async function parseResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1200)}`);
  }
  return body ?? {};
}
async function rest(path, key, options = {}) {
  return parseResponse(
    await fetch(`${REST_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    }),
    "RUNPOD_REST",
  );
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}
function templateBody(template, imageName, env) {
  const body = {
    containerDiskInGb: finite(template.containerDiskInGb, 30),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(env ?? template.env),
    imageName,
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
  };
  if (!body.name) throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_TEMPLATE_NAME_REQUIRED");
  if (text(template.containerRegistryAuthId)) {
    body.containerRegistryAuthId = text(template.containerRegistryAuthId);
  }
  return body;
}
function comparableTemplate(body) {
  return {
    containerDiskInGb: finite(body.containerDiskInGb, 30),
    dockerEntrypoint: list(body.dockerEntrypoint),
    dockerStartCmd: list(body.dockerStartCmd),
    env: normalizeEnv(body.env),
    imageName: text(body.imageName),
    isPublic: body.isPublic === true,
    name: text(body.name),
    ports: list(body.ports),
    readme: text(body.readme),
    volumeInGb: finite(body.volumeInGb, 0),
    volumeMountPath: text(body.volumeMountPath),
    containerRegistryAuthId: text(body.containerRegistryAuthId),
  };
}
async function endpointBoundTemplates(key) {
  const templates = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  if (!Array.isArray(templates)) throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_TEMPLATE_LIST_INVALID");
  return templates;
}
function resolveTemplate(endpoint, templates) {
  const inline = object(endpoint.template);
  const templateId = text(endpoint.templateId || inline.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length && text(inline.imageName)) return inline;
  const matches = templates.filter((template) => text(template.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`);
  }
  return matches[0];
}
async function readImageState(endpointId, key) {
  const [endpoint, templates] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, key),
    endpointBoundTemplates(key),
  ]);
  return { endpoint, template: resolveTemplate(endpoint, templates) };
}
function validateImageCostGuard(endpoint) {
  if (!sameSet(list(endpoint.gpuTypeIds), COST_GUARDED_GPU_POOL)) {
    throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_GPU_COST_GUARD_INVALID:${list(endpoint.gpuTypeIds).join("|")}`);
  }
  if (finite(endpoint.idleTimeout) !== REQUIRED_IDLE_TIMEOUT_SECONDS) {
    throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_IDLE_TIMEOUT_INVALID:${finite(endpoint.idleTimeout)}`);
  }
  if (finite(endpoint.workersMin) !== 0 || finite(endpoint.workersMax) !== 1) {
    throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_SCALING_INVALID:min=${finite(endpoint.workersMin)}:max=${finite(endpoint.workersMax)}`);
  }
}
function validateEvidence() {
  const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
  if (
    evidence.success !== true ||
    text(evidence.contract) !== EVIDENCE_CONTRACT ||
    text(evidence.entrypoint) !== V5_ENTRYPOINT ||
    text(evidence.runtime_revision) !== V5_RUNTIME ||
    text(evidence.volume_quota_guard_contract) !== V5_QUOTA_GUARD ||
    evidence.backing_filesystem_capacity_used_for_decision !== false ||
    evidence.provider_job_submitted !== false ||
    evidence.image_generation_submitted !== false ||
    evidence.model_download_submitted !== false ||
    evidence.production_web_deploy !== false
  ) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_V5_EVIDENCE_INVALID");
  }
  const image = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_V5_IMAGE_INVALID");
  }
  return { evidence, image };
}
function endpointUsers(endpoints, volumeId) {
  return list(endpoints)
    .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
    .map((endpoint) => ({
      id: text(endpoint.id) || null,
      name: text(endpoint.name) || null,
      workers_min: finite(endpoint.workersMin),
      workers_max: finite(endpoint.workersMax),
      workers: list(endpoint.workers).map((worker) => ({
        id: text(worker.id) || null,
        desired_status: text(worker.desiredStatus ?? worker.desired_status).toUpperCase() || null,
      })),
    }));
}
function assertNoLiveWorkers(users) {
  for (const user of users) {
    if (!SHARED_GROUP.endpoint_names.includes(user.name)) {
      throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_UNEXPECTED_ENDPOINT_USER:${user.name || "MISSING"}`);
    }
    if (user.workers_min !== 0) {
      throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_MIN_WORKER_BLOCKED:${user.name}:min=${user.workers_min}`);
    }
    const live = user.workers.filter((worker) => worker.desired_status && worker.desired_status !== "EXITED");
    if (live.length) {
      throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_LIVE_WORKER_BLOCKED:${user.name}:count=${live.length}`);
    }
  }
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_IMAGE_VIDEO_VOLUME_EXPANSION_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_EXPANSION_APPROVED=YES_REQUIRED");
}
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const mainSha = requireCurrentMain("AVANTIQO_IMAGE_VIDEO_VOLUME");
const { image } = validateEvidence();

console.log(`AVANTIQO_IMAGE_VIDEO_VOLUME_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_IMAGE_VIDEO_VOLUME_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_VIDEO_VOLUME_TARGET_GB=${TARGET_SIZE_GB}`);
console.log("AVANTIQO_IMAGE_VIDEO_VOLUME_NEW_VOLUME_CREATED=false");
console.log("AVANTIQO_IMAGE_VIDEO_VOLUME_GENERATION=false");
console.log("AVANTIQO_IMAGE_VIDEO_VOLUME_INFERENCE=false");
console.log("AVANTIQO_IMAGE_VIDEO_VOLUME_MODEL_DOWNLOAD=false");
console.log("AVANTIQO_IMAGE_VIDEO_VOLUME_GPU_JOB=false");
console.log("AVANTIQO_IMAGE_VIDEO_VOLUME_PRODUCTION_DEPLOY=false");

const [endpoints, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_INVENTORY_INVALID");
}

const imageMatches = configuredEndpointId
  ? endpoints.filter((endpoint) => text(endpoint.id) === configuredEndpointId && text(endpoint.name) === IMAGE_ENDPOINT_NAME)
  : endpoints.filter((endpoint) => text(endpoint.name) === IMAGE_ENDPOINT_NAME);
if (imageMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_IMAGE_ENDPOINT_RESOLUTION_FAILED:matches=${imageMatches.length}`);
}
const imageEndpoint = imageMatches[0];
validateImageCostGuard(imageEndpoint);

const policy = sharedVolumePolicySummary(volumes);
console.log(`AVANTIQO_IMAGE_VIDEO_VOLUME_GLOBAL_SHARED_POLICY_COMPLIANT=${policy.policy_compliant ? "true" : "false"}`);
if (!policy.policy_compliant) {
  console.log(`AVANTIQO_IMAGE_VIDEO_VOLUME_GLOBAL_SHARED_POLICY_WARNING=${JSON.stringify({
    managed_cache_volume_count: policy.managed_cache_volume_count,
    maximum_managed_cache_volumes: policy.maximum_managed_cache_volumes,
    unknown_avantiqo_cache_volumes: policy.unknown_avantiqo_cache_volumes,
    duplicate_groups: policy.duplicate_groups,
  })}`);
}

const groupVolumes = groupCacheVolumes(volumes, SHARED_GROUP);
if (groupVolumes.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_CANONICAL_COUNT_INVALID:${groupVolumes.length}`);
}
const volume = groupVolumes[0];
const volumeId = text(volume.id);
const volumeName = text(volume.name);
const currentSizeGb = finite(volume.size, 0);
const dataCenterId = text(volume.dataCenterId);
if (!volumeId || volumeName !== SHARED_GROUP.canonical_name || !dataCenterId) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_CANONICAL_IDENTITY_INVALID");
}
if (currentSizeGb < MIN_CURRENT_SIZE_GB) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_CURRENT_SIZE_INVALID:${currentSizeGb}`);
}
const imageVolumeIds = endpointVolumeIds(imageEndpoint);
if (imageVolumeIds.length !== 1 || imageVolumeIds[0] !== volumeId) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_IMAGE_ATTACHMENT_INVALID:${imageVolumeIds.join("|") || "NONE"}`);
}

const state = await readImageState(text(imageEndpoint.id), managementKey);
if (text(state.template.imageName) !== image) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_V5_NOT_BOUND");
}
const templateEnv = normalizeEnv(state.template.env);
const configuredQuotaGb = finite(templateEnv.AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB, MIN_CURRENT_SIZE_GB);
if (configuredQuotaGb > currentSizeGb) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_TEMPLATE_QUOTA_EXCEEDS_VOLUME:quota=${configuredQuotaGb}:volume=${currentSizeGb}`);
}

const users = endpointUsers(endpoints, volumeId);
assertNoLiveWorkers(users);
const deltaGb = Math.max(0, TARGET_SIZE_GB - currentSizeGb);
const estimatedDeltaMonthlyUsd = Number((deltaGb * STORAGE_RATE_USD_PER_GB_MONTH).toFixed(2));
const targetQuotaEnv = String(Math.max(currentSizeGb, TARGET_SIZE_GB));
const volumeMutationRequired = currentSizeGb < TARGET_SIZE_GB;
const templateMutationRequired = text(templateEnv.AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB) !== targetQuotaEnv;

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  canonical_volume: {
    id: volumeId,
    name: volumeName,
    data_center_id: dataCenterId,
    current_size_gb: currentSizeGb,
    target_size_gb: Math.max(currentSizeGb, TARGET_SIZE_GB),
    expansion_gb: deltaGb,
    estimated_incremental_monthly_usd_at_reference_rate: estimatedDeltaMonthlyUsd,
  },
  attached_endpoints: users,
  image: {
    endpoint_id: text(imageEndpoint.id),
    template_id: text(state.template.id || state.endpoint.templateId),
    immutable_worker_image: image,
    existing_quota_env_gb: text(templateEnv.AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB) || null,
    target_quota_env_gb: targetQuotaEnv,
    cost_guard_verified: true,
  },
  shared_volume_policy: policy,
  target_scope_policy_compliant: true,
  global_shared_policy_compliant: policy.policy_compliant,
  mutation_required: volumeMutationRequired || templateMutationRequired,
  volume_mutation_required: volumeMutationRequired,
  template_mutation_required: templateMutationRequired,
  safety: {
    no_new_volume: true,
    no_volume_delete: true,
    no_endpoint_patch: true,
    no_gpu_job: true,
    no_generation: true,
    no_inference: true,
    no_model_download: true,
    unrelated_shared_group_policy_does_not_block_target_resize: true,
    resize_before_quota_env_update: true,
    fail_closed_if_template_update_fails_after_resize: true,
    production_deploy: false,
  },
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_VIDEO_VOLUME_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let volumeExpanded = false;
let quotaEnvUpdated = false;

if (volumeMutationRequired) {
  requireCurrentMain("AVANTIQO_IMAGE_VIDEO_VOLUME_BEFORE_RESIZE");
  const freshVolumes = await rest("/networkvolumes", managementKey);
  const freshMatches = groupCacheVolumes(freshVolumes, SHARED_GROUP);
  if (freshMatches.length !== 1) throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_CONCURRENT_VOLUME_CHANGE");
  const fresh = freshMatches[0];
  if (
    text(fresh.id) !== volumeId ||
    text(fresh.name) !== volumeName ||
    text(fresh.dataCenterId) !== dataCenterId ||
    finite(fresh.size, 0) !== currentSizeGb
  ) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_CONCURRENT_VOLUME_STATE_CHANGED");
  }

  await rest(`/networkvolumes/${encodeURIComponent(volumeId)}/update`, managementKey, {
    method: "POST",
    body: { name: volumeName, size: TARGET_SIZE_GB },
  });
  const verifiedVolume = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
  if (
    text(verifiedVolume.id) !== volumeId ||
    text(verifiedVolume.name) !== volumeName ||
    text(verifiedVolume.dataCenterId) !== dataCenterId ||
    finite(verifiedVolume.size, 0) < TARGET_SIZE_GB
  ) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_RESIZE_VERIFY_FAILED");
  }
  volumeExpanded = true;
  console.log(`AVANTIQO_IMAGE_VIDEO_VOLUME_RESIZED_GB=${finite(verifiedVolume.size, 0)}`);
}

try {
  const finalVolume = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
  const actualSizeGb = finite(finalVolume.size, 0);
  if (actualSizeGb < TARGET_SIZE_GB) {
    throw new Error(`AVANTIQO_IMAGE_VIDEO_VOLUME_FINAL_SIZE_TOO_SMALL:${actualSizeGb}`);
  }

  requireCurrentMain("AVANTIQO_IMAGE_VIDEO_VOLUME_BEFORE_TEMPLATE_UPDATE");
  const freshState = await readImageState(text(imageEndpoint.id), managementKey);
  validateImageCostGuard(freshState.endpoint);
  if (text(freshState.template.imageName) !== image) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_WORKER_CHANGED_BEFORE_TEMPLATE_UPDATE");
  }
  const freshVolumeIds = endpointVolumeIds(freshState.endpoint);
  if (freshVolumeIds.length !== 1 || freshVolumeIds[0] !== volumeId) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_ATTACHMENT_CHANGED_BEFORE_TEMPLATE_UPDATE");
  }

  const templateId = text(freshState.template.id || freshState.endpoint.templateId);
  const freshEnv = normalizeEnv(freshState.template.env);
  const desiredEnv = {
    ...freshEnv,
    AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB: String(actualSizeGb),
  };
  const beforeComparable = comparableTemplate(
    templateBody(freshState.template, text(freshState.template.imageName), freshEnv),
  );
  const desiredBody = templateBody(
    freshState.template,
    text(freshState.template.imageName),
    desiredEnv,
  );
  const expectedComparable = comparableTemplate(desiredBody);

  if (text(freshEnv.AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB) !== String(actualSizeGb)) {
    await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
      method: "POST",
      body: desiredBody,
    });
    quotaEnvUpdated = true;
  }

  const verifiedState = await readImageState(text(imageEndpoint.id), managementKey);
  const verifiedComparable = comparableTemplate(
    templateBody(
      verifiedState.template,
      text(verifiedState.template.imageName),
      normalizeEnv(verifiedState.template.env),
    ),
  );
  assert.deepStrictEqual(verifiedComparable, expectedComparable, "AVANTIQO_IMAGE_VIDEO_VOLUME_TEMPLATE_VERIFY_FAILED");
  for (const key of Object.keys(beforeComparable)) {
    if (key === "env") continue;
    assert.deepStrictEqual(
      verifiedComparable[key],
      beforeComparable[key],
      `AVANTIQO_IMAGE_VIDEO_VOLUME_UNRELATED_TEMPLATE_FIELD_CHANGED:${key}`,
    );
  }
  if (text(verifiedComparable.env.AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB) !== String(actualSizeGb)) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_QUOTA_ENV_VERIFY_FAILED");
  }
} catch (error) {
  throw new Error(
    `${text(error?.message || error)}:volume_expanded=${volumeExpanded}:quota_env_updated=${quotaEnvUpdated}:safe_fail_closed_default_quota_gb=${MIN_CURRENT_SIZE_GB}`,
  );
}

console.log("AVANTIQO_IMAGE_VIDEO_VOLUME_EXPANSION_COMPLETE=YES");
console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  mutation_performed: volumeExpanded || quotaEnvUpdated,
  volume_expanded: volumeExpanded,
  quota_env_updated: quotaEnvUpdated,
  final_volume_size_gb: finite((await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey)).size),
  generation_submitted: false,
  inference_performed: false,
  model_download_performed: false,
  gpu_job_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  next_action: "SUBMIT_ONE_FAIL_CLOSED_Z_IMAGE_CACHE_JOB",
}, null, 2));