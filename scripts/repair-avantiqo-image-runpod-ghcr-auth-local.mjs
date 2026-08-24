import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V1";
const REGISTRY_AUTH_NAME = "avantiqo-ghcr";
const CONTRACT = "AVANTIQO_IMAGE_RUNPOD_GHCR_AUTH_REPAIR_V1";

function text(value) {
  return String(value ?? "").trim();
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase());
}
function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}
function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = value[key];
    if (Array.isArray(nested)) return nested;
    const normalized = normalizeListResponse(nested, candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}
function normalizeRegistryAuthResponse(value) {
  return normalizeListResponse(value, [
    "containerRegistryAuths",
    "containerRegistryCreds",
    "registryAuths",
    "registryCredentials",
    "credentials",
    "auths",
  ]) || [];
}
function resolveExistingAuth(rows) {
  const exact = rows.filter((item) => text(item?.name) === REGISTRY_AUTH_NAME);
  if (exact.length === 1) return { auth: exact[0], source: "CANONICAL_NAME" };
  if (exact.length > 1) throw new Error(`AVANTIQO_IMAGE_GHCR_AUTH_AMBIGUOUS:matches=${exact.length}`);
  const candidates = rows.filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (candidates.length === 1) return { auth: candidates[0], source: "GHCR_NAME_MATCH" };
  if (candidates.length > 1) throw new Error(`AVANTIQO_IMAGE_GHCR_AUTH_AMBIGUOUS:matches=${candidates.length}`);
  return { auth: null, source: "MISSING" };
}
function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
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
function assertFullyIdle(counters) {
  const jobs = counters.jobs.in_queue + counters.jobs.in_progress;
  const workers = Object.values(counters.workers).reduce((sum, value) => sum + finite(value, 0), 0);
  if (jobs !== 0 || workers !== 0) {
    throw new Error(`AVANTIQO_IMAGE_GHCR_AUTH_REQUIRES_ZERO_ACTIVITY:jobs=${jobs}:workers=${workers}`);
  }
}
function templateBody(template, authId) {
  const body = {
    containerDiskInGb: finite(template.containerDiskInGb, 30),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName: text(template.imageName),
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
    containerRegistryAuthId: text(authId),
  };
  if (!body.name) throw new Error("AVANTIQO_IMAGE_GHCR_TEMPLATE_NAME_REQUIRED");
  if (!body.imageName) throw new Error("AVANTIQO_IMAGE_GHCR_TEMPLATE_IMAGE_REQUIRED");
  return body;
}
function comparableTemplate(body) {
  return {
    containerDiskInGb: finite(body.containerDiskInGb, 30),
    dockerEntrypoint: list(body.dockerEntrypoint),
    dockerStartCmd: list(body.dockerStartCmd),
    env: normalizeEnv(body.env),
    imageName: text(body.imageName),
    isPublic: body.isPublic === true,
    name: text(body.name),
    ports: list(body.ports),
    readme: text(body.readme),
    volumeInGb: finite(body.volumeInGb, 0),
    volumeMountPath: text(body.volumeMountPath),
  };
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}
async function rest(path, key, options = {}) {
  return readJson(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_REST");
}
async function health(endpointId, key) {
  return readJson(await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_HEALTH");
}
async function evidence() {
  const parsed = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  if (
    parsed?.success !== true ||
    parsed?.contract !== EVIDENCE_CONTRACT ||
    parsed?.source_sha_matches_trigger !== true ||
    text(parsed?.entrypoint) !== "handler_v3.py"
  ) {
    throw new Error("AVANTIQO_IMAGE_IMMUTABLE_WORKER_IMAGE_EVIDENCE_INVALID");
  }
  const reference = text(parsed?.immutable_image_reference);
  const match = reference.match(/^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/i);
  if (!match) throw new Error("AVANTIQO_IMAGE_IMMUTABLE_GHCR_REFERENCE_REQUIRED");
  return { reference, repository: match[1], digest: match[2] };
}
async function anonymousPullProof(image) {
  try {
    const tokenUrl = new URL("https://ghcr.io/token");
    tokenUrl.searchParams.set("service", "ghcr.io");
    tokenUrl.searchParams.set("scope", `repository:${image.repository}:pull`);
    const tokenResponse = await fetch(tokenUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const tokenBody = object(await tokenResponse.json().catch(() => ({})));
    const registryToken = text(tokenBody.token || tokenBody.access_token);
    if (!tokenResponse.ok || !registryToken) {
      return { public_pull: false, token_status: tokenResponse.status, manifest_status: null };
    }
    const manifestResponse = await fetch(
      `https://ghcr.io/v2/${image.repository}/manifests/${encodeURIComponent(image.digest)}`,
      {
        headers: {
          Authorization: `Bearer ${registryToken}`,
          Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    const contentDigest = text(manifestResponse.headers.get("docker-content-digest"));
    await manifestResponse.arrayBuffer();
    const digestMatches = !contentDigest || contentDigest.toLowerCase() === image.digest.toLowerCase();
    return {
      public_pull: manifestResponse.ok && digestMatches,
      token_status: tokenResponse.status,
      manifest_status: manifestResponse.status,
      digest_matches: digestMatches,
    };
  } catch (error) {
    return {
      public_pull: false,
      token_status: null,
      manifest_status: null,
      network_error: text(error?.cause?.code || error?.code || error?.message).slice(0, 120),
    };
  }
}
function runGh(args, errorCode, secret = false) {
  const result = spawnSync("gh", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = secret ? "COMMAND_FAILED" : text(result.stderr || result.stdout).slice(0, 300);
    throw new Error(`${errorCode}:${detail || `exit=${result.status}`}`);
  }
  const output = text(result.stdout);
  if (!output) throw new Error(`${errorCode}:EMPTY_OUTPUT`);
  return output;
}
async function authenticatedPullProof(username, githubToken, image) {
  const tokenUrl = new URL("https://ghcr.io/token");
  tokenUrl.searchParams.set("service", "ghcr.io");
  tokenUrl.searchParams.set("scope", `repository:${image.repository}:pull`);
  const basic = Buffer.from(`${username}:${githubToken}`, "utf8").toString("base64");
  const tokenResponse = await fetch(tokenUrl, {
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const tokenBody = object(await tokenResponse.json().catch(() => ({})));
  if (!tokenResponse.ok) throw new Error(`AVANTIQO_IMAGE_GHCR_PULL_TOKEN_REJECTED:status=${tokenResponse.status}`);
  const registryToken = text(tokenBody.token || tokenBody.access_token);
  if (!registryToken) throw new Error("AVANTIQO_IMAGE_GHCR_PULL_TOKEN_MISSING");
  const manifestResponse = await fetch(
    `https://ghcr.io/v2/${image.repository}/manifests/${encodeURIComponent(image.digest)}`,
    {
      headers: {
        Authorization: `Bearer ${registryToken}`,
        Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!manifestResponse.ok) throw new Error(`AVANTIQO_IMAGE_GHCR_IMMUTABLE_PULL_PROOF_FAILED:status=${manifestResponse.status}`);
  const contentDigest = text(manifestResponse.headers.get("docker-content-digest"));
  await manifestResponse.arrayBuffer();
  if (contentDigest && contentDigest.toLowerCase() !== image.digest.toLowerCase()) {
    throw new Error("AVANTIQO_IMAGE_GHCR_IMMUTABLE_PULL_DIGEST_MISMATCH");
  }
}

const apply = process.argv.includes("--apply");
const approved = yes(process.env.AVANTIQO_IMAGE_RUNPOD_GHCR_AUTH_APPROVED);
if (apply && !approved) throw new Error("AVANTIQO_IMAGE_RUNPOD_GHCR_AUTH_APPROVED=YES_REQUIRED");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const image = await evidence();

console.log(`AVANTIQO_IMAGE_GHCR_AUTH_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_GHCR_AUTH_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_GHCR_AUTH_MODEL_DOWNLOAD_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_GHCR_AUTH_VOLUME_MUTATION=false");
console.log("AVANTIQO_IMAGE_GHCR_AUTH_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_GHCR_AUTH_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_GHCR_AUTH_SECRETS_PRINTED=false");

const [endpoints, templates, authResponse, publicProof] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/containerregistryauth", managementKey),
  anonymousPullProof(image),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");

let endpoint = null;
let endpointResolution = null;
if (configuredEndpointId) {
  const matches = endpoints.filter((candidate) => text(candidate?.id) === configuredEndpointId);
  if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_IMAGE_GHCR_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
  }
  endpoint = matches[0];
  endpointResolution = "ENV_VERIFIED";
} else {
  const matches = endpoints.filter((candidate) => text(candidate?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_GHCR_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  endpoint = matches[0];
  endpointResolution = "EXACT_NAME";
}
const endpointId = text(endpoint.id);
const templateId = text(endpoint?.templateId || endpoint?.template?.id);
if (!templateId) throw new Error("AVANTIQO_IMAGE_GHCR_TEMPLATE_ID_REQUIRED");
const template = templates.find((candidate) => text(candidate?.id) === templateId) || object(endpoint.template);
if (!text(template?.id)) throw new Error("AVANTIQO_IMAGE_GHCR_TEMPLATE_NOT_FOUND");
if (text(template.imageName) !== image.reference) {
  throw new Error("AVANTIQO_IMAGE_GHCR_IMMUTABLE_IMAGE_NOT_BOUND");
}
const consumers = endpoints.filter((candidate) => text(candidate?.templateId || candidate?.template?.id) === templateId);
if (consumers.length !== 1 || text(consumers[0]?.id) !== endpointId) {
  throw new Error(`AVANTIQO_IMAGE_GHCR_TEMPLATE_NOT_EXCLUSIVE:consumers=${consumers.length}`);
}
const counters = healthCounters(await health(endpointId, inferenceKey));
assertFullyIdle(counters);
const authRows = normalizeRegistryAuthResponse(authResponse);
const existing = resolveExistingAuth(authRows);
const boundAuthId = text(template.containerRegistryAuthId);
const boundAuthExists = boundAuthId && authRows.some((item) => text(item?.id) === boundAuthId);

let nextAction = "RUN_SHARED_IMAGE_CACHE_PROBE";
if (!publicProof.public_pull && !boundAuthExists && existing.auth) nextAction = "BIND_EXISTING_RUNPOD_GHCR_AUTH";
if (!publicProof.public_pull && !boundAuthExists && !existing.auth) nextAction = "CREATE_AND_BIND_RUNPOD_GHCR_AUTH";

const base = {
  success: publicProof.public_pull || Boolean(boundAuthExists),
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_resolution: endpointResolution,
  immutable_image_reference: image.reference,
  anonymous_pull_proof: publicProof,
  template_registry_auth_configured: Boolean(boundAuthId),
  template_registry_auth_resolves: Boolean(boundAuthExists),
  canonical_registry_auth_exists: Boolean(existing.auth),
  canonical_registry_auth_resolution: existing.source,
  health: counters,
  mutation_performed: false,
  registry_auth_created: false,
  registry_auth_bound: false,
  generation_submitted: false,
  model_download_submitted: false,
  volume_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  next_action: nextAction,
};

if (publicProof.public_pull) {
  console.log("AVANTIQO_IMAGE_GHCR_PUBLIC_PULL=YES");
  console.log(JSON.stringify({ ...base, success: true }, null, 2));
  process.exit(0);
}
if (boundAuthExists) {
  console.log("AVANTIQO_IMAGE_GHCR_AUTH=ALREADY_BOUND");
  console.log(JSON.stringify({ ...base, success: true }, null, 2));
  process.exit(0);
}
if (!apply) {
  console.log(`AVANTIQO_IMAGE_GHCR_AUTH_PLAN=${nextAction}`);
  console.log(JSON.stringify(base, null, 2));
  process.exit(0);
}

let auth = existing.auth;
let created = false;
if (!auth) {
  const username = runGh(["api", "user", "--jq", ".login"], "AVANTIQO_LOCAL_GH_LOGIN_REQUIRED");
  const githubToken = runGh(["auth", "token", "-h", "github.com"], "AVANTIQO_LOCAL_GH_TOKEN_REQUIRED", true);
  await authenticatedPullProof(username, githubToken, image);
  const createdAuth = object(await rest("/containerregistryauth", managementKey, {
    method: "POST",
    body: { name: REGISTRY_AUTH_NAME, username, password: githubToken },
  }));
  if (!text(createdAuth.id)) throw new Error("AVANTIQO_IMAGE_GHCR_AUTH_CREATE_ID_MISSING");
  auth = createdAuth;
  created = true;
}
const authId = text(auth.id);
if (!authId) throw new Error("AVANTIQO_IMAGE_GHCR_AUTH_ID_REQUIRED");

// Refetch exact state immediately before template mutation.
const [freshEndpoints, freshTemplates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
]);
const freshEndpoint = freshEndpoints.find((candidate) => text(candidate?.id) === endpointId);
if (!freshEndpoint || text(freshEndpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_GHCR_ENDPOINT_CHANGED_REPLAN_REQUIRED");
}
if (text(freshEndpoint?.templateId || freshEndpoint?.template?.id) !== templateId) {
  throw new Error("AVANTIQO_IMAGE_GHCR_TEMPLATE_CHANGED_REPLAN_REQUIRED");
}
const freshTemplate = freshTemplates.find((candidate) => text(candidate?.id) === templateId) || object(freshEndpoint.template);
if (text(freshTemplate.imageName) !== image.reference) {
  throw new Error("AVANTIQO_IMAGE_GHCR_IMAGE_CHANGED_REPLAN_REQUIRED");
}
assertFullyIdle(healthCounters(await health(endpointId, inferenceKey)));

const beforeComparable = comparableTemplate(templateBody(freshTemplate, text(freshTemplate.containerRegistryAuthId)));
const desired = templateBody(freshTemplate, authId);
if (JSON.stringify(beforeComparable) !== JSON.stringify(comparableTemplate(desired))) {
  throw new Error("AVANTIQO_IMAGE_GHCR_AUTH_ATTEMPTED_NON_AUTH_TEMPLATE_CHANGE");
}
await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
  method: "POST",
  body: desired,
});
const verifiedTemplates = await rest(
  "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
  managementKey,
);
const verified = verifiedTemplates.find((candidate) => text(candidate?.id) === templateId);
if (!verified) throw new Error("AVANTIQO_IMAGE_GHCR_AUTH_VERIFY_TEMPLATE_MISSING");
if (text(verified.containerRegistryAuthId) !== authId) {
  throw new Error("AVANTIQO_IMAGE_GHCR_AUTH_BIND_VERIFY_FAILED");
}
if (text(verified.imageName) !== image.reference) {
  throw new Error("AVANTIQO_IMAGE_GHCR_AUTH_IMAGE_CHANGED_UNEXPECTEDLY");
}

console.log("AVANTIQO_IMAGE_GHCR_AUTH_REPAIR=COMPLETE");
console.log(JSON.stringify({
  ...base,
  success: true,
  mode: "APPLY",
  template_registry_auth_configured: true,
  template_registry_auth_resolves: true,
  canonical_registry_auth_exists: true,
  mutation_performed: true,
  registry_auth_created: created,
  registry_auth_bound: true,
  next_action: "RUN_SHARED_IMAGE_CACHE_PROBE",
}, null, 2));
