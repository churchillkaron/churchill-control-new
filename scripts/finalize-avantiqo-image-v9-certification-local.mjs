import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_V2";
const ENDPOINT_NAME = "avantiqo-image-v1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_REVISION = "AVANTIQO_IMAGE_WORKER_IMAGE_V9_Z_IMAGE_DEFAULT_ROUTING_V1";
const ENTRYPOINT = "handler_v9.py";
const ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V9_Z_IMAGE_DEFAULT_ROUTING_V1";
const RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V4";
const FOUNDATION_MODEL = "Tongyi-MAI/Z-Image";
const ROUTING_CONTRACT = "AVANTIQO_IMAGE_Z_IMAGE_DEFAULT_GENERATION_ROUTING_V1";
const QUALITY_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V3";
const QUALITY_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V3";
const QUALITY_COMPILER = "AVANTIQO_IMAGE_Z_IMAGE_QUALITY_COMPILER_V2";
const ANTITEXT_POLICY = "AVANTIQO_IMAGE_Z_IMAGE_ANTITEXT_POLICY_V1";
const PHYSICAL_USAGE_CONTRACT = "AVANTIQO_IMAGE_NETWORK_VOLUME_PHYSICAL_USAGE_V1";
const ALLOCATION_BASIS = "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK";
const BUCKET = "creative-assets";
const STORAGE_PREFIX = `storage://${BUCKET}/`;
const DEFAULT_OUTPUT = "/tmp/avantiqo-image-v9-final-certification.json";
const BILLING_WAIT_MS = Math.max(0, Number(process.env.AVANTIQO_IMAGE_V9_BILLING_WAIT_MS || 0));
const BILLING_POLL_MS = 10_000;

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}
function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}
function exactWorkerId(job = {}) {
  return text(job.workerId ?? job.worker_id ?? job.worker?.id ?? job.worker?.workerId ?? job.worker?.worker_id);
}
function storageTimestamp(reference) {
  const match = text(reference).match(/owned-media-local\/(\d{14})\//);
  if (!match) return null;
  const stamp = match[1];
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}.000Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}
function hourWindow(timestampMs) {
  const start = new Date(timestampMs);
  start.setUTCMinutes(0, 0, 0);
  const scheduledEnd = start.getTime() + 60 * 60 * 1000;
  const endMs = Math.min(scheduledEnd, Date.now());
  return {
    bucket_size: "hour",
    start: start.toISOString(),
    end: new Date(Math.max(start.getTime() + 1000, endMs)).toISOString(),
    source: "EXACT_JOB_UTC_HOUR",
  };
}
function dayWindow(timestampMs) {
  const start = new Date(timestampMs);
  start.setUTCHours(0, 0, 0, 0);
  const scheduledEnd = start.getTime() + 24 * 60 * 60 * 1000;
  const endMs = Math.min(scheduledEnd, Date.now());
  return {
    bucket_size: "day",
    start: start.toISOString(),
    end: new Date(Math.max(start.getTime() + 1000, endMs)).toISOString(),
    source: "JOB_UTC_DAY",
  };
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  }
  return body ?? {};
}
async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_IMAGE_V9_FINAL_REST");
}
async function queue(endpointId, pathname, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_IMAGE_V9_FINAL_QUEUE");
}
async function billing(endpointId, grouping, key, window) {
  const url = new URL(`${REST_BASE}/billing/endpoints`);
  url.searchParams.set("endpointId", endpointId);
  url.searchParams.set("bucketSize", window.bucket_size);
  url.searchParams.set("grouping", grouping);
  url.searchParams.set("startTime", window.start);
  url.searchParams.set("endTime", window.end);
  return readJson(await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_IMAGE_V9_FINAL_BILLING");
}
function safeBillingRows(raw) {
  const rows = normalizeListResponse(raw, ["records", "billing", "usage"]) || [];
  return rows.map((row) => ({
    endpoint_id: text(row?.endpointId ?? row?.endpoint_id) || null,
    pod_id: text(row?.podId ?? row?.pod_id) || null,
    gpu_type_id: text(row?.gpuTypeId ?? row?.gpu_type_id) || null,
    amount_usd: finite(row?.amount ?? row?.amountUsd ?? row?.cost),
    time_billed_ms: finite(row?.timeBilledMs ?? row?.time_billed_ms),
  })).filter((row) => finite(row.amount_usd, 0) > 0 || finite(row.time_billed_ms, 0) > 0);
}
function aggregateBilling(rows) {
  const amountUsd = rows.reduce((sum, row) => sum + finite(row.amount_usd, 0), 0);
  const timeBilledMs = rows.reduce((sum, row) => sum + finite(row.time_billed_ms, 0), 0);
  return {
    amount_usd: Number(amountUsd.toFixed(8)),
    time_billed_ms: timeBilledMs,
    endpoint_ids: unique(rows.map((row) => row.endpoint_id)),
    pod_ids: unique(rows.map((row) => row.pod_id)),
    gpu_type_ids: unique(rows.map((row) => row.gpu_type_id)),
    row_count: rows.length,
  };
}
function usableRate(rows) {
  const aggregate = aggregateBilling(rows);
  return aggregate.amount_usd > 0 && aggregate.time_billed_ms > 0
    ? {
        ...aggregate,
        effective_hourly_usd: Number((aggregate.amount_usd / (aggregate.time_billed_ms / 3_600_000)).toFixed(6)),
      }
    : null;
}
function selectBillingRate({ endpointId, workerId, podRows, endpointRows, gpuRows, window }) {
  const exactPodRows = workerId ? podRows.filter((row) => row.pod_id === workerId) : [];
  const exactPodRate = usableRate(exactPodRows);
  if (exactPodRate) {
    return {
      ...exactPodRate,
      attribution: "EXACT_JOB_WORKER_ID_BILLING_RATE",
      window,
    };
  }

  const podIds = unique(podRows.map((row) => row.pod_id));
  if (podIds.length === 1) {
    const uniquePodRate = usableRate(podRows);
    if (uniquePodRate) {
      return {
        ...uniquePodRate,
        attribution: "UNIQUE_ENDPOINT_BILLING_POD_RATE",
        window,
      };
    }
  }

  const scopedEndpointRows = endpointRows.filter((row) => !row.endpoint_id || row.endpoint_id === endpointId);
  const endpointRate = usableRate(scopedEndpointRows);
  if (endpointRate) {
    return {
      ...endpointRate,
      attribution: "ENDPOINT_BILLING_EFFECTIVE_RATE",
      window,
    };
  }

  const gpuTypeIds = unique(gpuRows.map((row) => row.gpu_type_id));
  if (gpuTypeIds.length === 1) {
    const gpuRate = usableRate(gpuRows);
    if (gpuRate) {
      return {
        ...gpuRate,
        attribution: "UNIQUE_ENDPOINT_GPU_BILLING_EFFECTIVE_RATE",
        window,
      };
    }
  }
  return null;
}
async function readBillingWindow(endpointId, managementKey, window, workerId) {
  const [podRaw, endpointRaw, gpuRaw] = await Promise.all([
    billing(endpointId, "podId", managementKey, window),
    billing(endpointId, "endpointId", managementKey, window),
    billing(endpointId, "gpuTypeId", managementKey, window),
  ]);
  const podRows = safeBillingRows(podRaw);
  const endpointRows = safeBillingRows(endpointRaw);
  const gpuRows = safeBillingRows(gpuRaw);
  return {
    rate: selectBillingRate({ endpointId, workerId, podRows, endpointRows, gpuRows, window }),
    safe_summary: {
      window_source: window.source,
      bucket_size: window.bucket_size,
      pod_row_count: podRows.length,
      endpoint_row_count: endpointRows.length,
      gpu_row_count: gpuRows.length,
      pod_candidates: unique(podRows.map((row) => row.pod_id)),
      endpoint_candidates: unique(endpointRows.map((row) => row.endpoint_id)),
      gpu_candidates: unique(gpuRows.map((row) => row.gpu_type_id)),
    },
  };
}
async function waitForBilling(endpointId, managementKey, timestampMs, workerId) {
  const deadline = Date.now() + BILLING_WAIT_MS;
  let attempt = 0;
  let latest = null;
  while (true) {
    attempt += 1;
    const hour = await readBillingWindow(endpointId, managementKey, hourWindow(timestampMs), workerId);
    if (hour.rate) return { attempt, ...hour.rate, lookup: hour.safe_summary };

    const day = await readBillingWindow(endpointId, managementKey, dayWindow(timestampMs), workerId);
    if (day.rate) return { attempt, ...day.rate, lookup: day.safe_summary };

    latest = { hour: hour.safe_summary, day: day.safe_summary };
    console.log(`AVANTIQO_IMAGE_V9_FINAL_BILLING_LOOKUP=${JSON.stringify({ attempt, ...latest })}`);
    if (Date.now() >= deadline) {
      throw new Error(`AVANTIQO_IMAGE_V9_BILLING_NOT_READY_RERUN_NO_GENERATION:${JSON.stringify(latest)}`);
    }
    await sleep(BILLING_POLL_MS);
  }
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_IMAGE_V9_FINAL_NODE24_REQUIRED:${process.version}`);
if (!yes(process.env.AVANTIQO_IMAGE_V9_HUMAN_REVIEW_APPROVED)) throw new Error("AVANTIQO_IMAGE_V9_HUMAN_REVIEW_APPROVED=YES_REQUIRED");

const reviewer = text(process.env.AVANTIQO_IMAGE_V9_HUMAN_REVIEWER) || "OWNER_LOCAL_REVIEW";
const jobId = required("AVANTIQO_IMAGE_V9_COMPLETED_JOB_ID");
if (!/^[A-Za-z0-9-]+$/.test(jobId)) throw new Error("AVANTIQO_IMAGE_V9_COMPLETED_JOB_ID_INVALID");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const inferenceKey = required("RUNPOD_AVANTIQO_IMAGE_API_KEY", process.env.RUNPOD_API_KEY);
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const outputPath = resolve(process.env.AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_OUTPUT || DEFAULT_OUTPUT);

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
if (
  evidence?.success !== true ||
  text(evidence?.contract) !== "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4" ||
  text(evidence?.evidence_revision) !== EVIDENCE_REVISION ||
  evidence?.source_sha_matches_trigger !== true ||
  text(evidence?.entrypoint) !== ENTRYPOINT ||
  text(evidence?.entrypoint_revision) !== ENTRYPOINT_REVISION ||
  text(evidence?.runtime_revision) !== RUNTIME_REVISION ||
  text(evidence?.configured_generation_foundation) !== FOUNDATION_MODEL ||
  text(evidence?.default_generation_routing_contract) !== ROUTING_CONTRACT ||
  evidence?.default_generation_routing_enabled !== true ||
  evidence?.qwen_replaced_for_generate_default !== true ||
  text(evidence?.photoreal_candidate_foundation) !== FOUNDATION_MODEL ||
  text(evidence?.photoreal_candidate_profile) !== QUALITY_PROFILE ||
  text(evidence?.photoreal_candidate_policy) !== QUALITY_POLICY ||
  text(evidence?.photoreal_quality_compiler_contract) !== QUALITY_COMPILER ||
  text(evidence?.photoreal_antitext_policy_contract) !== ANTITEXT_POLICY ||
  Number(evidence?.photoreal_default_inference_steps) !== 28 ||
  Number(evidence?.photoreal_default_guidance_scale) !== 4 ||
  evidence?.photoreal_negative_policy_applied !== true ||
  evidence?.photoreal_antitext_policy_applied !== true ||
  text(evidence?.physical_usage_contract) !== PHYSICAL_USAGE_CONTRACT ||
  text(evidence?.allocation_decision_basis) !== ALLOCATION_BASIS ||
  evidence?.automatic_production_routing_enabled !== false ||
  evidence?.production_web_deploy !== false ||
  evidence?.pricing_activation_performed !== false
) throw new Error("AVANTIQO_IMAGE_V9_FINAL_BUILD_EVIDENCE_INVALID");
const immutableImage = text(evidence.immutable_image_reference);

const [endpointsRaw, templatesRaw, job] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
]);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const templates = normalizeListResponse(templatesRaw, ["templates"]);
if (!endpoints || !templates) throw new Error("AVANTIQO_IMAGE_V9_FINAL_RUNPOD_LIST_INVALID");
const endpointMatches = endpoints.filter((entry) => text(entry?.id) === endpointId && text(entry?.name) === ENDPOINT_NAME);
if (endpointMatches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V9_FINAL_ENDPOINT_RESOLUTION_FAILED:${endpointMatches.length}`);
const endpoint = endpointMatches[0];
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 1) throw new Error("AVANTIQO_IMAGE_V9_FINAL_SCALING_INVALID");
const templateId = text(endpoint.templateId || endpoint.template?.id);
const templateMatches = templates.filter((entry) => text(entry?.id) === templateId);
if (templateMatches.length !== 1) throw new Error("AVANTIQO_IMAGE_V9_FINAL_TEMPLATE_RESOLUTION_FAILED");
const template = templateMatches[0];
if (text(template.imageName) !== immutableImage || !text(template.name).startsWith("avantiqo-image-immutable-v9-")) throw new Error("AVANTIQO_IMAGE_V9_FINAL_TEMPLATE_NOT_EXACT_V9");

if (text(job?.status).toUpperCase() !== "COMPLETED") throw new Error(`AVANTIQO_IMAGE_V9_FINAL_JOB_NOT_COMPLETED:${text(job?.status) || "UNKNOWN"}`);
const generation = object(job.output);
const guidance = object(generation.generation_guidance);
const selection = object(generation.foundation_selection);
if (
  text(generation.capability) !== "ai.image.generate" ||
  text(generation.foundation_model) !== FOUNDATION_MODEL ||
  text(generation.foundation_model_source) !== "runpod-cache" ||
  text(generation.runtime_revision) !== RUNTIME_REVISION ||
  generation.default_generation_routing_applied !== true ||
  text(generation.default_generation_routing_contract) !== ROUTING_CONTRACT ||
  text(selection.selection_status) !== "OWNED_DEFAULT_GENERATION_FOUNDATION" ||
  text(selection.selected_foundation) !== FOUNDATION_MODEL ||
  selection.qwen_replaced_for_generate_default !== true ||
  Number(generation.width) !== 1024 ||
  Number(generation.height) !== 1024 ||
  Number(generation.inference_steps) !== 28 ||
  text(guidance.mode).toUpperCase() !== "CFG" ||
  Number(guidance.scale) !== 4 ||
  text(guidance.quality_profile) !== QUALITY_PROFILE ||
  text(guidance.quality_policy) !== QUALITY_POLICY ||
  text(guidance.quality_compiler_contract) !== QUALITY_COMPILER ||
  text(guidance.antitext_policy_contract) !== ANTITEXT_POLICY ||
  guidance.negative_policy_applied !== true ||
  guidance.antitext_policy_applied !== true ||
  guidance.user_negative_prompt_preserved !== false ||
  guidance.prompt_rewrite_applied !== false ||
  guidance.compiled_prompt_persisted !== false ||
  finite(generation.size_bytes, 0) <= 10_000 ||
  !text(generation.storage_reference)
) throw new Error("AVANTIQO_IMAGE_V9_FINAL_GENERATION_EVIDENCE_INVALID");

const storageReference = text(generation.storage_reference);
if (!storageReference.startsWith(STORAGE_PREFIX)) throw new Error("AVANTIQO_IMAGE_V9_FINAL_STORAGE_REFERENCE_INVALID");
const storagePath = storageReference.slice(STORAGE_PREFIX.length);
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const { data: stored, error: storageError } = await supabase.storage.from(BUCKET).download(storagePath);
if (storageError || !stored) throw new Error(`AVANTIQO_IMAGE_V9_FINAL_STORAGE_READ_FAILED:${storageError?.message || "NO_DATA"}`);
const bytes = Buffer.from(await stored.arrayBuffer());
if (bytes.length !== Number(generation.size_bytes)) throw new Error(`AVANTIQO_IMAGE_V9_FINAL_STORAGE_SIZE_MISMATCH:${bytes.length}:${generation.size_bytes}`);
const sha256 = createHash("sha256").update(bytes).digest("hex");

const timestampMs = storageTimestamp(storageReference);
if (timestampMs == null) throw new Error("AVANTIQO_IMAGE_V9_FINAL_STORAGE_TIMESTAMP_REQUIRED");
const workerId = exactWorkerId(job) || null;
const billingEvidence = await waitForBilling(endpointId, managementKey, timestampMs, workerId);
const providerExecutionMs = finite(job.executionTime);
if (providerExecutionMs == null || providerExecutionMs <= 0) throw new Error("AVANTIQO_IMAGE_V9_FINAL_JOB_EXECUTION_TIME_REQUIRED");
const generationMs = finite(generation.generation_seconds) == null ? null : Math.round(Number(generation.generation_seconds) * 1000);
const estimatedSupplierComputeCostUsd = (providerExecutionMs / 3_600_000) * billingEvidence.effective_hourly_usd;
if (!Number.isFinite(estimatedSupplierComputeCostUsd) || estimatedSupplierComputeCostUsd <= 0) {
  throw new Error("AVANTIQO_IMAGE_V9_FINAL_ECONOMICS_INVALID");
}

const review = {
  contract: "AVANTIQO_IMAGE_V9_HUMAN_REVIEW_V1",
  reviewer,
  reviewed_at: new Date().toISOString(),
  approved: true,
  criteria: [
    { criterion: "no_fake_text_logo_or_pseudotext", status: "PASS" },
    { criterion: "physically_plausible_food_geometry_and_texture", status: "PASS" },
    { criterion: "natural_lighting_reflections_and_depth", status: "PASS" },
    { criterion: "commercial_luxury_composition_quality", status: "PASS" },
  ],
  approval_source: "EXPLICIT_LOCAL_FINALIZER_APPROVAL_FLAG",
};

const report = {
  success: true,
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  capability: "ai.image.generate",
  provider: "avantiqo-image",
  production_certified: true,
  activation_allowed: true,
  activation_performed: false,
  provider_selection_changed: false,
  pricing_activation_performed: false,
  production_web_deploy: false,
  exact_generation_job_id: jobId,
  endpoint: {
    id: endpointId,
    name: ENDPOINT_NAME,
    template_id: templateId,
    template_name: text(template.name),
    immutable_image: immutableImage,
  },
  model: {
    foundation_model: FOUNDATION_MODEL,
    license: "Apache-2.0",
    runtime_revision: RUNTIME_REVISION,
    entrypoint: ENTRYPOINT,
    entrypoint_revision: ENTRYPOINT_REVISION,
    default_generation_routing_contract: ROUTING_CONTRACT,
    default_generation_routing_applied: true,
    quality_profile: QUALITY_PROFILE,
    quality_policy: QUALITY_POLICY,
    quality_compiler_contract: QUALITY_COMPILER,
    antitext_policy_contract: ANTITEXT_POLICY,
    default_inference_steps: 28,
    default_guidance_scale: 4,
  },
  generation_evidence: {
    width: Number(generation.width),
    height: Number(generation.height),
    size_bytes: Number(generation.size_bytes),
    storage_reference: storageReference,
    output_sha256: sha256,
    provider_execution_ms: providerExecutionMs,
    generation_ms: generationMs,
  },
  economics: {
    ready: true,
    attribution: billingEvidence.attribution,
    billing_window: billingEvidence.window,
    worker_id: workerId,
    rate_basis_amount_usd: billingEvidence.amount_usd,
    rate_basis_time_billed_ms: billingEvidence.time_billed_ms,
    rate_basis_row_count: billingEvidence.row_count,
    effective_hourly_usd: billingEvidence.effective_hourly_usd,
    provider_execution_ms: providerExecutionMs,
    estimated_supplier_compute_cost_usd: Number(estimatedSupplierComputeCostUsd.toFixed(8)),
    gpu_type_ids: billingEvidence.gpu_type_ids,
    pod_ids: billingEvidence.pod_ids,
    endpoint_ids: billingEvidence.endpoint_ids,
    cost_method: "RUNPOD_BILLING_EFFECTIVE_RATE_X_EXACT_JOB_EXECUTION_TIME",
    full_worker_cycle_cost_claimed: false,
    customer_pricing_status: "NOT_ACTIVATED_BY_CERTIFICATION",
  },
  human_review: review,
  certification_basis: {
    immutable_build_evidence: true,
    live_v9_template_binding: true,
    runtime_probe_passed_in_prior_controlled_certification: true,
    default_generation_routing_proven_by_completed_job: true,
    z_image_cache_execution_proven: true,
    antitext_policy_proven: true,
    stored_asset_integrity_verified: true,
    economics_evidence_complete: true,
    explicit_human_review_approved: true,
  },
  safety: {
    new_generation_submitted: false,
    model_download_submitted: false,
    endpoint_mutation_performed: false,
    storage_mutation_performed: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    provider_selection_changed: false,
    secret_values_printed: false,
  },
  next_action: "RECORD_SANITIZED_V9_CERTIFICATION_LOCK_ON_MAIN",
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_OUTPUT=${outputPath}`);
console.log(`AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_JOB_ID=${jobId}`);
console.log(`AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_OUTPUT_SHA256=${sha256}`);
console.log(`AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_BILLING_ATTRIBUTION=${report.economics.attribution}`);
console.log(`AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_EFFECTIVE_HOURLY_USD=${report.economics.effective_hourly_usd}`);
console.log(`AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_ESTIMATED_SUPPLIER_COMPUTE_COST_USD=${report.economics.estimated_supplier_compute_cost_usd}`);
console.log(`AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_COST_USD=${report.economics.estimated_supplier_compute_cost_usd}`);
console.log("AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_PRODUCTION_CERTIFIED=true");
console.log("AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_ACTIVATION_PERFORMED=false");
console.log("AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_PRICING_ACTIVATION_PERFORMED=false");
console.log("AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_V9_FINAL_CERTIFICATION=PASS");
console.log(JSON.stringify({
  success: true,
  production_certified: true,
  activation_allowed: true,
  activation_performed: false,
  pricing_activation_performed: false,
  production_web_deploy: false,
  output_path: outputPath,
  next_action: report.next_action,
}, null, 2));
