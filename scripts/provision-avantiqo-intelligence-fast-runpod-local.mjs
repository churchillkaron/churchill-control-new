import { chmod, readFile, writeFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const DEEP_ENDPOINT_NAME = "avantiqo-intelligence-v1";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const FAST_TEMPLATE_NAME = "avantiqo-intelligence-fast-v1";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_V2";
const ENV_PATH = ".env.local";
const TEMPORARY_ENDPOINT_PATTERN =
  /(?:recovery|candidate|benchmark|diagnostic|stale|legacy|temporary|temp|migration|old)/i;

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
function credential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}
function queueCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
}
function approved(name) {
  return text(process.env[name]).toUpperCase() === "YES";
}

async function rest(path, key, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 700);
    const error = new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  return body;
}

async function queueHealth(endpointId, key) {
  const response = await fetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    },
  );
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`RUNPOD_QUEUE_HEALTH_${response.status}`);
  }
  return object(body);
}

function replaceModel(value) {
  if (typeof value === "string") return value.split(DEEP_MODEL).join(FAST_MODEL);
  if (Array.isArray(value)) return value.map(replaceModel);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceModel(entry)]),
    );
  }
  return value;
}

function stripReasoningParser(value) {
  if (Array.isArray(value)) {
    const source = value.map(replaceModel);
    const output = [];
    for (let index = 0; index < source.length; index += 1) {
      const current = text(source[index]);
      if (/^--reasoning-parser(?:=|$)/i.test(current)) {
        if (/^--reasoning-parser$/i.test(current)) index += 1;
        continue;
      }
      output.push(source[index]);
    }
    return output;
  }
  if (typeof value === "string") {
    return replaceModel(value)
      .replace(/\s+--reasoning-parser(?:=\S+|\s+\S+)/gi, "")
      .trim();
  }
  return value;
}

function fastEnvironment(value) {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => {
        const key = text(entry?.key || entry?.name).toUpperCase();
        return !key.includes("REASONING_PARSER");
      })
      .map(replaceModel);
  }
  return Object.fromEntries(
    Object.entries(object(value))
      .filter(([key]) => !key.toUpperCase().includes("REASONING_PARSER"))
      .map(([key, entry]) => [key, replaceModel(entry)]),
  );
}

function assertFastTemplate(template, code) {
  const serialized = JSON.stringify(template || {});
  if (!serialized.includes(FAST_MODEL) || serialized.includes(DEEP_MODEL)) {
    throw new Error(`${code}_MODEL_MISMATCH`);
  }
  if (/reasoning[_-]?parser|--reasoning-parser/i.test(serialized)) {
    throw new Error(`${code}_REASONING_PARSER_PRESENT`);
  }
}

function templateBodyFromDeep(template = {}) {
  const source = object(template);
  if (!JSON.stringify(source).includes(DEEP_MODEL)) {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_MODEL_BINDING_NOT_FOUND");
  }
  const body = {
    imageName: text(source.imageName),
    name: FAST_TEMPLATE_NAME,
    category: text(source.category) || "NVIDIA",
    containerDiskInGb: Math.max(10, Number(source.containerDiskInGb || 30)),
    dockerEntrypoint: stripReasoningParser(source.dockerEntrypoint || []),
    dockerStartCmd: stripReasoningParser(source.dockerStartCmd || []),
    env: fastEnvironment(source.env),
    isPublic: false,
    isServerless: true,
    ports: list(source.ports),
    readme:
      "Avantiqo-owned fast Intelligence lane. Qwen3-30B-A3B-Instruct-2507; bounded non-thinking decisions only.",
    volumeInGb: Math.max(0, Number(source.volumeInGb || 0)),
    volumeMountPath: text(source.volumeMountPath) || "/workspace",
    ...(text(source.containerRegistryAuthId)
      ? { containerRegistryAuthId: text(source.containerRegistryAuthId) }
      : {}),
  };
  if (!body.imageName) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_IMAGE_REQUIRED");
  assertFastTemplate(body, "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE");
  return body;
}

function endpointBodyFromDeep(endpoint = {}, templateId) {
  return {
    templateId,
    computeType: text(endpoint.computeType) || "GPU",
    executionTimeoutMs: Math.max(
      30_000,
      Math.min(300_000, Number(endpoint.executionTimeoutMs || 90_000)),
    ),
    flashboot: endpoint.flashboot !== false,
    gpuCount: Math.max(1, Number(endpoint.gpuCount || 1)),
    gpuTypeIds: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    idleTimeout: Math.max(1, Number(endpoint.idleTimeout || 5)),
    name: FAST_ENDPOINT_NAME,
    scalerType: text(endpoint.scalerType) || "QUEUE_DELAY",
    scalerValue: Math.max(1, Number(endpoint.scalerValue || 4)),
    workersMax: 1,
    workersMin: 0,
    ...(text(endpoint.networkVolumeId)
      ? { networkVolumeId: text(endpoint.networkVolumeId) }
      : {}),
  };
}

async function persistEndpointId(endpointId) {
  const id = text(endpointId);
  if (!id) throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID_REQUIRED");
  let source = "";
  try {
    source = await readFile(ENV_PATH, "utf8");
  } catch {
    source = "";
  }
  const key = "RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID";
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${id}`;
  const next = pattern.test(source)
    ? source.replace(pattern, line)
    : `${source.replace(/\s*$/, "")}\n${line}\n`;
  await writeFile(ENV_PATH, next, { encoding: "utf8", mode: 0o600 });
  await chmod(ENV_PATH, 0o600);
}

function managementNonExited(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus || worker?.desired_status).toUpperCase();
    return desired !== "EXITED";
  }).length;
}

function safeEndpoint(endpoint = {}) {
  return {
    present: Boolean(text(endpoint.id)),
    name: text(endpoint.name) || null,
    template_present: Boolean(text(endpoint.templateId || endpoint.template?.id)),
    gpu_count: Number(endpoint.gpuCount || 0) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    active_management_workers: managementNonExited(endpoint),
  };
}

function allocatedWorkersMax(endpoints) {
  return endpoints.reduce(
    (sum, endpoint) => sum + Math.max(0, finite(endpoint?.workersMax, 0)),
    0,
  );
}

function configuredEndpointIds() {
  return new Set(
    Object.entries(process.env)
      .filter(([key, value]) =>
        /^RUNPOD_AVANTIQO_.*_ENDPOINT_ID$/i.test(key) && Boolean(text(value)),
      )
      .map(([, value]) => text(value)),
  );
}

function quotaCandidateSummary(endpoint, protectedIds) {
  const id = text(endpoint?.id);
  const name = text(endpoint?.name);
  const workersMin = Math.max(0, finite(endpoint?.workersMin, 0));
  const workersMax = Math.max(0, finite(endpoint?.workersMax, 0));
  const protectedByEnv = protectedIds.has(id);
  const temporary = TEMPORARY_ENDPOINT_PATTERN.test(name);
  const keepsAvailable = workersMax > 1;
  const eligibleByShape =
    Boolean(id) &&
    name !== DEEP_ENDPOINT_NAME &&
    name !== FAST_ENDPOINT_NAME &&
    workersMin === 0 &&
    workersMax > 0 &&
    (keepsAvailable || (!protectedByEnv && temporary));
  return {
    id,
    name,
    workers_min: workersMin,
    workers_max: workersMax,
    active_management_workers: managementNonExited(endpoint),
    configured_endpoint: protectedByEnv,
    temporary_name: temporary,
    keeps_endpoint_available: keepsAvailable,
    eligible_by_shape: eligibleByShape,
    target_workers_max: eligibleByShape ? workersMax - 1 : null,
  };
}

function quotaCandidates(endpoints) {
  const protectedIds = configuredEndpointIds();
  return endpoints
    .map((endpoint) => ({ endpoint, summary: quotaCandidateSummary(endpoint, protectedIds) }))
    .filter(({ summary }) => summary.eligible_by_shape)
    .sort((left, right) => {
      const a = left.summary;
      const b = right.summary;
      if (a.keeps_endpoint_available !== b.keeps_endpoint_available) {
        return a.keeps_endpoint_available ? -1 : 1;
      }
      if (a.configured_endpoint !== b.configured_endpoint) {
        return a.configured_endpoint ? 1 : -1;
      }
      if (a.temporary_name !== b.temporary_name) {
        return a.temporary_name ? -1 : 1;
      }
      if (a.workers_max !== b.workers_max) return b.workers_max - a.workers_max;
      return a.name.localeCompare(b.name);
    });
}

function queueIdle(health = {}) {
  const jobs = object(health.jobs);
  const workers = object(health.workers);
  return (
    finite(jobs.inQueue ?? jobs.in_queue, 0) === 0 &&
    finite(jobs.inProgress ?? jobs.in_progress, 0) === 0 &&
    finite(workers.running, 0) === 0 &&
    finite(workers.initializing, 0) === 0
  );
}

function isWorkerQuotaError(error) {
  return (
    Number(error?.status) === 500 &&
    /Max workers across all endpoints must not exceed your workers quota/i.test(
      text(error?.detail || error?.message),
    )
  );
}

async function verifiedIdleCandidate(candidate, managementKey, runtimeKey) {
  const before = candidate.summary;
  const fresh = await rest(
    `/endpoints/${encodeURIComponent(before.id)}?includeTemplate=false&includeWorkers=true`,
    managementKey,
  );
  const freshSummary = quotaCandidateSummary(fresh, configuredEndpointIds());
  if (
    !freshSummary.eligible_by_shape ||
    freshSummary.name !== before.name ||
    freshSummary.workers_min !== before.workers_min ||
    freshSummary.workers_max !== before.workers_max ||
    freshSummary.active_management_workers !== 0
  ) {
    return null;
  }
  let health;
  try {
    health = await queueHealth(before.id, runtimeKey);
  } catch {
    return null;
  }
  if (!queueIdle(health)) return null;
  return { before: fresh, beforeSummary: freshSummary };
}

async function rebalanceOneWorkerSlot(endpoints, managementKey, runtimeKey) {
  if (!approved("AVANTIQO_INTELLIGENCE_FAST_RUNPOD_QUOTA_REBALANCE_APPROVED")) {
    const candidates = quotaCandidates(endpoints).map(({ summary }) => summary);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_RUNPOD_QUOTA_REBALANCE_APPROVAL_REQUIRED:candidates=${candidates.length}:set_AVANTIQO_INTELLIGENCE_FAST_RUNPOD_QUOTA_REBALANCE_APPROVED=YES`,
    );
  }

  for (const candidate of quotaCandidates(endpoints)) {
    const verified = await verifiedIdleCandidate(
      candidate,
      managementKey,
      runtimeKey,
    );
    if (!verified) continue;

    const { beforeSummary } = verified;
    const targetWorkersMax = beforeSummary.workers_max - 1;
    try {
      await rest(`/endpoints/${encodeURIComponent(beforeSummary.id)}`, managementKey, {
        method: "PATCH",
        body: { workersMax: targetWorkersMax },
      });
    } catch {
      continue;
    }

    const after = await rest(
      `/endpoints/${encodeURIComponent(beforeSummary.id)}?includeTemplate=false&includeWorkers=true`,
      managementKey,
    );
    const afterSummary = quotaCandidateSummary(after, configuredEndpointIds());
    if (
      afterSummary.name !== beforeSummary.name ||
      afterSummary.workers_min !== beforeSummary.workers_min ||
      afterSummary.workers_max !== targetWorkersMax
    ) {
      try {
        await rest(`/endpoints/${encodeURIComponent(beforeSummary.id)}`, managementKey, {
          method: "PATCH",
          body: { workersMax: beforeSummary.workers_max },
        });
      } catch {
        // Surface the primary verification error; rollback status is reported below.
      }
      throw new Error(
        `AVANTIQO_INTELLIGENCE_FAST_RUNPOD_QUOTA_DONOR_VERIFY_FAILED:${beforeSummary.name}`,
      );
    }

    return {
      id: beforeSummary.id,
      name: beforeSummary.name,
      before_workers_max: beforeSummary.workers_max,
      after_workers_max: targetWorkersMax,
      endpoint_remains_available: targetWorkersMax >= 1,
      temporary_endpoint_disabled: targetWorkersMax === 0,
    };
  }

  throw new Error(
    "AVANTIQO_INTELLIGENCE_FAST_RUNPOD_SAFE_QUOTA_DONOR_NOT_FOUND:requires_idle_scale_to_zero_endpoint_with_reducible_workers_max",
  );
}

async function rollbackQuotaDonor(donor, managementKey) {
  if (!donor?.id) return false;
  await rest(`/endpoints/${encodeURIComponent(donor.id)}`, managementKey, {
    method: "PATCH",
    body: { workersMax: donor.before_workers_max },
  });
  const verified = await rest(
    `/endpoints/${encodeURIComponent(donor.id)}?includeTemplate=false&includeWorkers=true`,
    managementKey,
  );
  return finite(verified?.workersMax) === donor.before_workers_max;
}

const apply = process.argv.includes("--apply");
const provisionApproved = approved("AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED");
if (apply && !provisionApproved) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED=YES_REQUIRED");
}

const key = credential();
const runtimeKey = queueCredential(key);
const [endpoints, templates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", key),
  rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  ),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");

const deepMatches = endpoints.filter((item) => text(item?.name) === DEEP_ENDPOINT_NAME);
if (deepMatches.length !== 1) {
  throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_RESOLUTION_FAILED:matches=${deepMatches.length}`);
}
const deepEndpoint = deepMatches[0];
const deepTemplateId = text(deepEndpoint.templateId || deepEndpoint.template?.id);
const deepTemplate =
  templates.find((item) => text(item?.id) === deepTemplateId) ||
  deepEndpoint.template;
if (!deepTemplate || !deepTemplateId) {
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_REQUIRED");
}

const fastMatches = endpoints.filter((item) => text(item?.name) === FAST_ENDPOINT_NAME);
if (fastMatches.length > 1) {
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_AMBIGUOUS:matches=${fastMatches.length}`);
}
if (fastMatches.length === 1) {
  const existing = fastMatches[0];
  const existingTemplateId = text(existing.templateId || existing.template?.id);
  const existingTemplate =
    templates.find((item) => text(item?.id) === existingTemplateId) ||
    existing.template;
  assertFastTemplate(existingTemplate, "AVANTIQO_INTELLIGENCE_FAST_EXISTING_ENDPOINT");
  if (apply) await persistEndpointId(existing.id);
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_exists: true,
    endpoint: safeEndpoint(existing),
    fast_model: FAST_MODEL,
    deep_model_unchanged: true,
    env_local_endpoint_id_written: apply,
    quota_rebalance_performed: false,
    mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
  }, null, 2));
  process.exit(0);
}

const templateBody = templateBodyFromDeep(deepTemplate);
const exactFastTemplates = templates.filter(
  (item) => text(item?.name) === FAST_TEMPLATE_NAME,
);
if (exactFastTemplates.length > 1) {
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_AMBIGUOUS:matches=${exactFastTemplates.length}`);
}
if (exactFastTemplates[0]) {
  assertFastTemplate(exactFastTemplates[0], "AVANTIQO_INTELLIGENCE_FAST_EXISTING_TEMPLATE");
}

const quotaPlanCandidates = quotaCandidates(endpoints).map(({ summary }) => summary);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_exists: false,
  deep_endpoint: safeEndpoint(deepEndpoint),
  deep_model: DEEP_MODEL,
  fast_model: FAST_MODEL,
  template_creation_required: exactFastTemplates.length === 0,
  model_binding_rewrite_verified: true,
  reasoning_parser_removed: true,
  workers_min: 0,
  workers_max: 1,
  allocated_workers_max_before: allocatedWorkersMax(endpoints),
  quota_rebalance_policy: "ON_QUOTA_ERROR_ONLY_TRANSACTIONAL_ONE_SLOT",
  quota_rebalance_candidates: quotaPlanCandidates,
  mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
};
if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let fastTemplate = exactFastTemplates[0] || null;
if (!fastTemplate) {
  fastTemplate = await rest("/templates", key, { method: "POST", body: templateBody });
}
const fastTemplateId = text(fastTemplate?.id);
if (!fastTemplateId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_ID_REQUIRED");

const freshEndpoints = await rest(
  "/endpoints?includeTemplate=true&includeWorkers=true",
  key,
);
const appeared = Array.isArray(freshEndpoints)
  ? freshEndpoints.filter((item) => text(item?.name) === FAST_ENDPOINT_NAME)
  : [];
if (appeared.length) {
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_APPEARED_REPLAN_REQUIRED:matches=${appeared.length}`);
}

let donor = null;
let created;
try {
  created = await rest("/endpoints", key, {
    method: "POST",
    body: endpointBodyFromDeep(deepEndpoint, fastTemplateId),
  });
} catch (error) {
  if (!isWorkerQuotaError(error)) throw error;

  donor = await rebalanceOneWorkerSlot(
    Array.isArray(freshEndpoints) ? freshEndpoints : endpoints,
    key,
    runtimeKey,
  );

  try {
    created = await rest("/endpoints", key, {
      method: "POST",
      body: endpointBodyFromDeep(deepEndpoint, fastTemplateId),
    });
  } catch (retryError) {
    let rollbackSucceeded = false;
    try {
      rollbackSucceeded = await rollbackQuotaDonor(donor, key);
    } catch {
      rollbackSucceeded = false;
    }
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_CREATE_AFTER_QUOTA_REBALANCE_FAILED:rollback=${rollbackSucceeded ? "PASS" : "FAIL"}:${text(retryError?.message).slice(0, 700)}`,
    );
  }
}

const endpointId = text(created?.id);
if (!endpointId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_CREATED_ENDPOINT_ID_REQUIRED");
const verified = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=false`,
  key,
);
if (
  text(verified?.name) !== FAST_ENDPOINT_NAME ||
  text(verified?.templateId || verified?.template?.id) !== fastTemplateId
) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_VERIFY_FAILED");
}
const verifiedTemplate =
  templates.find((item) => text(item?.id) === fastTemplateId) ||
  verified.template ||
  fastTemplate;
assertFastTemplate(verifiedTemplate, "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT");
await persistEndpointId(endpointId);

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint_exists: true,
  endpoint: safeEndpoint(verified),
  template_created: exactFastTemplates.length === 0,
  endpoint_created: true,
  env_local_endpoint_id_written: true,
  quota_rebalance_performed: Boolean(donor),
  quota_donor: donor,
  mutation_performed: true,
  generation_submitted: false,
  production_deploy_performed: false,
  next_action: "RUN_PRODUCT_ENGINEERING_E2E",
}, null, 2));
