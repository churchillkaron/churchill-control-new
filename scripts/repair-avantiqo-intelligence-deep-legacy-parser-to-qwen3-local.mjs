import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const LEGACY_PARSER = "deepseek_r1";
const TARGET_PARSER = "qwen3";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_LEGACY_PARSER_TO_QWEN3_V1";
const APPROVAL = "AVANTIQO_INTELLIGENCE_DEEP_LEGACY_PARSER_TO_QWEN3_APPROVED";
const ENV_PATH = ".env.local";
const TARGET_PREFIX = "avantiqo-intelligence-deep-v1-qwen3-parser";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const numberOrNull = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

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
function runtimeCredential(managementKey) {
  return runtimeEnv("RUNPOD_API_KEY") || managementKey;
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
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  return body ?? {};
}
const rest = (path, key, options = {}) => requestJson(`${REST_BASE}${path}`, key, options);
const healthRequest = (endpointId, key) => requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, { timeoutMs: 20_000 });

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
function templateId(endpoint) {
  return text(endpoint?.templateId || endpoint?.template?.id, 300);
}
function resolveTemplate(endpoint, templates, code) {
  const id = templateId(endpoint);
  if (!id) throw new Error(`${code}_ID_REQUIRED`);
  const inline = object(endpoint?.template);
  if (Object.keys(inline).length && text(inline?.imageName, 1200)) return { id, ...inline };
  const matches = rows(templates, ["templates"]).filter((template) => text(template?.id, 300) === id);
  if (matches.length !== 1) throw new Error(`${code}_RESOLUTION_FAILED:id=${id}:matches=${matches.length}`);
  if (!text(matches[0]?.imageName, 1200)) throw new Error(`${code}_IMAGE_REQUIRED`);
  return matches[0];
}
function envMap(value) {
  const pairs = Array.isArray(value)
    ? value.map((entry) => [text(entry?.key || entry?.name, 300), String(entry?.value ?? "")])
    : Object.entries(object(value)).map(([key, entryValue]) => [String(key), String(entryValue ?? "")]);
  return Object.fromEntries(pairs.filter(([key]) => key).sort(([a], [b]) => a.localeCompare(b)));
}
function normalizedPorts(value) {
  return list(value).map((entry) => entry && typeof entry === "object" ? entry : text(entry))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function runtime(template = {}) {
  return {
    image_name: text(template?.imageName, 1200) || null,
    container_disk_gb: numberOrNull(template?.containerDiskInGb),
    docker_entrypoint: Array.isArray(template?.dockerEntrypoint) ? template.dockerEntrypoint : [text(template?.dockerEntrypoint)].filter(Boolean),
    docker_start_cmd: Array.isArray(template?.dockerStartCmd) ? template.dockerStartCmd : [text(template?.dockerStartCmd)].filter(Boolean),
    env: envMap(template?.env),
    ports: normalizedPorts(template?.ports),
    volume_gb: numberOrNull(template?.volumeInGb),
    volume_mount_path: text(template?.volumeMountPath) || null,
    registry_auth_id: text(template?.containerRegistryAuthId, 300) || null,
    is_public: template?.isPublic === true,
  };
}
function replaceDeepWithFast(value) {
  if (typeof value === "string") return value.split(DEEP_MODEL).join(FAST_MODEL);
  if (Array.isArray(value)) return value.map(replaceDeepWithFast);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceDeepWithFast(child)]));
  return value;
}
function stripReasoningParserCommand(value) {
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
function expectedFastRuntime(deepTemplate) {
  const deep = runtime(deepTemplate);
  return {
    ...deep,
    docker_entrypoint: stripReasoningParserCommand(deep.docker_entrypoint),
    docker_start_cmd: stripReasoningParserCommand(deep.docker_start_cmd),
    env: Object.fromEntries(Object.entries(deep.env)
      .filter(([key]) => !key.toUpperCase().includes("REASONING_PARSER"))
      .map(([key, value]) => [key, replaceDeepWithFast(value)])),
  };
}
function differentFields(left, right) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
}
function candidateFromDeep(deepTemplate) {
  const current = runtime(deepTemplate);
  const serialized = JSON.stringify(current);
  if (!current.image_name) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_IMAGE_REQUIRED");
  if (!serialized.includes(DEEP_MODEL) || serialized.includes(FAST_MODEL)) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_MODEL_BINDING_INVALID");
  if (text(current.env.ENABLE_AUTO_TOOL_CHOICE, 40).toLowerCase() !== "true") throw new Error("AVANTIQO_INTELLIGENCE_DEEP_AUTO_TOOL_CHOICE_REQUIRED");
  if (text(current.env.TOOL_CALL_PARSER, 80).toLowerCase() !== "hermes") throw new Error("AVANTIQO_INTELLIGENCE_DEEP_HERMES_TOOL_CALL_PARSER_REQUIRED");
  const sourceParser = text(current.env.REASONING_PARSER, 80).toLowerCase();
  if (![LEGACY_PARSER, TARGET_PARSER].includes(sourceParser)) {
    throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_PARSER_SOURCE_REFUSED:${sourceParser || "missing"}`);
  }
  const env = { ...current.env, REASONING_PARSER: TARGET_PARSER };
  const body = {
    imageName: current.image_name,
    name: "",
    category: text(deepTemplate?.category, 200) || "NVIDIA",
    containerDiskInGb: current.container_disk_gb,
    dockerEntrypoint: current.docker_entrypoint,
    dockerStartCmd: current.docker_start_cmd,
    env,
    isPublic: current.is_public,
    isServerless: true,
    ports: list(deepTemplate?.ports),
    readme: "Avantiqo-owned Deep Intelligence base runtime converged from legacy deepseek_r1 parser to canonical qwen3.",
    ...(current.volume_gb === null ? {} : { volumeInGb: current.volume_gb }),
    ...(current.volume_mount_path ? { volumeMountPath: current.volume_mount_path } : {}),
    ...(current.registry_auth_id ? { containerRegistryAuthId: current.registry_auth_id } : {}),
  };
  if (body.containerDiskInGb === null || body.containerDiskInGb <= 0) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_CONTAINER_DISK_REQUIRED");
  const candidate = runtime(body);
  const changed = differentFields(current, candidate);
  if (sourceParser === LEGACY_PARSER && JSON.stringify(changed) !== JSON.stringify(["env"])) {
    throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_LEGACY_PARSER_CHANGE_NOT_ENV_ONLY:${changed.join("|")}`);
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(candidate)).digest("hex").slice(0, 12);
  body.name = `${TARGET_PREFIX}-${fingerprint}`;
  return { sourceParser, current, candidate, body, fingerprint };
}
function assertFastParity(candidateBody, fastTemplate) {
  const fast = runtime(fastTemplate);
  const serialized = JSON.stringify(fast);
  if (!serialized.includes(FAST_MODEL) || serialized.includes(DEEP_MODEL)) throw new Error("AVANTIQO_INTELLIGENCE_FAST_MODEL_BINDING_INVALID");
  if (/reasoning[_-]?parser|--reasoning-parser/i.test(serialized)) throw new Error("AVANTIQO_INTELLIGENCE_FAST_REASONING_PARSER_PRESENT");
  if (text(fast.env.ENABLE_AUTO_TOOL_CHOICE, 40).toLowerCase() !== "true") throw new Error("AVANTIQO_INTELLIGENCE_FAST_AUTO_TOOL_CHOICE_REQUIRED");
  if (text(fast.env.TOOL_CALL_PARSER, 80).toLowerCase() !== "hermes") throw new Error("AVANTIQO_INTELLIGENCE_FAST_HERMES_TOOL_CALL_PARSER_REQUIRED");
  const expected = expectedFastRuntime(candidateBody);
  const differences = differentFields(expected, fast);
  if (differences.length) throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_FAST_PARITY_FAILED:${differences.join("|")}`);
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
function health(raw = {}) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
  return {
    jobs: {
      in_queue: numberOrNull(jobs.inQueue ?? jobs.in_queue) ?? 0,
      in_progress: numberOrNull(jobs.inProgress ?? jobs.in_progress) ?? 0,
    },
    workers: {
      idle: numberOrNull(workers.idle) ?? 0,
      initializing: numberOrNull(workers.initializing) ?? 0,
      ready: numberOrNull(workers.ready) ?? 0,
      running: numberOrNull(workers.running) ?? 0,
      throttled: numberOrNull(workers.throttled) ?? 0,
      unhealthy: numberOrNull(workers.unhealthy) ?? 0,
    },
  };
}
function requireParked(endpoint, queueHealth, prefix) {
  if (numberOrNull(endpoint?.workersMin) !== 0 || numberOrNull(endpoint?.workersMax) !== 0) throw new Error(`${prefix}_SCALING_0_0_REQUIRED`);
  if (queueHealth.jobs.in_queue !== 0 || queueHealth.jobs.in_progress !== 0) throw new Error(`${prefix}_QUEUE_NOT_EMPTY`);
  if (activeWorkers(endpoint).length || Object.values(queueHealth.workers).some((value) => value !== 0)) throw new Error(`${prefix}_ACTIVE_WORKER_PRESENT`);
}
function endpointInvariant(endpoint = {}) {
  return {
    id: text(endpoint?.id, 300),
    name: text(endpoint?.name, 300),
    compute_type: text(endpoint?.computeType, 120) || null,
    execution_timeout_ms: numberOrNull(endpoint?.executionTimeoutMs),
    flashboot: endpoint?.flashboot === true,
    gpu_count: numberOrNull(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value, 300)).filter(Boolean).sort(),
    data_center_ids: list(endpoint?.dataCenterIds).map((value) => text(value, 300)).filter(Boolean).sort(),
    allowed_cuda_versions: list(endpoint?.allowedCudaVersions).map((value) => text(value, 100)).filter(Boolean).sort(),
    min_cuda_version: text(endpoint?.minCudaVersion, 100) || null,
    network_volume_id: text(endpoint?.networkVolumeId, 300) || null,
    network_volume_ids: list(endpoint?.networkVolumeIds).map((value) => text(typeof value === "string" ? value : value?.id || value?.networkVolumeId, 300)).filter(Boolean).sort(),
    idle_timeout: numberOrNull(endpoint?.idleTimeout),
    scaler_type: text(endpoint?.scalerType, 120) || null,
    scaler_value: numberOrNull(endpoint?.scalerValue),
    workers_min: numberOrNull(endpoint?.workersMin),
    workers_max: numberOrNull(endpoint?.workersMax),
  };
}
async function loadState(managementKey, runKey) {
  const [endpointBody, templatesBody] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  ]);
  const deep = resolveOne(endpointBody, DEEP_NAME, "AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_RESOLUTION_FAILED");
  const fast = resolveOne(endpointBody, FAST_NAME, "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_RESOLUTION_FAILED");
  const [deepRaw, fastRaw] = await Promise.all([healthRequest(deep.id, runKey), healthRequest(fast.id, runKey)]);
  return {
    deep,
    fast,
    deepTemplate: resolveTemplate(deep, templatesBody, "AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE"),
    fastTemplate: resolveTemplate(fast, templatesBody, "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE"),
    templatesBody,
    deepHealth: health(deepRaw),
    fastHealth: health(fastRaw),
  };
}
function validateState(state) {
  if (required("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID") !== text(state.deep?.id, 300)) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_CONFIGURED_ENDPOINT_ID_MISMATCH");
  const configuredFast = runtimeEnv("RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID");
  if (configuredFast && configuredFast !== text(state.fast?.id, 300)) throw new Error("AVANTIQO_INTELLIGENCE_FAST_CONFIGURED_ENDPOINT_ID_MISMATCH");
  requireParked(state.deep, state.deepHealth, "AVANTIQO_INTELLIGENCE_DEEP");
  requireParked(state.fast, state.fastHealth, "AVANTIQO_INTELLIGENCE_FAST");
}
function inspect(state) {
  const candidate = candidateFromDeep(state.deepTemplate);
  assertFastParity(candidate.body, state.fastTemplate);
  return candidate;
}
function output(payload) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    generation_submitted: false,
    workers_scaling_mutation_performed: false,
    queue_mutation_performed: false,
    fast_lane_mutation_performed: false,
    secrets_in_output: false,
    ...payload,
  }, null, 2));
}

const apply = process.argv.includes("--apply");
const managementKey = managementCredential();
const runKey = runtimeCredential(managementKey);
let state = await loadState(managementKey, runKey);
validateState(state);
let candidate = inspect(state);
const initialDeepTemplateId = templateId(state.deep);
const initialFastTemplateId = templateId(state.fast);
const initialDeepInvariant = endpointInvariant(state.deep);
const initialFastInvariant = endpointInvariant(state.fast);

if (candidate.sourceParser === TARGET_PARSER) {
  output({
    mode: apply ? "APPLY_NOOP_ALREADY_QWEN3" : "PLAN_NOOP_ALREADY_QWEN3",
    action: "NONE",
    deep_template_id: initialDeepTemplateId,
    fast_template_id: initialFastTemplateId,
    reasoning_parser: TARGET_PARSER,
    deep_fast_runtime_parity: true,
    both_lanes_resting_0_0: true,
    endpoint_mutation_performed: false,
    template_mutation_performed: false,
  });
  process.exit(0);
}

const targets = rows(state.templatesBody, ["templates"]).filter((template) => text(template?.name, 500) === candidate.body.name);
if (targets.length > 1) throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_QWEN3_TARGET_AMBIGUOUS:matches=${targets.length}`);
let targetTemplate = targets[0] || null;
if (targetTemplate) {
  const targetDiff = differentFields(candidate.candidate, runtime(targetTemplate));
  if (targetDiff.length) throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_QWEN3_EXISTING_TARGET_INVALID:${targetDiff.join("|")}`);
  assertFastParity(targetTemplate, state.fastTemplate);
}

output({
  mode: apply ? "APPLY_PREFLIGHT" : "PLAN",
  action: targetTemplate ? "REBIND_EXISTING_VERIFIED_QWEN3_TEMPLATE" : "CREATE_VERIFIED_QWEN3_TEMPLATE_AND_REBIND",
  deep_template_id: initialDeepTemplateId,
  fast_template_id: initialFastTemplateId,
  observed_reasoning_parser: candidate.sourceParser,
  target_reasoning_parser: TARGET_PARSER,
  convergence_scope: ["env.REASONING_PARSER"],
  recovery_template_name: candidate.body.name,
  recovery_fingerprint: candidate.fingerprint,
  recovery_template_already_exists: Boolean(targetTemplate),
  deep_fast_runtime_parity_after_convergence: true,
  both_lanes_resting_0_0: true,
  endpoint_mutation_performed: false,
  template_mutation_performed: false,
});
if (!apply) process.exit(0);
if (runtimeEnv(APPROVAL).toUpperCase() !== "YES") throw new Error(`${APPROVAL}=YES_REQUIRED`);

state = await loadState(managementKey, runKey);
validateState(state);
if (JSON.stringify(endpointInvariant(state.deep)) !== JSON.stringify(initialDeepInvariant)) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_CHANGED_DURING_LEGACY_PARSER_REPAIR");
if (JSON.stringify(endpointInvariant(state.fast)) !== JSON.stringify(initialFastInvariant)) throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_CHANGED_DURING_LEGACY_PARSER_REPAIR");
if (templateId(state.fast) !== initialFastTemplateId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CHANGED_DURING_LEGACY_PARSER_REPAIR");
if (templateId(state.deep) !== initialDeepTemplateId) {
  const concurrent = inspect(state);
  if (concurrent.sourceParser === TARGET_PARSER) {
    output({ mode: "APPLY_NOOP_CONCURRENT_QWEN3_REPAIR", action: "NONE", reasoning_parser: TARGET_PARSER, deep_fast_runtime_parity: true, both_lanes_resting_0_0: true, endpoint_mutation_performed: false, template_mutation_performed: false });
    process.exit(0);
  }
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_CHANGED_DURING_LEGACY_PARSER_REPAIR");
}
candidate = inspect(state);
if (candidate.sourceParser !== LEGACY_PARSER) throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_LEGACY_PARSER_SOURCE_CHANGED:${candidate.sourceParser}`);

const freshTargets = rows(state.templatesBody, ["templates"]).filter((template) => text(template?.name, 500) === candidate.body.name);
if (freshTargets.length > 1) throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_QWEN3_TARGET_AMBIGUOUS:matches=${freshTargets.length}`);
targetTemplate = freshTargets[0] || null;
let templateMutationPerformed = false;
if (!targetTemplate) {
  const created = await rest("/templates", managementKey, { method: "POST", body: candidate.body });
  const id = text(created?.id, 300);
  if (!id) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_QWEN3_TEMPLATE_CREATE_ID_REQUIRED");
  targetTemplate = await rest(`/templates/${encodeURIComponent(id)}`, managementKey);
  const targetDiff = differentFields(candidate.candidate, runtime(targetTemplate));
  if (targetDiff.length) throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_QWEN3_CREATED_TARGET_INVALID:${targetDiff.join("|")}`);
  assertFastParity(targetTemplate, state.fastTemplate);
  templateMutationPerformed = true;
}
const targetTemplateId = text(targetTemplate?.id, 300);
if (!targetTemplateId) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_QWEN3_TARGET_ID_REQUIRED");

const beforeBind = await loadState(managementKey, runKey);
validateState(beforeBind);
if (JSON.stringify(endpointInvariant(beforeBind.deep)) !== JSON.stringify(initialDeepInvariant)) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_CHANGED_BEFORE_QWEN3_BIND");
if (JSON.stringify(endpointInvariant(beforeBind.fast)) !== JSON.stringify(initialFastInvariant) || templateId(beforeBind.fast) !== initialFastTemplateId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_CHANGED_BEFORE_QWEN3_BIND");
if (templateId(beforeBind.deep) !== initialDeepTemplateId) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_CHANGED_BEFORE_QWEN3_BIND");
const beforeCandidate = inspect(beforeBind);
if (beforeCandidate.sourceParser !== LEGACY_PARSER || beforeCandidate.fingerprint !== candidate.fingerprint) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_LEGACY_PARSER_SOURCE_CHANGED_BEFORE_BIND");

await rest(`/endpoints/${encodeURIComponent(beforeBind.deep.id)}`, managementKey, { method: "PATCH", body: { templateId: targetTemplateId } });

const verified = await loadState(managementKey, runKey);
validateState(verified);
if (templateId(verified.deep) !== targetTemplateId) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_QWEN3_REBIND_VERIFY_FAILED");
const verifiedCandidate = inspect(verified);
if (verifiedCandidate.sourceParser !== TARGET_PARSER) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_QWEN3_VERIFY_FAILED");
if (JSON.stringify(endpointInvariant(verified.deep)) !== JSON.stringify(initialDeepInvariant)) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_TOPOLOGY_DRIFT_AFTER_QWEN3_REBIND");
if (JSON.stringify(endpointInvariant(verified.fast)) !== JSON.stringify(initialFastInvariant) || templateId(verified.fast) !== initialFastTemplateId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_DRIFT_AFTER_QWEN3_REBIND");

output({
  mode: "APPLY",
  action: "DEEP_LEGACY_PARSER_CONVERGED_TO_QWEN3",
  previous_deep_template_id: initialDeepTemplateId,
  recovery_template_id: targetTemplateId,
  recovery_template_name: candidate.body.name,
  recovery_fingerprint: candidate.fingerprint,
  previous_reasoning_parser: LEGACY_PARSER,
  reasoning_parser: TARGET_PARSER,
  convergence_scope: ["env.REASONING_PARSER"],
  deep_fast_runtime_parity: true,
  both_lanes_resting_0_0: true,
  endpoint_topology_preserved: true,
  endpoint_mutation_performed: true,
  template_mutation_performed: templateMutationPerformed,
});
console.log("AVANTIQO_INTELLIGENCE_DEEP_LEGACY_PARSER_TO_QWEN3=PASS");
