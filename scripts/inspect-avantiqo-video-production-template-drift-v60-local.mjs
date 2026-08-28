import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_VIDEO_PRODUCTION_TEMPLATE_DRIFT_INSPECTION_V60";
const CERTIFICATION_ENDPOINT_NAME = "avantiqo-cinema-v1";
const PRODUCTION_ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const PRODUCTION_TEMPLATE_NAME = "avantiqo-cinema-production-v4";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = normalizeRows(value[key], keys, depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function sameArray(left, right) {
  return JSON.stringify(list(left)) === JSON.stringify(list(right));
}

function sameSet(left, right) {
  return JSON.stringify([...new Set(list(left).map(text).filter(Boolean))].sort()) ===
    JSON.stringify([...new Set(list(right).map(text).filter(Boolean))].sort());
}

async function requestJson(url, credential, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 AvantiqoVideoV60",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 1200)}`);
  }
  if (body === null) throw new Error(`${CONTRACT}_HTTP_${response.status}:INVALID_JSON`);
  return body;
}

const rest = (path, key) => requestJson(`${REST_BASE}${path}`, key);

function safeEnvDiff(existingEnv, desiredEnv) {
  const existing = normalizeEnv(existingEnv);
  const desired = normalizeEnv(desiredEnv);
  const keys = [...new Set([...Object.keys(existing), ...Object.keys(desired)])].sort();
  return {
    existing_keys: Object.keys(existing).sort(),
    desired_keys: Object.keys(desired).sort(),
    key_set_equal: sameSet(Object.keys(existing), Object.keys(desired)),
    per_key: keys.map((key) => ({
      key,
      existing_present: Object.prototype.hasOwnProperty.call(existing, key),
      desired_present: Object.prototype.hasOwnProperty.call(desired, key),
      value_equal: Object.prototype.hasOwnProperty.call(existing, key) &&
        Object.prototype.hasOwnProperty.call(desired, key) &&
        existing[key] === desired[key],
    })),
  };
}

function fieldDiff(existing, desired) {
  const env = safeEnvDiff(existing?.env, desired?.env);
  const existingServerlessRaw = existing?.isServerless;
  const desiredServerlessRaw = desired?.isServerless;
  const existingServerlessNormalized = existingServerlessRaw === false ? false : true;
  const desiredServerlessNormalized = desiredServerlessRaw === false ? false : true;
  const rows = [
    { field: "imageName", equal: text(existing?.imageName) === text(desired?.imageName), existing: text(existing?.imageName) || null, desired: text(desired?.imageName) || null },
    { field: "containerDiskInGb", equal: finite(existing?.containerDiskInGb, 0) === finite(desired?.containerDiskInGb, 0), existing: finite(existing?.containerDiskInGb, 0), desired: finite(desired?.containerDiskInGb, 0) },
    { field: "containerRegistryAuthConfigured", equal: Boolean(text(existing?.containerRegistryAuthId)) === Boolean(text(desired?.containerRegistryAuthId)), existing: Boolean(text(existing?.containerRegistryAuthId)), desired: Boolean(text(desired?.containerRegistryAuthId)) },
    { field: "dockerEntrypoint", equal: sameArray(existing?.dockerEntrypoint, desired?.dockerEntrypoint), existing: list(existing?.dockerEntrypoint), desired: list(desired?.dockerEntrypoint) },
    { field: "dockerStartCmd", equal: sameArray(existing?.dockerStartCmd, desired?.dockerStartCmd), existing: list(existing?.dockerStartCmd), desired: list(desired?.dockerStartCmd) },
    { field: "environment", equal: env.key_set_equal && env.per_key.every((entry) => entry.value_equal), existing: { keys: env.existing_keys }, desired: { keys: env.desired_keys } },
    { field: "isPublic", equal: (existing?.isPublic === true) === (desired?.isPublic === true), existing: existing?.isPublic === true, desired: desired?.isPublic === true },
    { field: "isServerless", equal: existingServerlessNormalized === desiredServerlessNormalized, existing: { raw_present: existingServerlessRaw !== undefined, normalized: existingServerlessNormalized }, desired: { raw_present: desiredServerlessRaw !== undefined, normalized: desiredServerlessNormalized } },
    { field: "volumeMountPath", equal: text(existing?.volumeMountPath) === text(desired?.volumeMountPath), existing: text(existing?.volumeMountPath) || null, desired: text(desired?.volumeMountPath) || null },
  ];
  return {
    all_safety_fields_equal: rows.every((row) => row.equal),
    mismatched_fields: rows.filter((row) => !row.equal).map((row) => row.field),
    fields: rows,
    environment: env,
    diagnostic_only_non_identity_fields: {
      existing_ports: list(existing?.ports),
      desired_ports: list(desired?.ports),
      ports_equal: sameArray(existing?.ports, desired?.ports),
      existing_readme_present: Boolean(text(existing?.readme)),
      desired_readme_present: Boolean(text(desired?.readme)),
    },
  };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const certificationId = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const evidence = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
const expectedImage = text(evidence?.immutable_image_reference);
if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(expectedImage)) {
  throw new Error(`${CONTRACT}_IMMUTABLE_IMAGE_EVIDENCE_INVALID`);
}

const [rawEndpoints, rawTemplates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
]);
const endpoints = normalizeRows(rawEndpoints, ["endpoints", "serverlessEndpoints"]);
const templates = normalizeRows(rawTemplates, ["templates"]);

const certification = endpoints.find((entry) => text(entry?.id) === certificationId && text(entry?.name) === CERTIFICATION_ENDPOINT_NAME);
if (!certification) throw new Error(`${CONTRACT}_CERTIFICATION_ENDPOINT_NOT_FOUND`);
const certificationTemplateId = text(certification?.templateId || certification?.template?.id);
const certificationTemplateList = templates.find((entry) => text(entry?.id) === certificationTemplateId);
if (!certificationTemplateList) throw new Error(`${CONTRACT}_CERTIFICATION_TEMPLATE_NOT_FOUND`);
const certificationTemplate = await rest(`/templates/${encodeURIComponent(certificationTemplateId)}`, managementKey);
if (text(certificationTemplate?.imageName) !== expectedImage) throw new Error(`${CONTRACT}_CERTIFICATION_IMAGE_DRIFT`);

const productionTemplates = templates.filter((entry) => text(entry?.name) === PRODUCTION_TEMPLATE_NAME);
if (productionTemplates.length !== 1) {
  console.log(JSON.stringify({
    success: false,
    contract: CONTRACT,
    mode: "READ_ONLY",
    reason: productionTemplates.length === 0 ? "PRODUCTION_TEMPLATE_NOT_FOUND" : "PRODUCTION_TEMPLATE_AMBIGUOUS",
    production_template_match_count: productionTemplates.length,
    generation_submitted: false,
    inference_performed: false,
    runpod_mutation_performed: false,
    secrets_printed: false,
  }, null, 2));
  process.exitCode = 2;
} else {
  const productionTemplateList = productionTemplates[0];
  const productionTemplateId = text(productionTemplateList?.id);
  const productionTemplateFull = await rest(`/templates/${encodeURIComponent(productionTemplateId)}`, managementKey);
  const desired = {
    containerDiskInGb: Math.max(1, finite(certificationTemplate?.containerDiskInGb, 5)),
    dockerEntrypoint: list(certificationTemplate?.dockerEntrypoint),
    dockerStartCmd: list(certificationTemplate?.dockerStartCmd),
    env: normalizeEnv(certificationTemplate?.env),
    imageName: expectedImage,
    isPublic: false,
    isServerless: true,
    name: PRODUCTION_TEMPLATE_NAME,
    ports: list(certificationTemplate?.ports),
    volumeMountPath: text(certificationTemplate?.volumeMountPath) || "/runpod-volume",
  };
  const registryAuthId = text(certificationTemplate?.containerRegistryAuthId);
  if (registryAuthId) desired.containerRegistryAuthId = registryAuthId;

  const listDiff = fieldDiff(productionTemplateList, desired);
  const fullDiff = fieldDiff(productionTemplateFull, desired);
  const consumers = endpoints
    .filter((entry) => text(entry?.templateId || entry?.template?.id) === productionTemplateId)
    .map((entry) => ({
      id: text(entry?.id),
      name: text(entry?.name),
      workers_min: finite(entry?.workersMin),
      workers_max: finite(entry?.workersMax),
      worker_rows: list(entry?.workers).length,
    }));
  const productionNamedEndpoints = endpoints
    .filter((entry) => text(entry?.name) === PRODUCTION_ENDPOINT_NAME)
    .map((entry) => ({ id: text(entry?.id), template_id: text(entry?.templateId || entry?.template?.id) }));

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "READ_ONLY",
    certification_endpoint_id: certificationId,
    certification_template_id: certificationTemplateId,
    production_template_id: productionTemplateId,
    production_template_name: PRODUCTION_TEMPLATE_NAME,
    production_template_consumer_count: consumers.length,
    production_template_consumers: consumers,
    production_named_endpoint_count: productionNamedEndpoints.length,
    production_named_endpoints: productionNamedEndpoints,
    list_record_diff: listDiff,
    full_record_diff: fullDiff,
    interpretation: fullDiff.all_safety_fields_equal
      ? "FULL_TEMPLATE_SAFETY_CONTRACT_MATCHES_LIST_RESPONSE_NORMALIZATION_ONLY"
      : consumers.length === 0
        ? "ORPHAN_TEMPLATE_HAS_REAL_SAFETY_FIELD_DRIFT_RECREATE_IS_POSSIBLE_AFTER_EXPLICIT_APPLY_GUARD"
        : "CONSUMED_TEMPLATE_HAS_REAL_SAFETY_FIELD_DRIFT_FAIL_CLOSED",
    generation_submitted: false,
    inference_performed: false,
    model_download_performed: false,
    runpod_mutation_performed: false,
    safe_lease_changed: false,
    image_endpoint_mutated: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_PRODUCTION_TEMPLATE_DRIFT_INSPECTION_V60=PASS");
}
