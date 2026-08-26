#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_PREFLIGHT_V1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-music-vocal-correction-worker-image.json";
const IMAGE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKER_IMAGE_RESULT_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const TIMING_CONTRACT = "AVANTIQO_MUSIC_VOCAL_PHRASE_TIMING_V1";
const ENDPOINT_NAME = "avantiqo-music-vocal-correction-v1";
const SAFE_LEASE_POLICY_PATH = "config/avantiqo-runpod-safe-lease-policy.json";
const SAFE_LEASE_POLICY_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2";
const SAFE_LEASE_LANE = "music-vocal-correction";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    endpoint.networkVolumeId ?? endpoint.network_volume_id,
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids),
  ].map(text).filter(Boolean))];
}

function activeWorkerCount(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
    if (status) return !terminal.has(status);
    if (desired) return !terminal.has(desired);
    return true;
  }).length;
}

async function requestJson(url, credential) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function imageEvidence() {
  let report = null;
  try {
    report = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_IMAGE_EVIDENCE_NOT_READY");
    }
    throw error;
  }
  if (
    report?.success !== true ||
    text(report.contract) !== IMAGE_CONTRACT ||
    text(report.engine_contract) !== ENGINE_CONTRACT ||
    text(report.quality_profile) !== QUALITY_PROFILE ||
    text(report.timing_contract) !== TIMING_CONTRACT ||
    report?.source_sha_matches_trigger !== true ||
    text(report.source_sha) !== text(report.trigger_sha) ||
    report?.network_volume_required !== false ||
    report?.runpod_endpoint_mutation_performed !== false ||
    report?.provider_job_submitted !== false ||
    report?.production_certified !== false ||
    report?.human_listening_review_required !== true
  ) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_IMAGE_EVIDENCE_INVALID");
  }
  const immutable = text(report.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(immutable)) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_IMMUTABLE_IMAGE_REQUIRED");
  }
  return { report, immutable };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
const policy = JSON.parse(await readFile(SAFE_LEASE_POLICY_PATH, "utf8"));
if (
  text(policy.contract) !== SAFE_LEASE_POLICY_CONTRACT ||
  policy.workers_min_one_allowed !== false ||
  policy.parallel_work_allowed !== true ||
  text(policy?.lanes?.[SAFE_LEASE_LANE]) !== ENDPOINT_NAME
) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_SAFE_LEASE_POLICY_INVALID");
}

const image = await imageEvidence();
const [endpoints, templates] = await Promise.all([
  requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey),
  requestJson(`${REST_BASE}/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`, managementKey),
]);
const matches = list(endpoints).filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (matches.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
}
const endpoint = matches[0];
const endpointId = text(endpoint.id);
if (!endpointId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_ID_REQUIRED");
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_NOT_PARKED:${finite(endpoint.workersMin)}/${finite(endpoint.workersMax)}`);
}
if (endpointVolumeIds(endpoint).length) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NETWORK_VOLUME_FORBIDDEN");
}
if (activeWorkerCount(endpoint) !== 0) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ACTIVE_WORKER_FORBIDDEN_AT_PREFLIGHT");
}

const templateId = text(endpoint.templateId ?? endpoint.template_id ?? endpoint?.template?.id);
if (!templateId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TEMPLATE_ID_REQUIRED");
const templateMatches = list(templates).filter((template) => text(template?.id) === templateId);
if (templateMatches.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_TEMPLATE_RESOLUTION_FAILED:${templateMatches.length}`);
}
const authoritativeTemplate = templateMatches[0];
const templateImage = text(authoritativeTemplate?.imageName ?? authoritativeTemplate?.image_name);
if (!templateImage || templateImage !== image.immutable) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TEMPLATE_IMAGE_MISMATCH");
}

const health = await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKey);
const jobs = health?.jobs || {};
const workers = health?.workers || {};
const inQueue = finite(jobs.inQueue ?? jobs.in_queue, 0);
const inProgress = finite(jobs.inProgress ?? jobs.in_progress, 0);
const workerTotal = ["idle", "initializing", "ready", "running", "throttled", "unhealthy"]
  .reduce((sum, key) => sum + finite(workers[key], 0), 0);
if (inQueue !== 0 || inProgress !== 0 || workerTotal !== 0) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_NOT_QUIESCENT:queue=${inQueue}:progress=${inProgress}:workers=${workerTotal}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  engine_contract: ENGINE_CONTRACT,
  quality_profile: QUALITY_PROFILE,
  timing_contract: TIMING_CONTRACT,
  endpoint: {
    id: endpointId,
    name: ENDPOINT_NAME,
    template_id: templateId,
    workers_min: 0,
    workers_max: 0,
    active_workers: 0,
    in_queue: 0,
    in_progress: 0,
    network_volume_attached: false,
    template_image: templateImage,
    template_resolution: "AUTHORITATIVE_TEMPLATE_ID_LOOKUP",
    embedded_template_used_for_digest_decision: false,
  },
  immutable_image_reference: image.immutable,
  safe_lease: {
    contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    lane: SAFE_LEASE_LANE,
    required_for_job_submission: true,
  },
  production_certified: false,
  human_listening_review_required: true,
  runpod_endpoint_mutation_performed: false,
  runpod_job_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
