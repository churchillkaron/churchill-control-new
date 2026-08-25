import { chmod, readFile, writeFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const DEEP_ENDPOINT_NAME = "avantiqo-intelligence-v1";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const FAST_TEMPLATE_NAME = "avantiqo-intelligence-fast-v1";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_V1";
const ENV_PATH = ".env.local";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function requiredCredential() {
  const value = text(
    process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  );
  if (!value) {
    throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  }
  return value;
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
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
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

function replaceModel(value) {
  if (typeof value === "string") {
    return value.split(DEEP_MODEL).join(FAST_MODEL);
  }
  if (Array.isArray(value)) return value.map(replaceModel);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceModel(entry)]),
    );
  }
  return value;
}

function stripReasoningParserFromArray(values) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = text(values[index]);
    if (/^--reasoning-parser(?:=|$)/i.test(value)) {
      if (/^--reasoning-parser$/i.test(value)) index += 1;
      continue;
    }
    output.push(values[index]);
  }
  return output;
}

function stripReasoningParser(value) {
  if (Array.isArray(value)) {
    return stripReasoningParserFromArray(value.map(replaceModel));
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
      .map((entry) => replaceModel(entry));
  }
  const env = object(value);
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => !key.toUpperCase().includes("REASONING_PARSER"))
      .map(([key, entry]) => [key, replaceModel(entry)]),
  );
}

function templateBodyFromDeep(template = {}) {
  const source = object(template);
  const original = JSON.stringify(source);
  if (!original.includes(DEEP_MODEL)) {
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
  };
  if (text(source.containerRegistryAuthId)) {
    body.containerRegistryAuthId = text(source.containerRegistryAuthId);
  }
  if (!body.imageName) {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_IMAGE_REQUIRED");
  }
  const serialized = JSON.stringify(body);
  if (!serialized.includes(FAST_MODEL) || serialized.includes(DEEP_MODEL)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_MODEL_REWRITE_FAILED");
  }
  if (/reasoning[_-]?parser|--reasoning-parser/i.test(serialized)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_REASONING_PARSER_PRESENT");
  }
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
    workersMax: Math.max(1, Number(endpoint.workersMax || 1)),
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
  const line = `${key}=${id}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(source)
    ? source.replace(pattern, line)
    : `${source.replace(/\s*$/, "")}\n${line}\n`;
  await writeFile(ENV_PATH, next, { encoding: "utf8", mode: 0o600 });
  await chmod(ENV_PATH, 0o600);
}

function safeEndpoint(endpoint = {}) {
  return {
    present: Boolean(text(endpoint.id)),
    name: text(endpoint.name) || null,
    template_present: Boolean(text(endpoint.templateId || endpoint.template?.id)),
    gpu_count: Number(endpoint.gpuCount || 0) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: Number.isFinite(Number(endpoint.workersMin))
      ? Number(endpoint.workersMin)
      : null,
    workers_max: Number.isFinite(Number(endpoint.workersMax))
      ? Number(endpoint.workersMax)
      : null,
  };
}

const apply = process.argv.includes("--apply");
const approved =
  text(process.env.AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED=YES_REQUIRED");
}

const credential = requiredCredential();
const [endpoints, templates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=false", credential),
  rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    credential,
  ),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");

const deepMatches = endpoints.filter(
  (endpoint) => text(endpoint?.name) === DEEP_ENDPOINT_NAME,
);
if (deepMatches.length !== 1) {
  throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_RESOLUTION_FAILED:matches=${deepMatches.length}`);
}
const deepEndpoint = deepMatches[0];
const deepTemplateId = text(deepEndpoint.templateId || deepEndpoint.template?.id);
const deepTemplate =
  deepEndpoint.template ||
  templates.find((template) => text(template?.id) === deepTemplateId);
if (!deepTemplate || !deepTemplateId) {
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_REQUIRED");
}

const fastMatches = endpoints.filter(
  (endpoint) => text(endpoint?.name) === FAST_ENDPOINT_NAME,
);
if (fastMatches.length > 1) {
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_AMBIGUOUS:matches=${fastMatches.length}`);
}

if (fastMatches.length === 1) {
  const existing = fastMatches[0];
  const template =
    existing.template ||
    templates.find((item) => text(item?.id) === text(existing.templateId));
  const serialized = JSON.stringify(template || {});
  if (!serialized.includes(FAST_MODEL) || serialized.includes(DEEP_MODEL)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_EXISTING_ENDPOINT_MODEL_MISMATCH");
  }
  if (/reasoning[_-]?parser|--reasoning-parser/i.test(serialized)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_EXISTING_ENDPOINT_REASONING_PARSER_PRESENT");
  }
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
    mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
  }, null, 2));
  process.exit(0);
}

const templateBody = templateBodyFromDeep(deepTemplate);
const exactFastTemplates = templates.filter(
  (template) => text(template?.name) === FAST_TEMPLATE_NAME,
);
if (exactFastTemplates.length > 1) {
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_AMBIGUOUS:matches=${exactFastTemplates.length}`);
}

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
  fastTemplate = await rest("/templates", credential, {
    method: "POST",
    body: templateBody,
  });
}
const fastTemplateId = text(fastTemplate?.id);
if (!fastTemplateId) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_ID_REQUIRED");
}
const serializedFastTemplate = JSON.stringify(fastTemplate);
if (
  (serializedFastTemplate.includes(DEEP_MODEL) ||
    /reasoning[_-]?parser|--reasoning-parser/i.test(serializedFastTemplate)) &&
  serializedFastTemplate.length > 2
) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_CREATED_TEMPLATE_INVALID");
}

const freshEndpoints = await rest(
  "/endpoints?includeTemplate=false&includeWorkers=false",
  credential,
);
const appeared = Array.isArray(freshEndpoints)
  ? freshEndpoints.filter((endpoint) => text(endpoint?.name) === FAST_ENDPOINT_NAME)
  : [];
if (appeared.length) {
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_APPEARED_REPLAN_REQUIRED:matches=${appeared.length}`);
}

const created = await rest("/endpoints", credential, {
  method: "POST",
  body: endpointBodyFromDeep(deepEndpoint, fastTemplateId),
});
const endpointId = text(created?.id);
if (!endpointId) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_CREATED_ENDPOINT_ID_REQUIRED");
}
const verified = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=false`,
  credential,
);
if (
  text(verified?.name) !== FAST_ENDPOINT_NAME ||
  text(verified?.templateId || verified?.template?.id) !== fastTemplateId
) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_VERIFY_FAILED");
}
const verifiedTemplate = verified.template || fastTemplate;
const verifiedSerialized = JSON.stringify(verifiedTemplate || {});
if (
  !verifiedSerialized.includes(FAST_MODEL) ||
  verifiedSerialized.includes(DEEP_MODEL) ||
  /reasoning[_-]?parser|--reasoning-parser/i.test(verifiedSerialized)
) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_MODEL_VERIFY_FAILED");
}

await persistEndpointId(endpointId);

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint_exists: true,
  endpoint: safeEndpoint(verified),
  template_created: exactFastTemplates.length === 0,
  endpoint_created: true,
  env_local_endpoint_id_written: true,
  mutation_performed: true,
  generation_submitted: false,
  production_deploy_performed: false,
  next_action: "RUN_PRODUCT_ENGINEERING_E2E",
}, null, 2));
