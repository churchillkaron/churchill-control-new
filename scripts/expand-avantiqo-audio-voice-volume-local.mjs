import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_AUDIO_VOICE_SHARED_VOLUME_EXPANSION_V3";
const TARGET_SIZE_GB = 80;
const CURRENT_MIN_SIZE_GB = 20;
const STORAGE_RATE_USD_PER_GB_MONTH = 0.07;
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const RETIRED_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1-github-retired";
const SHARED_GROUP = sharedVolumeGroup("AUDIO_VOICE");
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-audio-worker-image.json";
const IMAGE_EVIDENCE_CONTRACT = "AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V3";
const EXPECTED_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const EXPECTED_VARIANT = "acestep-v15-xl-turbo";
const EXPECTED_LM_MODEL = "acestep-5Hz-lm-1.7B";
const EXPECTED_LM_BACKEND = "vllm";

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
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}
function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1200)}`);
  }
  return text(result.stdout);
}
function requireCurrentMain() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_AUDIO_VOICE_VOLUME_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_AUDIO_VOICE_VOLUME_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_AUDIO_VOICE_VOLUME_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "AVANTIQO_AUDIO_VOICE_VOLUME_ORIGIN_READ_FAILED");
  if (head !== origin) throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
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
async function rest(path, credential, options = {}) {
  return parseResponse(
    await fetch(`${REST_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    }),
    "RUNPOD_REST",
  );
}
function credentialCandidates(entries, missingCode) {
  const seen = new Set();
  const candidates = entries
    .map(([source, credential]) => ({ source, credential: text(credential) }))
    .filter((entry) => entry.credential)
    .filter((entry) => {
      if (seen.has(entry.credential)) return false;
      seen.add(entry.credential);
      return true;
    });
  if (!candidates.length) throw new Error(missingCode);
  return candidates;
}
function managementCandidates() {
  return credentialCandidates(
    [
      ["DEDICATED_MANAGEMENT", process.env.RUNPOD_MANAGEMENT_API_KEY],
      ["ACCOUNT", process.env.RUNPOD_API_KEY],
    ],
    "RUNPOD_MANAGEMENT_OR_ACCOUNT_API_KEY_REQUIRED",
  );
}
function inferenceCandidates() {
  return credentialCandidates(
    [
      ["AUDIO_DEDICATED", process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY],
      ["ACCOUNT", process.env.RUNPOD_API_KEY],
      ["DEDICATED_MANAGEMENT", process.env.RUNPOD_MANAGEMENT_API_KEY],
    ],
    "RUNPOD_AUDIO_INFERENCE_API_KEY_REQUIRED",
  );
}
async function readWithCandidates(url, candidates, label) {
  const attempts = [];
  for (const candidate of candidates) {
    try {
      const body = await parseResponse(
        await fetch(url, {
          headers: { Authorization: `Bearer ${candidate.credential}`, Accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        }),
        label,
      );
      return {
        body,
        credential_source: candidate.source,
        credential: candidate.credential,
        fallback_used: candidate !== candidates[0],
      };
    } catch (error) {
      attempts.push(`${candidate.source}:${text(error?.message || error)}`);
    }
  }
  throw new Error(`${label}_CREDENTIALS_FAILED:${attempts.join("|")}`);
}
async function queueHealth(endpointId, candidates) {
  return readWithCandidates(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    candidates,
    "RUNPOD_QUEUE_HEALTH",
  );
}
async function controlWorkers(endpointId, candidates) {
  return readWithCandidates(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
    candidates,
    "RUNPOD_CONTROL_WORKERS",
  );
}
async function proveManagementCredential(candidates) {
  const result = await readWithCandidates(
    `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
    candidates,
    "RUNPOD_MANAGEMENT_ENDPOINT_LIST",
  );
  if (!Array.isArray(result.body)) {
    throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_ENDPOINT_LIST_INVALID");
  }
  return result;
}
function activeControlWorkers(body = {}) {
  return list(body?.workers).filter((worker) => {
    const status = text(worker?.status).toUpperCase();
    return !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status);
  });
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function workers(endpoint = {}) {
  return list(endpoint.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    runtime_status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
  }));
}
function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const runtimeWorkers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
    },
    workers: {
      initializing: finite(runtimeWorkers.initializing, 0),
      ready: finite(runtimeWorkers.ready, 0),
      idle: finite(runtimeWorkers.idle, 0),
      running: finite(runtimeWorkers.running, 0),
      throttled: finite(runtimeWorkers.throttled, 0),
      unhealthy: finite(runtimeWorkers.unhealthy, 0),
    },
  };
}
function resolveAudioEndpoint(endpoints, configuredId) {
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId && text(endpoint?.name) === AUDIO_ENDPOINT_NAME)
    : endpoints.filter((endpoint) => text(endpoint?.name) === AUDIO_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_AUDIO_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}
function validateImageEvidence() {
  const evidence = JSON.parse(readFileSync(IMAGE_EVIDENCE_PATH, "utf8"));
  if (
    evidence?.success !== true ||
    text(evidence?.contract) !== IMAGE_EVIDENCE_CONTRACT ||
    text(evidence?.runtime_variant) !== EXPECTED_VARIANT ||
    text(evidence?.quality_profile) !== EXPECTED_PROFILE ||
    evidence?.ace_step_lm_required !== true ||
    text(evidence?.lm_model) !== EXPECTED_LM_MODEL ||
    text(evidence?.lm_backend) !== EXPECTED_LM_BACKEND ||
    evidence?.source_sha_matches_trigger !== true ||
    evidence?.production_web_deploy !== false ||
    evidence?.provider_job_submitted !== false ||
    evidence?.pricing_activation_performed !== false
  ) {
    throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_IMAGE_EVIDENCE_INVALID");
  }
  const repository = text(evidence?.image_repository);
  const sourceSha = text(evidence?.source_sha);
  const sourceTag = text(evidence?.image_tag);
  const digest = text(evidence?.image_digest);
  const digestReference = text(evidence?.immutable_image_reference);
  if (!/^ghcr\.io\/.+/i.test(repository) || !/^[a-f0-9]{40}$/i.test(sourceSha)) {
    throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_IMAGE_IDENTITY_INVALID");
  }
  if (sourceTag !== `${repository}:sha-${sourceSha.slice(0, 12)}`) {
    throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_SOURCE_TAG_INVALID");
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest) || digestReference !== `${repository}@${digest}`) {
    throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_DIGEST_EVIDENCE_INVALID");
  }
  return { sourceTag, digestReference, digest };
}
function allowedVolumeConsumer(name) {
  return SHARED_GROUP.endpoint_names.includes(name) || name === RETIRED_AUDIO_ENDPOINT_NAME;
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_AUDIO_VOICE_VOLUME_EXPANSION_APPROVED)) {
  throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_EXPANSION_APPROVED=YES_REQUIRED");
}
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
const managementCredentialRead = await proveManagementCredential(managementCandidates());
const managementKey = managementCredentialRead.credential;
const managementCredentialSource = managementCredentialRead.credential_source;
const candidates = inferenceCandidates();
const mainSha = requireCurrentMain();
const imageEvidence = validateImageEvidence();

console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_TARGET_GB=${TARGET_SIZE_GB}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_MANAGEMENT_CREDENTIAL_SOURCE=${managementCredentialSource}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_MANAGEMENT_CREDENTIAL_FALLBACK=${managementCredentialRead.fallback_used}`);
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_NEW_VOLUME_CREATED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_MODEL_DOWNLOAD_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_PRICING_ACTIVATION=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_SECRETS_PRINTED=false");

const [endpoints, volumes] = await Promise.all([
  Promise.resolve(managementCredentialRead.body),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) {
  throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_INVENTORY_INVALID");
}
const audioEndpoint = resolveAudioEndpoint(endpoints, configuredEndpointId);
const audioEndpointId = text(audioEndpoint.id);
const templateId = text(audioEndpoint.templateId || audioEndpoint.template?.id);
if (!templateId) throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_AUDIO_TEMPLATE_ID_REQUIRED");
const template = await rest(`/templates/${encodeURIComponent(templateId)}`, managementKey);
if (text(template.imageName) !== imageEvidence.sourceTag) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_AUDIO_IMAGE_MISMATCH:actual=${text(template.imageName) || "MISSING"}`);
}
if (!/^avantiqo-audio-registry-xl-lm-[a-f0-9]{12}$/i.test(text(template.name))) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_REGISTRY_TEMPLATE_REQUIRED:actual=${text(template.name) || "MISSING"}`);
}

const policy = sharedVolumePolicySummary(volumes);
if (!policy.policy_compliant) {
  throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_SHARED_POLICY_NOT_COMPLIANT");
}
const groupVolumes = groupCacheVolumes(volumes, SHARED_GROUP);
if (groupVolumes.length !== 1) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_CANONICAL_COUNT_INVALID:${groupVolumes.length}`);
}
const volume = groupVolumes[0];
const volumeId = text(volume.id);
const volumeName = text(volume.name);
const dataCenterId = text(volume.dataCenterId);
const currentSizeGb = finite(volume.size, 0);
if (!volumeId || volumeName !== SHARED_GROUP.canonical_name || !dataCenterId) {
  throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_CANONICAL_IDENTITY_INVALID");
}
if (currentSizeGb < CURRENT_MIN_SIZE_GB) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_CURRENT_SIZE_INVALID:${currentSizeGb}`);
}
const audioVolumeIds = endpointVolumeIds(audioEndpoint);
if (audioVolumeIds.length !== 1 || audioVolumeIds[0] !== volumeId) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_AUDIO_ATTACHMENT_INVALID:${audioVolumeIds.join("|") || "NONE"}`);
}

const users = endpoints
  .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
  .map((endpoint) => ({
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    workers: workers(endpoint),
  }));
for (const user of users) {
  if (!allowedVolumeConsumer(user.name)) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_UNEXPECTED_ENDPOINT_USER:${user.name || "MISSING"}`);
  }
  if (user.workers_min !== 0) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_MIN_WORKER_BLOCKED:${user.name}:min=${user.workers_min}`);
  }
  const live = user.workers.filter((worker) => worker.desired_status && worker.desired_status !== "EXITED");
  if (live.length) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_LIVE_WORKER_BLOCKED:${user.name}:count=${live.length}`);
  }
}

const [healthRead, controlRead] = await Promise.all([
  queueHealth(audioEndpointId, candidates),
  controlWorkers(audioEndpointId, candidates),
]);
const health = healthCounters(healthRead.body);
const controlLive = activeControlWorkers(controlRead.body);
if (health.jobs.in_queue > 0 || health.jobs.in_progress > 0) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_LIVE_JOBS_BLOCKED:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`);
}
if (health.workers.unhealthy > 0) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_UNHEALTHY_WORKERS_BLOCKED:count=${health.workers.unhealthy}`);
}
if (controlLive.length > 0) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_CONTROL_WORKERS_BLOCKED:count=${controlLive.length}`);
}

const deltaGb = Math.max(0, TARGET_SIZE_GB - currentSizeGb);
const estimatedIncrementalMonthlyUsd = Number((deltaGb * STORAGE_RATE_USD_PER_GB_MONTH).toFixed(2));
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  management_credential_source: managementCredentialSource,
  management_credential_fallback_used: managementCredentialRead.fallback_used,
  cause: "ACE_STEP_XL_LM_DOWNLOAD_DISK_QUOTA_EXCEEDED_AT_30GB",
  canonical_volume: {
    id: volumeId,
    name: volumeName,
    data_center_id: dataCenterId,
    current_size_gb: currentSizeGb,
    target_size_gb: Math.max(currentSizeGb, TARGET_SIZE_GB),
    expansion_gb: deltaGb,
    estimated_incremental_monthly_usd_at_reference_rate: estimatedIncrementalMonthlyUsd,
  },
  audio_endpoint: {
    id: audioEndpointId,
    name: text(audioEndpoint.name),
    template_id: templateId,
    template_name: text(template.name),
    image_name: text(template.imageName),
    source_locked_image_verified: true,
  },
  attached_endpoints: users,
  health,
  health_credential_source: healthRead.credential_source,
  control_credential_source: controlRead.credential_source,
  active_control_worker_count: controlLive.length,
  health_worker_counters_observational_only: true,
  model_contract: {
    quality_profile: EXPECTED_PROFILE,
    variant: EXPECTED_VARIANT,
    lm_model: EXPECTED_LM_MODEL,
    lm_backend: EXPECTED_LM_BACKEND,
  },
  safety: {
    new_volume_created: false,
    endpoint_mutation_performed: false,
    template_mutation_performed: false,
    generation_submitted: false,
    model_download_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_EXPANSION_REQUIRED=${currentSizeGb < TARGET_SIZE_GB ? "true" : "false"}`);
  process.exit(0);
}

if (currentSizeGb < TARGET_SIZE_GB) {
  const freshVolume = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
  if (
    text(freshVolume.id) !== volumeId ||
    text(freshVolume.name) !== volumeName ||
    text(freshVolume.dataCenterId) !== dataCenterId ||
    finite(freshVolume.size, 0) !== currentSizeGb
  ) {
    throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_CONCURRENT_VOLUME_STATE_CHANGED");
  }
  const freshEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
  if (!Array.isArray(freshEndpoints)) throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_FRESH_ENDPOINT_LIST_INVALID");
  const freshAudio = resolveAudioEndpoint(freshEndpoints, audioEndpointId);
  const freshUsers = freshEndpoints
    .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
    .map((endpoint) => ({ name: text(endpoint.name), workers_min: finite(endpoint.workersMin), workers: workers(endpoint) }));
  for (const user of freshUsers) {
    if (!allowedVolumeConsumer(user.name) || user.workers_min !== 0 || user.workers.some((worker) => worker.desired_status && worker.desired_status !== "EXITED")) {
      throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_FRESH_WORKER_STATE_BLOCKED:${user.name || "MISSING"}`);
    }
  }
  if (!endpointVolumeIds(freshAudio).includes(volumeId)) {
    throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_FRESH_AUDIO_ATTACHMENT_CHANGED");
  }
  const [freshHealthRead, freshControlRead] = await Promise.all([
    queueHealth(audioEndpointId, candidates),
    controlWorkers(audioEndpointId, candidates),
  ]);
  const freshHealth = healthCounters(freshHealthRead.body);
  const freshControlLive = activeControlWorkers(freshControlRead.body);
  if (freshHealth.jobs.in_queue > 0 || freshHealth.jobs.in_progress > 0) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_FRESH_LIVE_JOBS_BLOCKED:in_queue=${freshHealth.jobs.in_queue}:in_progress=${freshHealth.jobs.in_progress}`);
  }
  if (freshHealth.workers.unhealthy > 0) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_FRESH_UNHEALTHY_WORKER_BLOCKED:count=${freshHealth.workers.unhealthy}`);
  }
  if (freshControlLive.length > 0) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_FRESH_CONTROL_WORKER_BLOCKED:count=${freshControlLive.length}`);
  }
  await rest(`/networkvolumes/${encodeURIComponent(volumeId)}/update`, managementKey, {
    method: "POST",
    body: { name: volumeName, size: TARGET_SIZE_GB },
  });
}

const verifiedVolume = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
if (
  text(verifiedVolume.id) !== volumeId ||
  text(verifiedVolume.name) !== volumeName ||
  text(verifiedVolume.dataCenterId) !== dataCenterId ||
  finite(verifiedVolume.size, 0) < TARGET_SIZE_GB
) {
  throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_EXPANSION_VERIFY_FAILED");
}
const verifiedEndpoint = await rest(`/endpoints/${encodeURIComponent(audioEndpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (!endpointVolumeIds(verifiedEndpoint).includes(volumeId)) {
  throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_POST_EXPANSION_ATTACHMENT_FAILED");
}
const verifiedTemplate = await rest(`/templates/${encodeURIComponent(templateId)}`, managementKey);
if (text(verifiedTemplate.imageName) !== imageEvidence.sourceTag) {
  throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_POST_EXPANSION_IMAGE_CHANGED");
}

console.log("AVANTIQO_AUDIO_VOICE_VOLUME_EXPANSION=COMPLETE");
console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  mutation_performed: currentSizeGb < TARGET_SIZE_GB,
  volume_expanded: currentSizeGb < TARGET_SIZE_GB,
  final_volume_size_gb: finite(verifiedVolume.size, 0),
  endpoint_attachment_preserved: true,
  source_locked_image_preserved: true,
}, null, 2));
