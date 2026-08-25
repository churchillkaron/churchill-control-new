import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const ENDPOINT_NAME = "avantiqo-image-v1";
const EVIDENCE_REVISION = "AVANTIQO_IMAGE_WORKER_IMAGE_V9_Z_IMAGE_DEFAULT_ROUTING_V1";
const EXPECTED_ENTRYPOINT = "handler_v9.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V9_Z_IMAGE_DEFAULT_ROUTING_V1";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V4";
const EXPECTED_CAPACITY_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V3";
const TARGET_MODEL = "Tongyi-MAI/Z-Image";
const EXPECTED_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V3";
const EXPECTED_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V3";
const EXPECTED_COMPILER = "AVANTIQO_IMAGE_Z_IMAGE_QUALITY_COMPILER_V2";
const EXPECTED_ANTITEXT = "AVANTIQO_IMAGE_Z_IMAGE_ANTITEXT_POLICY_V1";
const EXPECTED_DEFAULT_ROUTING = "AVANTIQO_IMAGE_Z_IMAGE_DEFAULT_GENERATION_ROUTING_V1";
const EXPECTED_PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1";
const EXPECTED_QUOTA_GUARD = "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1";
const EXPECTED_PHYSICAL_USAGE = "AVANTIQO_IMAGE_NETWORK_VOLUME_PHYSICAL_USAGE_V1";
const EXPECTED_ALLOCATION_BASIS = "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK";
const POLL_MS = 5000;
const MAX_WAIT_MS = Math.max(60000, Number(process.env.AVANTIQO_IMAGE_V9_PROBE_TIMEOUT_MS || 12 * 60 * 1000));

const text = (value) => String(value ?? "").trim();
const obj = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const num = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 800)}`);
  return body ?? {};
}
async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  }), "AVANTIQO_IMAGE_V9_PROBE_REST");
}
async function queue(endpointId, pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30000),
  }), "AVANTIQO_IMAGE_V9_PROBE_QUEUE");
}
async function queueCredentialWorks(endpointId, key) {
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch { return false; }
}
async function selectQueueCredential(endpointId, managementKey) {
  const candidates = [
    text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) } : null,
    text(process.env.RUNPOD_API_KEY) ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) } : null,
    { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
  ].filter(Boolean);
  for (const candidate of candidates) if (await queueCredentialWorks(endpointId, candidate.key)) return candidate;
  throw new Error("AVANTIQO_IMAGE_V9_PROBE_QUEUE_CREDENTIAL_NOT_FOUND");
}
async function endpointBoundTemplates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_IMAGE_V9_PROBE_TEMPLATE_LIST_INVALID");
  return templates;
}
function healthSummary(value = {}) {
  const jobs = obj(value.jobs);
  const workers = obj(value.workers);
  return {
    jobs: { in_queue: num(jobs.inQueue ?? jobs.in_queue, 0), in_progress: num(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: { running: num(workers.running, 0), unhealthy: num(workers.unhealthy, 0) },
  };
}
async function readEvidence() {
  const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  const checks = [
    evidence?.success === true,
    text(evidence?.contract) === "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4",
    text(evidence?.evidence_revision) === EVIDENCE_REVISION,
    evidence?.source_sha_matches_trigger === true,
    text(evidence?.entrypoint) === EXPECTED_ENTRYPOINT,
    text(evidence?.entrypoint_revision) === EXPECTED_ENTRYPOINT_REVISION,
    text(evidence?.runtime_revision) === EXPECTED_RUNTIME,
    text(evidence?.configured_generation_foundation) === TARGET_MODEL,
    text(evidence?.default_generation_routing_contract) === EXPECTED_DEFAULT_ROUTING,
    evidence?.default_generation_routing_enabled === true,
    evidence?.qwen_replaced_for_generate_default === true,
    text(evidence?.photoreal_candidate_foundation) === TARGET_MODEL,
    text(evidence?.photoreal_candidate_profile) === EXPECTED_PROFILE,
    text(evidence?.photoreal_candidate_policy) === EXPECTED_POLICY,
    text(evidence?.photoreal_quality_compiler_contract) === EXPECTED_COMPILER,
    text(evidence?.photoreal_antitext_policy_contract) === EXPECTED_ANTITEXT,
    Number(evidence?.photoreal_default_inference_steps) === 28,
    Number(evidence?.photoreal_default_guidance_scale) === 4,
    evidence?.photoreal_negative_policy_applied === true,
    evidence?.photoreal_antitext_policy_applied === true,
    evidence?.photoreal_prompt_rewrite_applied === false,
    evidence?.photoreal_compiled_prompt_persisted === false,
    text(evidence?.volume_quota_guard_contract) === EXPECTED_QUOTA_GUARD,
    text(evidence?.physical_usage_contract) === EXPECTED_PHYSICAL_USAGE,
    text(evidence?.allocation_decision_basis) === EXPECTED_ALLOCATION_BASIS,
    evidence?.backing_filesystem_capacity_used_for_decision === false,
    evidence?.automatic_production_routing_enabled === false,
    evidence?.provider_job_submitted === false,
    evidence?.image_generation_submitted === false,
    evidence?.model_download_submitted === false,
    evidence?.production_web_deploy === false,
    evidence?.pricing_activation_performed === false,
  ];
  if (!checks.every(Boolean)) throw new Error("AVANTIQO_IMAGE_V9_PROBE_EVIDENCE_NOT_READY");
  const immutableImage = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) throw new Error("AVANTIQO_IMAGE_V9_PROBE_IMMUTABLE_IMAGE_INVALID");
  return { evidence, immutableImage };
}
function failIfTrue(value, code) { if (value !== false) throw new Error(code); }
function terminalFailure(status) { return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase()); }
async function cancelJob(endpointId, jobId, key) {
  try { await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, key, { method: "POST" }); } catch {}
}
async function waitExistingJob(endpointId, key, jobId, label) {
  const startedAt = Date.now();
  let body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, key);
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    const status = text(body?.status).toUpperCase();
    if (status === "COMPLETED") return { body, jobId, submitted: false, reused: true };
    if (terminalFailure(status)) throw new Error(`AVANTIQO_IMAGE_V9_${label}_REUSED_JOB_FAILED:${status}:${text(body?.error).slice(0, 500)}`);
    console.log(JSON.stringify({ event: "AVANTIQO_IMAGE_V9_PROBE_REUSE_PROGRESS", label, job_id: jobId, status, elapsed_seconds: Math.round((Date.now() - startedAt) / 1000) }));
    await sleep(POLL_MS);
    body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, key);
  }
  throw new Error(`AVANTIQO_IMAGE_V9_${label}_REUSED_JOB_TIMEOUT_NO_NEW_SUBMISSION`);
}
async function runOperation(endpointId, key, input, label) {
  let submitted;
  try { submitted = await queue(endpointId, "/run", key, { method: "POST", body: { input } }); }
  catch (error) { throw new Error(`AVANTIQO_IMAGE_V9_${label}_SUBMIT_RESULT_UNKNOWN_DO_NOT_RETRY:${text(error?.message).slice(0, 500)}`); }
  const jobId = text(submitted?.id);
  if (!jobId) throw new Error(`AVANTIQO_IMAGE_V9_${label}_JOB_ID_MISSING_DO_NOT_RETRY`);
  console.log(`AVANTIQO_IMAGE_V9_${label}_JOB_ID=${jobId}`);
  const startedAt = Date.now();
  let body = submitted;
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    const status = text(body?.status).toUpperCase();
    if (status === "COMPLETED") return { body, jobId, submitted: true, reused: false };
    if (terminalFailure(status)) throw new Error(`AVANTIQO_IMAGE_V9_${label}_FAILED:${status}:${text(body?.error).slice(0, 500)}`);
    await sleep(POLL_MS);
    body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, key);
    console.log(JSON.stringify({ event: "AVANTIQO_IMAGE_V9_PROBE_PROGRESS", label, job_id: jobId, status: text(body?.status).toUpperCase(), elapsed_seconds: Math.round((Date.now() - startedAt) / 1000) }));
  }
  await cancelJob(endpointId, jobId, key);
  throw new Error(`AVANTIQO_IMAGE_V9_${label}_TIMEOUT_CANCELLED`);
}
async function runOrReuseOperation(endpointId, key, input, label, reuseEnv) {
  const reusableId = text(process.env[reuseEnv]);
  if (reusableId) {
    console.log(`AVANTIQO_IMAGE_V9_${label}_REUSE_JOB_ID=${reusableId}`);
    return waitExistingJob(endpointId, key, reusableId, label);
  }
  return runOperation(endpointId, key, input, label);
}
function validateRuntime(body) {
  const output = obj(body?.output);
  if (text(output.status) !== "completed" || text(output.engine_contract) !== ENGINE_CONTRACT || text(output.probe_contract) !== EXPECTED_PROBE_CONTRACT || text(output.operation) !== "runtime_probe") throw new Error("AVANTIQO_IMAGE_V9_RUNTIME_BASE_CONTRACT_INVALID");
  if (text(output.entrypoint) !== EXPECTED_ENTRYPOINT || text(output.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION || text(output.runtime_revision) !== EXPECTED_RUNTIME) throw new Error("AVANTIQO_IMAGE_V9_RUNTIME_REVISION_INVALID");
  if (text(output.configured_generation_foundation) !== TARGET_MODEL || text(output.default_generation_routing_contract) !== EXPECTED_DEFAULT_ROUTING || output.default_generation_routing_enabled !== true || output.automatic_production_routing_enabled !== false) throw new Error("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_INVALID");
  failIfTrue(output.generation_requested, "AVANTIQO_IMAGE_V9_RUNTIME_GENERATION_FORBIDDEN");
  failIfTrue(output.inference_performed, "AVANTIQO_IMAGE_V9_RUNTIME_INFERENCE_FORBIDDEN");
  failIfTrue(output.model_download_performed, "AVANTIQO_IMAGE_V9_RUNTIME_DOWNLOAD_FORBIDDEN");
  failIfTrue(output.storage_mutation_performed, "AVANTIQO_IMAGE_V9_RUNTIME_STORAGE_MUTATION_FORBIDDEN");
  const candidate = obj(output.photoreal_candidate);
  if (text(candidate.foundation_model) !== TARGET_MODEL || text(candidate.quality_profile) !== EXPECTED_PROFILE || text(candidate.quality_policy) !== EXPECTED_POLICY || text(candidate.quality_compiler_contract) !== EXPECTED_COMPILER || text(candidate.antitext_policy_contract) !== EXPECTED_ANTITEXT || candidate.negative_policy_applied !== true || candidate.antitext_policy_applied !== true || candidate.default_generation_foundation !== true || text(candidate.default_generation_routing_contract) !== EXPECTED_DEFAULT_ROUTING || candidate.default_generation_routing_enabled !== true || Number(candidate.default_inference_steps) !== 28 || Number(candidate.default_guidance_scale) !== 4 || candidate.cache_ready !== true) throw new Error("AVANTIQO_IMAGE_V9_RUNTIME_CANDIDATE_INVALID");
  const guard = obj(output.volume_quota_guard);
  if (text(guard.contract) !== EXPECTED_QUOTA_GUARD || text(guard.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE || text(guard.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS || guard.backing_filesystem_capacity_used_for_decision !== false) throw new Error("AVANTIQO_IMAGE_V9_RUNTIME_PHYSICAL_GUARD_INVALID");
  return output;
}
function validateCapacity(body) {
  const output = obj(body?.output);
  const baseValid = text(output.status) === "completed" &&
    text(output.engine_contract) === ENGINE_CONTRACT &&
    text(output.operation) === "inspect_foundation_capacity" &&
    text(output.runtime_revision) === EXPECTED_CAPACITY_RUNTIME &&
    text(output.target_model) === TARGET_MODEL &&
    text(output.candidate_profile) === EXPECTED_PROFILE &&
    output.candidate_cache_ready === true;
  if (!baseValid) {
    console.log(`AVANTIQO_IMAGE_V9_CAPACITY_SAFE_SUMMARY=${JSON.stringify({ runtime_revision: text(output.runtime_revision) || null, target_model: text(output.target_model) || null, candidate_profile: text(output.candidate_profile) || null, candidate_cache_ready: output.candidate_cache_ready === true })}`);
    throw new Error("AVANTIQO_IMAGE_V9_CAPACITY_BASE_CONTRACT_INVALID");
  }
  failIfTrue(output.download_requested, "AVANTIQO_IMAGE_V9_CAPACITY_DOWNLOAD_REQUEST_FORBIDDEN");
  failIfTrue(output.model_download_performed, "AVANTIQO_IMAGE_V9_CAPACITY_DOWNLOAD_FORBIDDEN");
  failIfTrue(output.generation_requested, "AVANTIQO_IMAGE_V9_CAPACITY_GENERATION_FORBIDDEN");
  failIfTrue(output.inference_performed, "AVANTIQO_IMAGE_V9_CAPACITY_INFERENCE_FORBIDDEN");
  failIfTrue(output.storage_mutation_performed, "AVANTIQO_IMAGE_V9_CAPACITY_STORAGE_MUTATION_FORBIDDEN");
  const storage = obj(output.candidate_storage);
  if (text(storage.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE || text(storage.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS || storage.backing_filesystem_capacity_used_for_decision !== false) throw new Error("AVANTIQO_IMAGE_V9_CAPACITY_PHYSICAL_GUARD_INVALID");
  return output;
}

const { evidence, immutableImage } = await readEvidence();
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const endpoints = normalizeList(await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey), ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_IMAGE_V9_PROBE_ENDPOINT_LIST_INVALID");
const matches = endpoints.filter((entry) => text(entry?.id) === endpointId && text(entry?.name) === ENDPOINT_NAME);
if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V9_PROBE_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
const endpoint = matches[0];
if (num(endpoint.workersMin, -1) !== 0 || num(endpoint.workersMax, -1) !== 1) throw new Error("AVANTIQO_IMAGE_V9_PROBE_SCALING_INVALID");
const templates = await endpointBoundTemplates(managementKey);
const templateId = text(endpoint.templateId || endpoint.template?.id);
const templateMatches = templates.filter((entry) => text(entry?.id) === templateId);
if (templateMatches.length !== 1) throw new Error("AVANTIQO_IMAGE_V9_PROBE_TEMPLATE_RESOLUTION_FAILED");
const template = templateMatches[0];
if (text(template.imageName) !== immutableImage || !text(template.name).startsWith("avantiqo-image-immutable-v9-")) throw new Error("AVANTIQO_IMAGE_V9_PROBE_TEMPLATE_NOT_REBOUND");
const credential = await selectQueueCredential(endpointId, managementKey);
const initialHealth = healthSummary(await queue(endpointId, "/health", credential.key));
if (initialHealth.jobs.in_queue !== 0 || initialHealth.jobs.in_progress !== 0 || initialHealth.workers.running !== 0 || initialHealth.workers.unhealthy !== 0) throw new Error("AVANTIQO_IMAGE_V9_PROBE_EXISTING_ACTIVITY_BLOCK");

const runtimeReuseId = text(process.env.AVANTIQO_IMAGE_V9_RUNTIME_JOB_ID);
const capacityReuseId = text(process.env.AVANTIQO_IMAGE_V9_CAPACITY_JOB_ID);
console.log(`AVANTIQO_IMAGE_V9_RUNTIME_PROBE_PROVIDER_JOBS_MAX=${(runtimeReuseId ? 0 : 1) + (capacityReuseId ? 0 : 1)}`);
console.log(`AVANTIQO_IMAGE_V9_RUNTIME_PROBE_REUSE_RUNTIME=${Boolean(runtimeReuseId)}`);
console.log(`AVANTIQO_IMAGE_V9_RUNTIME_PROBE_REUSE_CAPACITY=${Boolean(capacityReuseId)}`);
console.log("AVANTIQO_IMAGE_V9_RUNTIME_PROBE_GENERATION_REQUESTED=false");
console.log("AVANTIQO_IMAGE_V9_RUNTIME_PROBE_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_IMAGE_V9_RUNTIME_PROBE_MODEL_DOWNLOAD_PERFORMED=false");
console.log("AVANTIQO_IMAGE_V9_RUNTIME_PROBE_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_V9_RUNTIME_PROBE_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_V9_RUNTIME_PROBE_PRODUCTION_DEPLOY=false");
console.log(`AVANTIQO_IMAGE_V9_RUNTIME_PROBE_QUEUE_CREDENTIAL_SOURCE=${credential.source}`);

const runtimeRun = await runOrReuseOperation(endpointId, credential.key, { contract: ENGINE_CONTRACT, operation: "runtime_probe" }, "RUNTIME", "AVANTIQO_IMAGE_V9_RUNTIME_JOB_ID");
const runtime = validateRuntime(runtimeRun.body);
const capacityRun = await runOrReuseOperation(endpointId, credential.key, { contract: ENGINE_CONTRACT, operation: "inspect_foundation_capacity", target_model: TARGET_MODEL }, "CAPACITY", "AVANTIQO_IMAGE_V9_CAPACITY_JOB_ID");
const capacity = validateCapacity(capacityRun.body);
const finalHealth = healthSummary(await queue(endpointId, "/health", credential.key));
const submittedThisRun = Number(runtimeRun.submitted) + Number(capacityRun.submitted);
console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_IMAGE_V9_RUNTIME_CERTIFICATION_PROBE_V1",
  endpoint: { id: endpointId, name: ENDPOINT_NAME, template_id: templateId, template_name: text(template.name), immutable_image: immutableImage },
  source_evidence: { source_sha: text(evidence.source_sha), evidence_revision: EVIDENCE_REVISION, runtime_revision: EXPECTED_RUNTIME, inherited_capacity_runtime_revision: EXPECTED_CAPACITY_RUNTIME },
  runtime_probe: runtime,
  foundation_capacity: capacity,
  provider_jobs_submitted: submittedThisRun,
  provider_jobs_reused: 2 - submittedThisRun,
  reused_job_ids: { runtime: runtimeRun.reused ? runtimeRun.jobId : null, capacity: capacityRun.reused ? capacityRun.jobId : null },
  image_generation_submitted: false,
  inference_performed: false,
  model_download_submitted: false,
  storage_mutation_performed: false,
  endpoint_mutation_performed: false,
  production_web_deploy: false,
  secrets_in_output: false,
  final_health: finalHealth,
  next_action: "RUN_ONE_CONTROLLED_V9_DEFAULT_ROUTING_GENERATION",
}, null, 2));
console.log("AVANTIQO_IMAGE_V9_RUNTIME_CERTIFICATION_PROBE=PASS");
