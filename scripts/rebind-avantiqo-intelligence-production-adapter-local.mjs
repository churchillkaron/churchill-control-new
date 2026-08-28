import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENDPOINT_NAME = "avantiqo-intelligence-v1";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-intelligence-production-adapter-image.json";
const RELEASE_STATE_PATH = "audits/results/avantiqo-intelligence-production-adapter-release-state.json";
const ENV_PATH = ".env.local";
const CONTRACT = "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_RELEASE_BINDER_V2";
const EXPECTED_IMAGE_CONTRACT = "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_RESULT_V1";
const EXPECTED_STARTUP_CONTRACT = "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_STARTUP_V2";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const MODEL_CANDIDATE_SCOPE = "platform_model_candidates";
const PROMOTION_REVIEW_SCOPE = "platform_model_promotion_reviews";
const MEMORY_TABLE = "intelligence_memories";
const TRAINING_ROOT = "/runpod-volume/avantiqo-intelligence-training";
const RELEASE_APPROVAL = "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_RELEASE_APPROVED";
const ROLLBACK_APPROVAL = "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_ROLLBACK_APPROVED";
const LEARNING_ORGANIZATION_NAME = "Avantiqo Platform";
const LEARNING_ORGANIZATION_TYPE = "enterprise_group";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value, fallback = null) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
function normalizeEnv(value) {
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}
function approved(name) {
  if (text(process.env[name], 20).toUpperCase() !== "YES") throw new Error(`${name}_YES_REQUIRED`);
}
function validUuid(value) {
  return UUID_PATTERN.test(text(value, 160));
}
function adapterFingerprint(adapterPath) {
  return createHash("sha256").update(adapterPath).digest("hex").slice(0, 16);
}
function redact(value) {
  return text(value, 2000)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

async function parseLocalEnv() {
  let source = "";
  try { source = await readFile(ENV_PATH, "utf8"); } catch { return {}; }
  const parsed = {};
  for (const rawLine of source.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    parsed[match[1]] = value;
  }
  return parsed;
}
const LOCAL_ENV = await parseLocalEnv();
function runtimeEnv(name) {
  return text(process.env[name], 12000) || text(LOCAL_ENV[name], 12000);
}
function required(name, code = `${name}_REQUIRED`) {
  const value = runtimeEnv(name);
  if (!value) throw new Error(code);
  return value;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
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
    throw new Error(`RUNPOD_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  }
  return body ?? {};
}
const rest = (path, key, options = {}) => requestJson(`${REST_BASE}${path}`, key, options);
const queue = (endpointId, path, key) => requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, key, { timeoutMs: 20_000 });

function rows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) if (Array.isArray(value[key])) return value[key];
  return [];
}
function resolveOne(items, name, code) {
  const matches = rows(items, ["endpoints", "serverlessEndpoints"]).filter((entry) => text(entry?.name, 300) === name);
  if (matches.length !== 1) throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  return matches[0];
}
function activeWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 120).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 120).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
}
function healthSummary(raw = {}) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
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
function requireIdle(endpoint, health, codePrefix) {
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
    throw new Error(`${codePrefix}_RESTING_0_0_REQUIRED`);
  }
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) {
    throw new Error(`${codePrefix}_QUEUE_NOT_DRAINED`);
  }
  if (activeWorkers(endpoint).length || Object.values(health.workers).some((value) => Number(value) !== 0)) {
    throw new Error(`${codePrefix}_WORKERS_NOT_RESTING`);
  }
}
function infrastructureSnapshot(endpoint = {}) {
  return {
    id: text(endpoint?.id, 300),
    name: text(endpoint?.name, 300),
    version: finite(endpoint?.version),
    template_id: text(endpoint?.templateId || endpoint?.template?.id, 300),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value, 300)).filter(Boolean),
    data_center_ids: list(endpoint?.dataCenterIds).map((value) => text(value, 300)).filter(Boolean),
    network_volume_id: text(endpoint?.networkVolumeId, 300) || null,
    network_volume_ids: list(endpoint?.networkVolumeIds).map((value) => text(typeof value === "string" ? value : value?.id || value?.networkVolumeId, 300)).filter(Boolean),
    allowed_cuda_versions: list(endpoint?.allowedCudaVersions).map((value) => text(value, 100)).filter(Boolean),
    min_cuda_version: text(endpoint?.minCudaVersion, 100) || null,
    flashboot: endpoint?.flashboot === true,
  };
}
function sameInfrastructure(before, after) {
  for (const key of ["id", "name", "workers_min", "workers_max", "gpu_count", "network_volume_id", "min_cuda_version", "flashboot"]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) return false;
  }
  for (const key of ["gpu_type_ids", "data_center_ids", "network_volume_ids", "allowed_cuda_versions"]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) return false;
  }
  return true;
}

async function loadImageEvidence() {
  let evidence;
  try { evidence = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8")); }
  catch { throw new Error("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_EVIDENCE_REQUIRED"); }
  if (
    evidence?.success !== true ||
    evidence?.contract !== EXPECTED_IMAGE_CONTRACT ||
    evidence?.startup_contract !== EXPECTED_STARTUP_CONTRACT ||
    evidence?.foundation_model !== FOUNDATION_MODEL ||
    evidence?.adapter_layout !== "MOE_3D_FUSED_PEFT" ||
    evidence?.adapter_serialization !== "PEFT_FUSED_EXPERT_FACTORS_2D" ||
    evidence?.exact_candidate_adapter_inspector_reused !== true ||
    evidence?.adapter_artifact_embedded !== false ||
    evidence?.production_adapter_enabled_by_default !== false ||
    evidence?.explicit_release_binder_required !== true ||
    evidence?.fast_lane_effect !== "NONE" ||
    evidence?.runpod_endpoint_mutated !== false ||
    evidence?.production_model_promoted !== false ||
    evidence?.automatic_production_promotion !== false
  ) throw new Error("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_EVIDENCE_INVALID");
  const repository = text(evidence.image_repository, 1200);
  const sourceSha = text(evidence.source_sha, 80);
  const imageTag = text(evidence.image_tag, 1200);
  const digest = text(evidence.image_digest, 200);
  const immutable = text(evidence.immutable_image_reference, 1400);
  if (!/^ghcr\.io\/.+/i.test(repository)) throw new Error("PRODUCTION_ADAPTER_GHCR_REPOSITORY_REQUIRED");
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("PRODUCTION_ADAPTER_SOURCE_SHA_INVALID");
  if (imageTag !== `${repository}:sha-${sourceSha.slice(0, 12)}`) throw new Error("PRODUCTION_ADAPTER_SOURCE_SHA_TAG_INVALID");
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) throw new Error("PRODUCTION_ADAPTER_DIGEST_INVALID");
  if (immutable !== `${repository}@${digest}`) throw new Error("PRODUCTION_ADAPTER_IMMUTABLE_REFERENCE_INVALID");
  return { ...evidence, repository, sourceSha, imageTag, digest, immutable };
}

function supabase() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
async function resolveLearningOrganization(client) {
  const configuredId = runtimeEnv("AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID");
  if (configuredId) {
    if (!validUuid(configuredId)) throw new Error("AVANTIQO_LEARNING_ORGANIZATION_ENV_ID_INVALID");
    return { organizationId: configuredId, source: "ENVIRONMENT_OVERRIDE" };
  }
  const result = await client.from("organizations")
    .select("id,name,organization_type,status,organization_status")
    .eq("name", LEARNING_ORGANIZATION_NAME)
    .eq("organization_type", LEARNING_ORGANIZATION_TYPE)
    .eq("status", "active")
    .eq("organization_status", "ACTIVE")
    .limit(3);
  if (result.error) throw result.error;
  const matches = list(result.data);
  if (matches.length === 0) throw new Error("AVANTIQO_LEARNING_ORGANIZATION_CANONICAL_RECORD_NOT_FOUND");
  if (matches.length !== 1) throw new Error(`AVANTIQO_LEARNING_ORGANIZATION_CANONICAL_RECORD_AMBIGUOUS:${matches.length}`);
  const organizationId = text(matches[0]?.id, 160);
  if (!validUuid(organizationId)) throw new Error("AVANTIQO_LEARNING_ORGANIZATION_CANONICAL_ID_INVALID");
  return { organizationId, source: "CANONICAL_DATABASE_RECORD" };
}
async function loadGovernance(client, organizationId, candidateId) {
  const candidateResult = await client.from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId).eq("memory_scope", MODEL_CANDIDATE_SCOPE)
    .eq("id", candidateId).eq("active", true).maybeSingle();
  if (candidateResult.error) throw candidateResult.error;
  if (!candidateResult.data) throw new Error("PRODUCTION_ADAPTER_MODEL_CANDIDATE_NOT_FOUND");

  const reviewResult = await client.from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId).eq("memory_scope", PROMOTION_REVIEW_SCOPE)
    .eq("subject", candidateId).eq("active", true).order("updated_at", { ascending: false }).limit(2);
  if (reviewResult.error) throw reviewResult.error;
  const reviews = list(reviewResult.data);
  if (reviews.length !== 1) throw new Error(`PRODUCTION_ADAPTER_PROMOTION_REVIEW_RESOLUTION_FAILED:matches=${reviews.length}`);
  return { candidate: candidateResult.data, review: reviews[0] };
}
async function resolveGovernedSelection(client, organizationId, operation) {
  const configuredCandidateId = runtimeEnv("AVANTIQO_INTELLIGENCE_PRODUCTION_MODEL_CANDIDATE_ID");
  const configuredAdapterPath = runtimeEnv("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_PATH");
  if (configuredCandidateId) {
    const governance = await loadGovernance(client, organizationId, configuredCandidateId);
    const reviewMetadata = object(governance.review?.metadata);
    const governedAdapterPath = text(reviewMetadata.adapter_artifact_reference, 1200);
    if (!governedAdapterPath) throw new Error("PRODUCTION_ADAPTER_GOVERNED_ADAPTER_PATH_REQUIRED");
    if (configuredAdapterPath && configuredAdapterPath !== governedAdapterPath) {
      throw new Error("PRODUCTION_ADAPTER_CONFIGURED_ADAPTER_PATH_MISMATCH");
    }
    return {
      candidateId: configuredCandidateId,
      adapterPath: governedAdapterPath,
      governance,
      source: configuredAdapterPath ? "ENVIRONMENT_CANDIDATE_AND_PATH_CROSSCHECKED" : "ENVIRONMENT_CANDIDATE_GOVERNED_PATH",
    };
  }

  const targetStatus = operation === "RELEASE" ? "CANARY_CERTIFIED_RELEASE_PENDING" : "PRODUCTION_RELEASED";
  const result = await client.from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", PROMOTION_REVIEW_SCOPE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (result.error) throw result.error;
  const matches = list(result.data).filter((row) => {
    const metadata = object(row?.metadata);
    if (metadata.contract !== "AVANTIQO_MODEL_PROMOTION_V1") return false;
    if (metadata.status !== targetStatus) return false;
    if (text(row?.subject, 200) !== text(metadata.model_candidate_id, 200)) return false;
    if (operation === "RELEASE") {
      return metadata.release_ready === true &&
        metadata.explicit_production_release_required === true &&
        metadata.production_release_authorized === false &&
        metadata.production_model_promoted === false;
    }
    return metadata.production_model_promoted === true;
  });
  if (matches.length !== 1) {
    throw new Error(`PRODUCTION_ADAPTER_GOVERNED_REVIEW_RESOLUTION_FAILED:operation=${operation}:status=${targetStatus}:matches=${matches.length}`);
  }
  const review = matches[0];
  const reviewMetadata = object(review.metadata);
  const candidateId = text(review.subject, 200);
  const governedAdapterPath = text(reviewMetadata.adapter_artifact_reference, 1200);
  if (!candidateId) throw new Error("PRODUCTION_ADAPTER_GOVERNED_CANDIDATE_ID_REQUIRED");
  if (!governedAdapterPath) throw new Error("PRODUCTION_ADAPTER_GOVERNED_ADAPTER_PATH_REQUIRED");
  if (configuredAdapterPath && configuredAdapterPath !== governedAdapterPath) {
    throw new Error("PRODUCTION_ADAPTER_CONFIGURED_ADAPTER_PATH_MISMATCH");
  }
  const governance = await loadGovernance(client, organizationId, candidateId);
  if (text(governance.review?.id, 200) !== text(review?.id, 200)) {
    throw new Error("PRODUCTION_ADAPTER_GOVERNED_REVIEW_ID_MISMATCH");
  }
  return {
    candidateId,
    adapterPath: governedAdapterPath,
    governance,
    source: configuredAdapterPath ? "UNIQUE_GOVERNED_REVIEW_PATH_CROSSCHECKED" : "UNIQUE_GOVERNED_REVIEW",
  };
}
function validateGovernance({ candidate, review, candidateId, adapterPath, fingerprint, operation }) {
  const candidateMetadata = object(candidate?.metadata);
  const reviewMetadata = object(review?.metadata);
  const canary = object(reviewMetadata.canary);
  const certification = object(canary.certification);
  if (candidate?.id !== candidateId) throw new Error("PRODUCTION_ADAPTER_CANDIDATE_ID_BINDING_INVALID");
  if (text(candidateMetadata.candidate_id, 240) !== text(candidate?.subject, 240)) throw new Error("PRODUCTION_ADAPTER_CANDIDATE_SUBJECT_BINDING_INVALID");
  if (candidateMetadata.contract !== "AVANTIQO_MODEL_IMPROVEMENT_V1") throw new Error("PRODUCTION_ADAPTER_CANDIDATE_CONTRACT_INVALID");
  if (text(candidateMetadata.adapter_artifact_reference, 1200) !== adapterPath) throw new Error("PRODUCTION_ADAPTER_CANDIDATE_ARTIFACT_MISMATCH");
  if (text(review?.subject, 200) !== candidateId) throw new Error("PRODUCTION_ADAPTER_REVIEW_CANDIDATE_MISMATCH");
  if (reviewMetadata.contract !== "AVANTIQO_MODEL_PROMOTION_V1") throw new Error("PRODUCTION_ADAPTER_REVIEW_CONTRACT_INVALID");
  if (text(reviewMetadata.model_candidate_id, 200) !== candidateId) throw new Error("PRODUCTION_ADAPTER_REVIEW_MODEL_CANDIDATE_BINDING_INVALID");
  if (text(reviewMetadata.adapter_artifact_reference, 1200) !== adapterPath) throw new Error("PRODUCTION_ADAPTER_REVIEW_ARTIFACT_MISMATCH");
  if (operation === "RELEASE") {
    if (candidateMetadata.status !== "PROMOTION_REVIEW_ELIGIBLE" || candidateMetadata.production_model_promoted !== false) throw new Error("PRODUCTION_ADAPTER_CANDIDATE_NOT_RELEASE_ELIGIBLE");
    if (reviewMetadata.status !== "CANARY_CERTIFIED_RELEASE_PENDING" || reviewMetadata.release_ready !== true || reviewMetadata.explicit_production_release_required !== true || reviewMetadata.production_release_authorized !== false || reviewMetadata.production_model_promoted !== false) throw new Error("PRODUCTION_ADAPTER_REVIEW_NOT_RELEASE_PENDING");
    if (certification.endpoint_candidate_id_binding_verified !== true || certification.exact_adapter_artifact_binding_verified !== true || certification.structured_output_ok !== true || certification.native_tool_call_ok !== true) throw new Error("PRODUCTION_ADAPTER_CANARY_CERTIFICATION_INVALID");
  } else {
    if (reviewMetadata.status !== "PRODUCTION_RELEASED" || reviewMetadata.production_model_promoted !== true) throw new Error("PRODUCTION_ADAPTER_REVIEW_NOT_ROLLBACK_ELIGIBLE");
    const release = object(reviewMetadata.production_release);
    if (!release.previous_template_id || !release.target_template_id || release.adapter_artifact_reference !== adapterPath || release.adapter_artifact_fingerprint !== fingerprint) throw new Error("PRODUCTION_ADAPTER_ROLLBACK_PROVENANCE_INVALID");
  }
  return { candidateMetadata, reviewMetadata };
}

async function endpointBoundTemplates(key) {
  return rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
}
function resolveTemplate(endpoint, templates) {
  const inline = object(endpoint?.template);
  const id = text(endpoint?.templateId || inline.id, 300);
  if (!id) throw new Error("PRODUCTION_ADAPTER_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length && text(inline?.imageName, 1200)) return { id, ...inline };
  const matches = rows(templates, ["templates"]).filter((template) => text(template?.id, 300) === id);
  if (matches.length !== 1) throw new Error(`PRODUCTION_ADAPTER_TEMPLATE_RESOLUTION_FAILED:id=${id}:matches=${matches.length}`);
  return matches[0];
}
function resolveRegistryAuth(registryAuths, baseTemplate) {
  const rowsValue = rows(registryAuths, ["containerRegistryAuths", "registryAuths"]);
  const explicit = runtimeEnv("AVANTIQO_INTELLIGENCE_RUNPOD_REGISTRY_AUTH_ID");
  if (explicit) {
    const matches = rowsValue.filter((item) => text(item?.id, 300) === explicit);
    if (matches.length !== 1) throw new Error(`PRODUCTION_ADAPTER_REGISTRY_AUTH_NOT_FOUND:matches=${matches.length}`);
    return matches[0];
  }
  const currentId = text(baseTemplate?.containerRegistryAuthId, 300);
  const current = rowsValue.find((item) => text(item?.id, 300) === currentId);
  if (current && /ghcr|github/i.test(text(current?.name, 300))) return current;
  const matches = rowsValue.filter((item) => /ghcr|github/i.test(text(item?.name, 300)));
  if (matches.length !== 1) throw new Error(`PRODUCTION_ADAPTER_GHCR_AUTH_RESOLUTION_FAILED:matches=${matches.length}`);
  return matches[0];
}
function desiredTemplateEnv(baseTemplate, { candidateId, adapterPath, fingerprint }) {
  const env = normalizeEnv(baseTemplate?.env);
  for (const key of [
    "AVANTIQO_INTELLIGENCE_CANDIDATE_ENABLED",
    "AVANTIQO_INTELLIGENCE_CANDIDATE_ADAPTER_PATH",
    "AVANTIQO_INTELLIGENCE_CANDIDATE_MODEL_CANDIDATE_ID",
  ]) delete env[key];
  return {
    ...env,
    AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_ENABLED: "true",
    AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_PATH: adapterPath,
    AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_FINGERPRINT: fingerprint,
    AVANTIQO_INTELLIGENCE_PRODUCTION_MODEL_CANDIDATE_ID: candidateId,
    AVANTIQO_INTELLIGENCE_MODEL: FOUNDATION_MODEL,
  };
}
function templateIssues(template, evidence, desiredEnv, registryAuthId, templateName) {
  const issues = [];
  const env = normalizeEnv(template?.env);
  if (text(template?.name, 500) !== templateName) issues.push("name");
  if (text(template?.imageName, 1400) !== evidence.imageTag) issues.push("image_name");
  if (template?.isServerless !== true) issues.push("serverless");
  if (text(template?.containerRegistryAuthId, 300) !== registryAuthId) issues.push("registry_auth");
  if (list(template?.dockerEntrypoint).length !== 0) issues.push("docker_entrypoint_override");
  if (list(template?.dockerStartCmd).length !== 0) issues.push("docker_start_cmd_override");
  for (const [key, value] of Object.entries(desiredEnv)) if (env[key] !== value) issues.push(`env:${key}`);
  return issues;
}
function templateBody(baseTemplate, evidence, env, registryAuthId, templateName) {
  return {
    containerDiskInGb: Math.max(5, finite(baseTemplate?.containerDiskInGb, 0)),
    containerRegistryAuthId: registryAuthId,
    dockerEntrypoint: [],
    dockerStartCmd: [],
    env,
    imageName: evidence.imageTag,
    isPublic: false,
    name: templateName,
    ports: list(baseTemplate?.ports),
    readme: `Avantiqo governed production Deep adapter release. Source-SHA image tag is bound to immutable digest ${evidence.digest}; image-owned ENTRYPOINT is mandatory; adapter bytes remain on governed Intelligence training storage and are re-inspected at worker startup.`,
    volumeInGb: finite(baseTemplate?.volumeInGb, 0),
    volumeMountPath: text(baseTemplate?.volumeMountPath, 800) || "/runpod-volume",
  };
}
async function persistLocalState(value) {
  await mkdir("audits/results", { recursive: true });
  await writeFile(RELEASE_STATE_PATH, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
async function updateReview(client, review, metadata, content) {
  const result = await client.from(MEMORY_TABLE).update({ metadata, content, updated_at: new Date().toISOString() }).eq("id", review.id).select("id,metadata,updated_at").single();
  if (result.error) throw result.error;
  return result.data;
}
async function updateCandidate(client, candidate, metadata, content) {
  const result = await client.from(MEMORY_TABLE).update({ metadata, content, updated_at: new Date().toISOString() }).eq("id", candidate.id).select("id,metadata,updated_at").single();
  if (result.error) throw result.error;
  return result.data;
}

const apply = process.argv.includes("--apply");
const rollback = process.argv.includes("--rollback");
const operation = rollback ? "ROLLBACK" : "RELEASE";
if (apply) approved(rollback ? ROLLBACK_APPROVAL : RELEASE_APPROVAL);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", "RUNPOD_MANAGEMENT_API_KEY_REQUIRED_FOR_PRODUCTION_ADAPTER_RELEASE");
const runtimeKey = runtimeEnv("RUNPOD_API_KEY") || managementKey;
const db = supabase();
const learningOrganization = await resolveLearningOrganization(db);
const selection = await resolveGovernedSelection(db, learningOrganization.organizationId, operation);
const candidateId = selection.candidateId;
const adapterPath = selection.adapterPath;
if (!adapterPath.startsWith(`${TRAINING_ROOT}/`) || !adapterPath.endsWith("/adapter")) throw new Error("PRODUCTION_ADAPTER_PATH_GOVERNANCE_INVALID");
const fingerprint = adapterFingerprint(adapterPath);
const configuredFingerprint = runtimeEnv("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_FINGERPRINT");
if (configuredFingerprint && configuredFingerprint.toLowerCase() !== fingerprint) throw new Error("PRODUCTION_ADAPTER_CONFIGURED_FINGERPRINT_MISMATCH");
const evidence = await loadImageEvidence();
const governance = selection.governance;
const validated = validateGovernance({ ...governance, candidateId, adapterPath, fingerprint, operation });

const configuredEndpointId = required("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID");
const [endpointBody, templatesBody, registryAuths, deepHealthRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
  rest("/containerregistryauth", managementKey),
  queue(configuredEndpointId, "/health", runtimeKey),
]);
const deep = resolveOne(endpointBody, ENDPOINT_NAME, "PRODUCTION_ADAPTER_DEEP_ENDPOINT_RESOLUTION_FAILED");
if (text(deep?.id, 300) !== configuredEndpointId) throw new Error("PRODUCTION_ADAPTER_DEEP_ENDPOINT_ID_MISMATCH");
const fast = resolveOne(endpointBody, FAST_ENDPOINT_NAME, "PRODUCTION_ADAPTER_FAST_ENDPOINT_RESOLUTION_FAILED");
const deepHealth = healthSummary(deepHealthRaw);
requireIdle(deep, deepHealth, "PRODUCTION_ADAPTER_DEEP");
const deepBefore = infrastructureSnapshot(deep);
const fastBefore = infrastructureSnapshot(fast);
const currentTemplate = resolveTemplate(deep, templatesBody);

let targetTemplate = null;
let targetTemplateName = null;
let targetTemplateIssues = [];
let previousTemplateId = null;
if (operation === "RELEASE") {
  const registryAuth = resolveRegistryAuth(registryAuths, currentTemplate);
  const registryAuthId = text(registryAuth?.id, 300);
  const desiredEnv = desiredTemplateEnv(currentTemplate, { candidateId, adapterPath, fingerprint });
  const digestSuffix = evidence.digest.slice("sha256:".length, "sha256:".length + 12);
  targetTemplateName = `avantiqo-intelligence-prod-adapter-${digestSuffix}-${fingerprint}`;
  const named = rows(templatesBody, ["templates"]).filter((template) => text(template?.name, 500) === targetTemplateName);
  if (named.length > 1) throw new Error(`PRODUCTION_ADAPTER_TARGET_TEMPLATE_AMBIGUOUS:matches=${named.length}`);
  targetTemplate = named[0] || null;
  if (targetTemplate) {
    targetTemplateIssues = templateIssues(targetTemplate, evidence, desiredEnv, registryAuthId, targetTemplateName);
    if (targetTemplateIssues.length) throw new Error(`PRODUCTION_ADAPTER_IMMUTABLE_TARGET_TEMPLATE_MISMATCH:${targetTemplateIssues.join("|")}`);
  }
  previousTemplateId = text(deep?.templateId || currentTemplate?.id, 300);
  if (!previousTemplateId) throw new Error("PRODUCTION_ADAPTER_PREVIOUS_TEMPLATE_ID_REQUIRED");

  const plan = {
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    operation,
    learning_organization: { id: learningOrganization.organizationId, source: learningOrganization.source },
    selection: { source: selection.source, candidate_env_required: false, adapter_path_env_required: false },
    candidate_id: candidateId,
    adapter_artifact_reference: adapterPath,
    adapter_artifact_fingerprint: fingerprint,
    image: { source_sha: evidence.sourceSha, image_tag: evidence.imageTag, immutable_image_reference: evidence.immutable, digest: evidence.digest },
    deep: { before: deepBefore, health: deepHealth, current_template_id: previousTemplateId, current_template_name: text(currentTemplate?.name, 500) || null },
    fast: { before: fastBefore, mutation_allowed: false },
    target: {
      template_name: targetTemplateName,
      existing_template_found: Boolean(targetTemplate),
      existing_template_contract_issues: targetTemplateIssues,
      image_owned_entrypoint_required: true,
      docker_entrypoint: [],
      docker_start_cmd: [],
    },
    governance: {
      canary_certified_release_pending: true,
      explicit_release_approval_required: true,
      automatic_production_promotion: false,
      startup_reinspection_required: true,
      rollback_provenance_required_before_endpoint_patch: true,
      canonical_learning_organization_resolution: true,
      governed_candidate_selection: true,
    },
    safety: { generation_submitted: false, inference_performed: false, training_started: false, wallet_operation_performed: false, web_deploy_performed: false, fast_lane_effect: "NONE", endpoint_id_preserved: true, gpu_pool_preserved: true, network_volume_preserved: true, workers_min_max_preserved: true, existing_template_deleted: false, secrets_printed: false },
  };
  console.log(JSON.stringify(plan, null, 2));
  if (!apply) process.exit(0);

  if (!targetTemplate) {
    const body = templateBody(currentTemplate, evidence, desiredEnv, registryAuthId, targetTemplateName);
    const created = await rest("/templates", managementKey, { method: "POST", body: { ...body, category: "NVIDIA", isServerless: true } });
    const id = text(created?.id, 300);
    if (!id) throw new Error("PRODUCTION_ADAPTER_TARGET_TEMPLATE_CREATE_ID_REQUIRED");
    targetTemplate = await rest(`/templates/${encodeURIComponent(id)}`, managementKey);
    const issues = templateIssues(targetTemplate, evidence, desiredEnv, registryAuthId, targetTemplateName);
    if (issues.length) throw new Error(`PRODUCTION_ADAPTER_CREATED_TEMPLATE_CONTRACT_INVALID:${issues.join("|")}`);
  }
  const targetTemplateId = text(targetTemplate?.id, 300);
  const now = new Date().toISOString();
  const releaseProvenance = {
    contract: CONTRACT,
    state: "APPLYING",
    learning_organization_id: learningOrganization.organizationId,
    candidate_id: candidateId,
    adapter_artifact_reference: adapterPath,
    adapter_artifact_fingerprint: fingerprint,
    image_source_sha: evidence.sourceSha,
    image_digest: evidence.digest,
    immutable_image_reference: evidence.immutable,
    image_owned_entrypoint: true,
    previous_template_id: previousTemplateId,
    previous_template_name: text(currentTemplate?.name, 500) || null,
    previous_image_name: text(currentTemplate?.imageName, 1400) || null,
    target_template_id: targetTemplateId,
    target_template_name: targetTemplateName,
    target_image_name: evidence.imageTag,
    deep_before: deepBefore,
    fast_before: fastBefore,
    prepared_at: now,
  };
  await persistLocalState({ ...releaseProvenance, local_state_only: true, endpoint_patch_performed: false });
  await updateReview(db, governance.review, {
    ...validated.reviewMetadata,
    status: "PRODUCTION_RELEASE_APPLYING",
    production_release_authorized: true,
    production_model_promoted: false,
    production_release: releaseProvenance,
  }, `Production release for ${candidateId} is explicitly authorized and applying. Rollback provenance was recorded before endpoint mutation.`);

  await rest(`/endpoints/${encodeURIComponent(configuredEndpointId)}`, managementKey, { method: "PATCH", body: { templateId: targetTemplateId } });
  const verifiedBody = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
  const verifiedDeep = resolveOne(verifiedBody, ENDPOINT_NAME, "PRODUCTION_ADAPTER_DEEP_VERIFY_FAILED");
  const verifiedFast = resolveOne(verifiedBody, FAST_ENDPOINT_NAME, "PRODUCTION_ADAPTER_FAST_VERIFY_FAILED");
  const deepAfter = infrastructureSnapshot(verifiedDeep);
  const fastAfter = infrastructureSnapshot(verifiedFast);
  if (deepAfter.template_id !== targetTemplateId) throw new Error("PRODUCTION_ADAPTER_ENDPOINT_TEMPLATE_BINDING_VERIFY_FAILED");
  if (!sameInfrastructure(deepBefore, deepAfter)) throw new Error("PRODUCTION_ADAPTER_DEEP_INFRASTRUCTURE_MUTATION_DETECTED");
  if (JSON.stringify(fastBefore) !== JSON.stringify(fastAfter)) throw new Error("PRODUCTION_ADAPTER_FAST_LANE_MUTATION_DETECTED");

  const completedAt = new Date().toISOString();
  const completedRelease = { ...releaseProvenance, state: "RELEASED", deep_after: deepAfter, fast_after: fastAfter, completed_at: completedAt };
  await updateReview(db, governance.review, {
    ...validated.reviewMetadata,
    status: "PRODUCTION_RELEASED",
    production_release_authorized: true,
    production_model_promoted: true,
    automatic_production_promotion: false,
    production_endpoint_mutated: true,
    production_release: completedRelease,
  }, `Model candidate ${candidateId} was explicitly released to the governed production Deep endpoint. Rollback provenance is retained.`);
  await updateCandidate(db, governance.candidate, {
    ...validated.candidateMetadata,
    status: "PRODUCTION_RELEASED",
    production_model_promoted: true,
    production_model_promotion_effect: "DEEP_ENDPOINT_ADAPTER_RELEASED",
    automatic_production_promotion: false,
    production_release_review_id: governance.review.id,
    production_release_completed_at: completedAt,
  }, `Candidate ${candidateId} is the explicitly released production Deep adapter. Automatic promotion remains disabled.`);
  await persistLocalState({ ...completedRelease, local_state_only: false, endpoint_patch_performed: true });
  console.log(JSON.stringify({ success: true, contract: CONTRACT, mode: "APPLY", operation, status: "PRODUCTION_RELEASED", learning_organization_id: learningOrganization.organizationId, candidate_id: candidateId, template_id: targetTemplateId, rollback_template_id: previousTemplateId, immutable_image_reference: evidence.immutable, adapter_artifact_fingerprint: fingerprint, canonical_deep_model: FOUNDATION_MODEL, image_owned_entrypoint: true, fast_lane_effect: "NONE", generation_submitted: false, inference_performed: false, training_started: false, wallet_operation_performed: false, web_deploy_performed: false, automatic_production_promotion: false, secrets_printed: false }, null, 2));
  console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_RELEASE_APPLIED=true");
  process.exit(0);
}

const release = object(validated.reviewMetadata.production_release);
previousTemplateId = text(release.previous_template_id, 300);
const releasedTemplateId = text(release.target_template_id, 300);
if (!previousTemplateId || !releasedTemplateId) throw new Error("PRODUCTION_ADAPTER_ROLLBACK_TEMPLATE_PROVENANCE_REQUIRED");
if (deepBefore.template_id !== releasedTemplateId) throw new Error("PRODUCTION_ADAPTER_ROLLBACK_CURRENT_TEMPLATE_MISMATCH");
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  operation,
  learning_organization: { id: learningOrganization.organizationId, source: learningOrganization.source },
  selection: { source: selection.source, candidate_env_required: false, adapter_path_env_required: false },
  candidate_id: candidateId,
  adapter_artifact_reference: adapterPath,
  adapter_artifact_fingerprint: fingerprint,
  deep: { before: deepBefore, health: deepHealth, released_template_id: releasedTemplateId, rollback_template_id: previousTemplateId },
  fast: { before: fastBefore, mutation_allowed: false },
  governance: { explicit_rollback_approval_required: true, release_provenance_verified: true, automatic_rollback: false, candidate_requires_new_promotion_review_after_rollback: true, canonical_learning_organization_resolution: true, governed_candidate_selection: true },
  safety: { generation_submitted: false, inference_performed: false, training_started: false, wallet_operation_performed: false, web_deploy_performed: false, fast_lane_effect: "NONE", endpoint_id_preserved: true, gpu_pool_preserved: true, network_volume_preserved: true, workers_min_max_preserved: true, existing_template_deleted: false, secrets_printed: false },
};
console.log(JSON.stringify(plan, null, 2));
if (!apply) process.exit(0);

const rollbackStartedAt = new Date().toISOString();
await updateReview(db, governance.review, {
  ...validated.reviewMetadata,
  status: "PRODUCTION_ROLLBACK_APPLYING",
  production_release: { ...release, rollback_state: "APPLYING", rollback_started_at: rollbackStartedAt },
}, `Explicit rollback for production Deep candidate ${candidateId} is applying from retained release provenance.`);
await rest(`/endpoints/${encodeURIComponent(configuredEndpointId)}`, managementKey, { method: "PATCH", body: { templateId: previousTemplateId } });
const verifiedBody = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
const verifiedDeep = resolveOne(verifiedBody, ENDPOINT_NAME, "PRODUCTION_ADAPTER_ROLLBACK_DEEP_VERIFY_FAILED");
const verifiedFast = resolveOne(verifiedBody, FAST_ENDPOINT_NAME, "PRODUCTION_ADAPTER_ROLLBACK_FAST_VERIFY_FAILED");
const deepAfter = infrastructureSnapshot(verifiedDeep);
const fastAfter = infrastructureSnapshot(verifiedFast);
if (deepAfter.template_id !== previousTemplateId) throw new Error("PRODUCTION_ADAPTER_ROLLBACK_TEMPLATE_VERIFY_FAILED");
if (!sameInfrastructure(deepBefore, deepAfter)) throw new Error("PRODUCTION_ADAPTER_ROLLBACK_DEEP_INFRASTRUCTURE_MUTATION_DETECTED");
if (JSON.stringify(fastBefore) !== JSON.stringify(fastAfter)) throw new Error("PRODUCTION_ADAPTER_ROLLBACK_FAST_LANE_MUTATION_DETECTED");
const rollbackCompletedAt = new Date().toISOString();
const completedRelease = { ...release, rollback_state: "ROLLED_BACK", rollback_started_at: rollbackStartedAt, rollback_completed_at: rollbackCompletedAt, rollback_deep_after: deepAfter, rollback_fast_after: fastAfter };
await updateReview(db, governance.review, {
  ...validated.reviewMetadata,
  status: "PRODUCTION_ROLLED_BACK",
  production_model_promoted: false,
  production_release_authorized: false,
  production_endpoint_mutated: true,
  production_release: completedRelease,
}, `Production Deep candidate ${candidateId} was explicitly rolled back to the recorded predecessor template. A new promotion review is required before any re-release.`);
await updateCandidate(db, governance.candidate, {
  ...validated.candidateMetadata,
  status: "PRODUCTION_ROLLED_BACK",
  production_model_promoted: false,
  production_model_promotion_effect: "ROLLED_BACK",
  automatic_production_promotion: false,
  requires_new_promotion_review: true,
  production_rollback_completed_at: rollbackCompletedAt,
}, `Candidate ${candidateId} was rolled back from production Deep and requires a new explicit promotion review before re-release.`);
await persistLocalState({ ...completedRelease, local_state_only: false, endpoint_patch_performed: true });
console.log(JSON.stringify({ success: true, contract: CONTRACT, mode: "APPLY", operation, status: "PRODUCTION_ROLLED_BACK", learning_organization_id: learningOrganization.organizationId, candidate_id: candidateId, restored_template_id: previousTemplateId, released_template_id: releasedTemplateId, fast_lane_effect: "NONE", generation_submitted: false, inference_performed: false, training_started: false, wallet_operation_performed: false, web_deploy_performed: false, automatic_rollback: false, secrets_printed: false }, null, 2));
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_ROLLBACK_APPLIED=true");
