import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_BASE_TEMPLATE_BINDING_REPAIR_V1";
const ENV_PATH = ".env.local";
const APPROVAL = "AVANTIQO_INTELLIGENCE_DEEP_BASE_TEMPLATE_REBIND_APPROVED";
const TARGET_PREFIX = "avantiqo-intelligence-deep-v1-base-recovered";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

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
function managementCredential() {
  const value = runtimeEnv("RUNPOD_MANAGEMENT_API_KEY") || runtimeEnv("RUNPOD_API_KEY");
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}
function queueCredential(managementKey) {
  return runtimeEnv("RUNPOD_API_KEY") || managementKey;
}
function approved() {
  return runtimeEnv(APPROVAL).toUpperCase() === "YES";
}
function redact(value) {
  return text(value, 1600)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
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
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}
function resolveOne(items, name, code) {
  const matches = rows(items, ["endpoints", "serverlessEndpoints"]).filter((entry) => text(entry?.name, 300) === name);
  if (matches.length !== 1) throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  return matches[0];
}
function templateId(endpoint) {
  return text(endpoint?.templateId || endpoint?.template?.id, 300);
}
function resolveReadableTemplate(endpoint, templates) {
  const id = templateId(endpoint);
  if (!id) return null;
  const inline = object(endpoint?.template);
  if (Object.keys(inline).length && text(inline?.imageName, 1200)) return { id, ...inline };
  const matches = rows(templates, ["templates"]).filter((template) => text(template?.id, 300) === id);
  if (matches.length === 0) return null;
  if (matches.length > 1) throw new Error(`AVANTIQO_INTELLIGENCE_TEMPLATE_ID_AMBIGUOUS:id=${id}:matches=${matches.length}`);
  if (!text(matches[0]?.imageName, 1200)) return null;
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
function requireFullyParked(endpoint, health, prefix) {
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
    throw new Error(`${prefix}_SCALING_0_0_REQUIRED`);
  }
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) {
    throw new Error(`${prefix}_QUEUE_NOT_EMPTY`);
  }
  if (activeWorkers(endpoint).length || Object.values(health.workers).some((value) => Number(value) !== 0)) {
    throw new Error(`${prefix}_ACTIVE_WORKER_PRESENT`);
  }
}

function envMap(value) {
  const pairs = Array.isArray(value)
    ? value.map((entry) => [text(entry?.key || entry?.name, 300), String(entry?.value ?? "")])
    : Object.entries(object(value)).map(([key, entryValue]) => [String(key), String(entryValue ?? "")]);
  return Object.fromEntries(pairs.filter(([key]) => key).sort(([left], [right]) => left.localeCompare(right)));
}
function normalizedPorts(value) {
  return list(value)
    .map((entry) => entry && typeof entry === "object" ? entry : text(entry))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
function replaceDeepWithFast(value) {
  if (typeof value === "string") return value.split(DEEP_MODEL).join(FAST_MODEL);
  if (Array.isArray(value)) return value.map(replaceDeepWithFast);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceDeepWithFast(child)]));
  }
  return value;
}
function replaceFastWithDeep(value) {
  if (typeof value === "string") return value.split(FAST_MODEL).join(DEEP_MODEL);
  if (Array.isArray(value)) return value.map(replaceFastWithDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceFastWithDeep(child)]));
  }
  return value;
}
function stripReasoningParserFromCommand(value) {
  const source = (Array.isArray(value) ? value : [text(value)].filter(Boolean)).map(replaceDeepWithFast);
  const output = [];
  for (let index = 0; index < source.length; index += 1) {
    const current = text(source[index]);
    if (/^--reasoning-parser(?:=|$)/i.test(current)) {
      if (/^--reasoning-parser$/i.test(current)) index += 1;
      continue;
    }
    output.push(typeof source[index] === "string"
      ? source[index].replace(/\s+--reasoning-parser(?:=\S+|\s+\S+)/gi, "").trim()
      : source[index]);
  }
  return output.filter((entry) => text(entry));
}
function fastEnvFromDeep(value) {
  return Object.fromEntries(Object.entries(envMap(value))
    .filter(([key]) => !key.toUpperCase().includes("REASONING_PARSER"))
    .map(([key, entryValue]) => [key, replaceDeepWithFast(entryValue)]));
}
function actualRuntime(template = {}) {
  return {
    image_name: text(template?.imageName, 1200) || null,
    container_disk_gb: finite(template?.containerDiskInGb),
    docker_entrypoint: Array.isArray(template?.dockerEntrypoint) ? template.dockerEntrypoint : [text(template?.dockerEntrypoint)].filter(Boolean),
    docker_start_cmd: Array.isArray(template?.dockerStartCmd) ? template.dockerStartCmd : [text(template?.dockerStartCmd)].filter(Boolean),
    env: envMap(template?.env),
    ports: normalizedPorts(template?.ports),
    volume_gb: finite(template?.volumeInGb),
    volume_mount_path: text(template?.volumeMountPath) || null,
    registry_auth_id: text(template?.containerRegistryAuthId, 300) || null,
    is_public: template?.isPublic === true,
  };
}
function expectedFastRuntimeFromDeep(template = {}) {
  return {
    image_name: text(template?.imageName, 1200) || null,
    container_disk_gb: finite(template?.containerDiskInGb),
    docker_entrypoint: stripReasoningParserFromCommand(template?.dockerEntrypoint),
    docker_start_cmd: stripReasoningParserFromCommand(template?.dockerStartCmd),
    env: fastEnvFromDeep(template?.env),
    ports: normalizedPorts(template?.ports),
    volume_gb: finite(template?.volumeInGb),
    volume_mount_path: text(template?.volumeMountPath) || null,
    registry_auth_id: text(template?.containerRegistryAuthId, 300) || null,
    is_public: template?.isPublic === true,
  };
}
function differentFields(left, right) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
}
function assertCanonicalFast(template) {
  const runtime = actualRuntime(template);
  const serialized = JSON.stringify(runtime);
  if (!runtime.image_name) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_IMAGE_REQUIRED");
  if (!serialized.includes(FAST_MODEL) || serialized.includes(DEEP_MODEL)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_MODEL_BINDING_INVALID");
  }
  if (/reasoning[_-]?parser|--reasoning-parser/i.test(serialized)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_REASONING_PARSER_PRESENT");
  }
  const env = runtime.env;
  if (text(env.ENABLE_AUTO_TOOL_CHOICE, 40).toLowerCase() !== "true") {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_AUTO_TOOL_CHOICE_REQUIRED");
  }
  if (text(env.TOOL_CALL_PARSER, 80).toLowerCase() !== "hermes") {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_HERMES_TOOL_CALL_PARSER_REQUIRED");
  }
  return runtime;
}
function desiredDeepFromFast(fastTemplate) {
  const fastRuntime = assertCanonicalFast(fastTemplate);
  const env = Object.fromEntries(Object.entries(fastRuntime.env).map(([key, value]) => [key, replaceFastWithDeep(value)]));
  env.REASONING_PARSER = "qwen3";
  const body = {
    imageName: fastRuntime.image_name,
    name: "",
    category: text(fastTemplate?.category, 200) || "NVIDIA",
    containerDiskInGb: Math.max(10, finite(fastTemplate?.containerDiskInGb, 30)),
    dockerEntrypoint: replaceFastWithDeep(fastRuntime.docker_entrypoint),
    dockerStartCmd: replaceFastWithDeep(fastRuntime.docker_start_cmd),
    env,
    isPublic: false,
    isServerless: true,
    ports: list(fastTemplate?.ports),
    readme: "Avantiqo-owned Deep Intelligence base runtime recovered from the proven Fast peer. Qwen3-30B-A3B-Thinking-2507 with qwen3 reasoning parser.",
    volumeInGb: Math.max(0, finite(fastTemplate?.volumeInGb, 0)),
    volumeMountPath: text(fastTemplate?.volumeMountPath) || "/workspace",
    ...(text(fastTemplate?.containerRegistryAuthId, 300) ? { containerRegistryAuthId: text(fastTemplate?.containerRegistryAuthId, 300) } : {}),
  };
  const serialized = JSON.stringify(body);
  if (!serialized.includes(DEEP_MODEL) || serialized.includes(FAST_MODEL)) {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_RECOVERY_MODEL_BINDING_INVALID");
  }
  if (text(env.REASONING_PARSER, 80).toLowerCase() !== "qwen3") {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_RECOVERY_REASONING_PARSER_INVALID");
  }
  const roundTrip = expectedFastRuntimeFromDeep(body);
  const differences = differentFields(roundTrip, fastRuntime);
  if (differences.length) {
    throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_TO_FAST_ROUND_TRIP_FAILED:${differences.join("|")}`);
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(fastRuntime)).digest("hex").slice(0, 12);
  body.name = `${TARGET_PREFIX}-${fingerprint}`;
  return { body, fastRuntime, fingerprint };
}
function deepTemplateIssues(template, desired, fastRuntime) {
  const issues = [];
  const runtime = actualRuntime(template);
  const serialized = JSON.stringify(runtime);
  if (!serialized.includes(DEEP_MODEL) || serialized.includes(FAST_MODEL)) issues.push("MODEL_BINDING");
  if (text(runtime.env.REASONING_PARSER, 80).toLowerCase() !== "qwen3") issues.push("REASONING_PARSER");
  if (text(runtime.env.ENABLE_AUTO_TOOL_CHOICE, 40).toLowerCase() !== "true") issues.push("AUTO_TOOL_CHOICE");
  if (text(runtime.env.TOOL_CALL_PARSER, 80).toLowerCase() !== "hermes") issues.push("TOOL_CALL_PARSER");
  const expectedRuntime = actualRuntime(desired);
  issues.push(...differentFields(expectedRuntime, runtime).map((field) => `RUNTIME_${field}`));
  const roundTrip = expectedFastRuntimeFromDeep(template);
  issues.push(...differentFields(roundTrip, fastRuntime).map((field) => `ROUND_TRIP_${field}`));
  return [...new Set(issues)];
}
function endpointInvariant(endpoint = {}) {
  return {
    id: text(endpoint?.id, 300),
    name: text(endpoint?.name, 300),
    compute_type: text(endpoint?.computeType, 120) || null,
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
    flashboot: endpoint?.flashboot === true,
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value, 300)).filter(Boolean).sort(),
    data_center_ids: list(endpoint?.dataCenterIds).map((value) => text(value, 300)).filter(Boolean).sort(),
    allowed_cuda_versions: list(endpoint?.allowedCudaVersions).map((value) => text(value, 100)).filter(Boolean).sort(),
    min_cuda_version: text(endpoint?.minCudaVersion, 100) || null,
    network_volume_id: text(endpoint?.networkVolumeId, 300) || null,
    network_volume_ids: list(endpoint?.networkVolumeIds).map((value) => text(typeof value === "string" ? value : value?.id || value?.networkVolumeId, 300)).filter(Boolean).sort(),
    idle_timeout: finite(endpoint?.idleTimeout),
    scaler_type: text(endpoint?.scalerType, 120) || null,
    scaler_value: finite(endpoint?.scalerValue),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
  };
}

async function loadState(managementKey, runtimeKey) {
  const [endpointBody, templatesBody] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  ]);
  const deep = resolveOne(endpointBody, DEEP_NAME, "AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_RESOLUTION_FAILED");
  const fast = resolveOne(endpointBody, FAST_NAME, "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_RESOLUTION_FAILED");
  const [deepHealthRaw, fastHealthRaw] = await Promise.all([
    queue(deep.id, "/health", runtimeKey),
    queue(fast.id, "/health", runtimeKey),
  ]);
  return {
    deep,
    fast,
    templatesBody,
    deepTemplate: resolveReadableTemplate(deep, templatesBody),
    fastTemplate: resolveReadableTemplate(fast, templatesBody),
    deepHealth: healthSummary(deepHealthRaw),
    fastHealth: healthSummary(fastHealthRaw),
  };
}
function assertConfiguredIds(state) {
  const configuredDeep = required("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID");
  if (configuredDeep !== text(state.deep?.id, 300)) {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_CONFIGURED_ENDPOINT_ID_MISMATCH");
  }
  const configuredFast = runtimeEnv("RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID");
  if (configuredFast && configuredFast !== text(state.fast?.id, 300)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_CONFIGURED_ENDPOINT_ID_MISMATCH");
  }
}
function assertFullyParkedState(state) {
  requireFullyParked(state.deep, state.deepHealth, "AVANTIQO_INTELLIGENCE_DEEP");
  requireFullyParked(state.fast, state.fastHealth, "AVANTIQO_INTELLIGENCE_FAST");
}
function output(payload) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    generation_submitted: false,
    workers_scaling_mutation_performed: false,
    queue_mutation_performed: false,
    fast_lane_mutation_performed: false,
    production_adapter_release_performed: false,
    secrets_in_output: false,
    ...payload,
  }, null, 2));
}

const apply = process.argv.includes("--apply");
const managementKey = managementCredential();
const runtimeKey = queueCredential(managementKey);
let state = await loadState(managementKey, runtimeKey);
assertConfiguredIds(state);
assertFullyParkedState(state);
if (!state.fastTemplate) throw new Error("AVANTIQO_INTELLIGENCE_FAST_BOUND_TEMPLATE_READABLE_REQUIRED");

const { body: desiredDeep, fastRuntime, fingerprint } = desiredDeepFromFast(state.fastTemplate);
const initialDeepTemplateId = templateId(state.deep);
const initialFastTemplateId = templateId(state.fast);
const initialDeepInvariant = endpointInvariant(state.deep);
const initialFastInvariant = endpointInvariant(state.fast);

if (state.deepTemplate) {
  const issues = deepTemplateIssues(state.deepTemplate, desiredDeep, fastRuntime);
  if (issues.length === 0) {
    output({
      mode: apply ? "APPLY_NOOP_ALREADY_VALID" : "PLAN_NOOP_ALREADY_VALID",
      action: "NONE",
      deep_endpoint_id: text(state.deep.id, 300),
      deep_template_id: templateId(state.deep),
      fast_template_id: templateId(state.fast),
      deep_template_readable: true,
      deep_template_valid: true,
      deep_to_fast_round_trip_exact: true,
      both_lanes_resting_0_0: true,
      endpoint_mutation_performed: false,
      template_mutation_performed: false,
    });
    process.exit(0);
  }
  throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_READABLE_TEMPLATE_UNEXPECTED_REFUSE_OVERWRITE:${issues.join("|")}`);
}

const matchingTargets = rows(state.templatesBody, ["templates"]).filter((template) => text(template?.name, 500) === desiredDeep.name);
if (matchingTargets.length > 1) {
  throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_RECOVERY_TARGET_AMBIGUOUS:matches=${matchingTargets.length}`);
}
let targetTemplate = matchingTargets[0] || null;
if (targetTemplate) {
  const issues = deepTemplateIssues(targetTemplate, desiredDeep, fastRuntime);
  if (issues.length) throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_EXISTING_RECOVERY_TARGET_INVALID:${issues.join("|")}`);
}

output({
  mode: apply ? "APPLY_PREFLIGHT" : "PLAN",
  action: targetTemplate ? "REBIND_EXISTING_VERIFIED_RECOVERY_TEMPLATE" : "CREATE_VERIFIED_RECOVERY_TEMPLATE_AND_REBIND",
  deep_endpoint_id: text(state.deep.id, 300),
  stale_or_unreadable_deep_template_id_present: Boolean(initialDeepTemplateId),
  fast_template_id: initialFastTemplateId,
  recovery_template_name: desiredDeep.name,
  recovery_fingerprint: fingerprint,
  recovery_template_already_exists: Boolean(targetTemplate),
  deep_template_readable: false,
  fast_template_readable: true,
  deep_to_fast_round_trip_exact: true,
  both_lanes_resting_0_0: true,
  endpoint_mutation_performed: false,
  template_mutation_performed: false,
});

if (!apply) process.exit(0);
if (!approved()) throw new Error(`${APPROVAL}=YES_REQUIRED`);

state = await loadState(managementKey, runtimeKey);
assertConfiguredIds(state);
assertFullyParkedState(state);
if (!state.fastTemplate) throw new Error("AVANTIQO_INTELLIGENCE_FAST_BOUND_TEMPLATE_BECAME_UNREADABLE");
const freshFastRuntime = assertCanonicalFast(state.fastTemplate);
if (templateId(state.fast) !== initialFastTemplateId || differentFields(fastRuntime, freshFastRuntime).length) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CHANGED_DURING_REPAIR");
}
if (JSON.stringify(endpointInvariant(state.fast)) !== JSON.stringify(initialFastInvariant)) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_CHANGED_DURING_REPAIR");
}
if (JSON.stringify(endpointInvariant(state.deep)) !== JSON.stringify(initialDeepInvariant)) {
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_CHANGED_DURING_REPAIR");
}
if (state.deepTemplate) {
  const issues = deepTemplateIssues(state.deepTemplate, desiredDeep, fastRuntime);
  if (issues.length === 0) {
    output({
      mode: "APPLY_NOOP_CONCURRENT_REPAIR_ALREADY_VALID",
      action: "NONE",
      deep_endpoint_id: text(state.deep.id, 300),
      deep_template_id: templateId(state.deep),
      fast_template_id: templateId(state.fast),
      deep_template_readable: true,
      deep_template_valid: true,
      deep_to_fast_round_trip_exact: true,
      both_lanes_resting_0_0: true,
      endpoint_mutation_performed: false,
      template_mutation_performed: false,
    });
    process.exit(0);
  }
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_BECAME_READABLE_BUT_UNEXPECTED");
}
if (templateId(state.deep) !== initialDeepTemplateId) {
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_BINDING_CHANGED_DURING_REPAIR");
}

let templateMutationPerformed = false;
if (!targetTemplate) {
  const created = await rest("/templates", managementKey, {
    method: "POST",
    body: { ...desiredDeep, category: desiredDeep.category || "NVIDIA", isServerless: true },
  });
  const createdId = text(created?.id, 300);
  if (!createdId) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_RECOVERY_TEMPLATE_CREATE_ID_REQUIRED");
  targetTemplate = await rest(`/templates/${encodeURIComponent(createdId)}`, managementKey);
  const issues = deepTemplateIssues(targetTemplate, desiredDeep, fastRuntime);
  if (issues.length) throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_CREATED_RECOVERY_TEMPLATE_INVALID:${issues.join("|")}`);
  templateMutationPerformed = true;
}
const targetTemplateId = text(targetTemplate?.id, 300);
if (!targetTemplateId) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_RECOVERY_TARGET_ID_REQUIRED");

const beforeBind = await loadState(managementKey, runtimeKey);
assertConfiguredIds(beforeBind);
assertFullyParkedState(beforeBind);
if (templateId(beforeBind.fast) !== initialFastTemplateId || JSON.stringify(endpointInvariant(beforeBind.fast)) !== JSON.stringify(initialFastInvariant)) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_CHANGED_BEFORE_BIND");
}
if (JSON.stringify(endpointInvariant(beforeBind.deep)) !== JSON.stringify(initialDeepInvariant)) {
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_CHANGED_BEFORE_BIND");
}
if (beforeBind.deepTemplate) {
  const issues = deepTemplateIssues(beforeBind.deepTemplate, desiredDeep, fastRuntime);
  if (issues.length === 0) {
    output({
      mode: "APPLY_NOOP_CONCURRENT_REPAIR_BEFORE_BIND",
      action: "NONE",
      deep_endpoint_id: text(beforeBind.deep.id, 300),
      deep_template_id: templateId(beforeBind.deep),
      recovery_template_id: targetTemplateId,
      both_lanes_resting_0_0: true,
      endpoint_mutation_performed: false,
      template_mutation_performed: templateMutationPerformed,
    });
    process.exit(0);
  }
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_READABLE_TEMPLATE_APPEARED_BEFORE_BIND");
}
if (templateId(beforeBind.deep) !== initialDeepTemplateId) {
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_BINDING_CHANGED_BEFORE_BIND");
}

await rest(`/endpoints/${encodeURIComponent(beforeBind.deep.id)}`, managementKey, {
  method: "PATCH",
  body: { templateId: targetTemplateId },
});

const verified = await loadState(managementKey, runtimeKey);
assertConfiguredIds(verified);
assertFullyParkedState(verified);
if (templateId(verified.deep) !== targetTemplateId) {
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_REBIND_VERIFY_FAILED");
}
if (!verified.deepTemplate) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_REBOUND_TEMPLATE_NOT_READABLE");
const verifiedIssues = deepTemplateIssues(verified.deepTemplate, desiredDeep, fastRuntime);
if (verifiedIssues.length) {
  throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_REBOUND_TEMPLATE_CONTRACT_INVALID:${verifiedIssues.join("|")}`);
}
if (JSON.stringify(endpointInvariant(verified.deep)) !== JSON.stringify(initialDeepInvariant)) {
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_TOPOLOGY_DRIFT_AFTER_REBIND");
}
if (templateId(verified.fast) !== initialFastTemplateId || JSON.stringify(endpointInvariant(verified.fast)) !== JSON.stringify(initialFastInvariant)) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_LANE_DRIFT_AFTER_REBIND");
}

output({
  mode: "APPLY",
  action: "DEEP_BASE_TEMPLATE_REBOUND",
  deep_endpoint_id: text(verified.deep.id, 300),
  previous_deep_template_id_present: Boolean(initialDeepTemplateId),
  recovery_template_id: targetTemplateId,
  recovery_template_name: desiredDeep.name,
  recovery_fingerprint: fingerprint,
  deep_template_readable: true,
  deep_template_valid: true,
  deep_to_fast_round_trip_exact: true,
  both_lanes_resting_0_0: true,
  endpoint_topology_preserved: true,
  endpoint_mutation_performed: true,
  template_mutation_performed: templateMutationPerformed,
});
console.log("AVANTIQO_INTELLIGENCE_DEEP_BASE_TEMPLATE_BINDING_REPAIR=PASS");
