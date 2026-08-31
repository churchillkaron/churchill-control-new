import { spawn } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_GLOBAL_CACHED_MODEL_MIGRATION_V2";
const V1_SCRIPT = "scripts/migrate-avantiqo-code-runpod-global-cached-model-v1-local.mjs";
const V1_PASS = "AVANTIQO_CODE_RUNPOD_GLOBAL_CACHED_MODEL_MIGRATION_V1=PASS";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const MODEL_REFERENCE = "https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8:main";
const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";

const text = (value, maximum = 4000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];

async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error || body?.message || raw, 1200)}`);
  return body;
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_REST`);
}

async function graphql(query, key) {
  const body = await readJson(await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_GRAPHQL`);
  if (list(body.errors).length) throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${list(body.errors).map((entry) => text(entry?.message)).join(" | ")}`);
  return body;
}

function endpointVolumeIds(endpoint = {}) {
  const ids = [
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map((entry) => text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id)),
  ].filter(Boolean);
  return [...new Set(ids)];
}

function rows(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ["data", "items", "results", "networkVolumes", "volumes"]) if (Array.isArray(raw?.[key])) return raw[key];
  return [];
}

function stringList(value) {
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}

function runV1(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [V1_SCRIPT], {
      cwd,
      env: { ...process.env, NODE_ENV: "development", AVANTIQO_CODE_GLOBAL_CACHED_MODEL_MIGRATION_APPROVED: "YES" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { const value = chunk.toString("utf8"); stdout += value; process.stdout.write(value); });
    child.stderr.on("data", (chunk) => { const value = chunk.toString("utf8"); stderr += value; process.stderr.write(value); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: Number.isInteger(code) ? code : 1, stdout, stderr }));
  });
}

if (text(process.env.NODE_ENV).toLowerCase() === "production") throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
if (!key) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_KEY_REQUIRED`);

const query = `query AvantiqoCodeGlobalCachedModelRead { myself { endpoints { id name workersMin workersMax locations networkVolumeId networkVolumeIds { networkVolumeId dataCenterId } modelReferences } } }`;
const [endpointRest, graph, volumesRaw] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, key),
  graphql(query, key),
  rest("/networkvolumes", key),
]);
if (text(endpointRest.id) !== ENDPOINT_ID || text(endpointRest.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_ENDPOINT_IDENTITY_INVALID`);
const graphMatches = list(graph?.data?.myself?.endpoints).filter((entry) => text(entry?.id) === ENDPOINT_ID && text(entry?.name) === ENDPOINT_NAME);
if (graphMatches.length !== 1) throw new Error(`${CONTRACT}_GRAPH_ENDPOINT_RESOLUTION:${graphMatches.length}`);
const graphEndpoint = graphMatches[0];
const codeVolumes = rows(volumesRaw).filter((entry) => /avantiqo.*code.*cache/i.test(text(entry?.name)));
if (codeVolumes.length !== 1) throw new Error(`${CONTRACT}_ONE_CANONICAL_CODE_STORAGE_REQUIRED:${codeVolumes.length}`);
const attached = endpointVolumeIds(endpointRest);
const models = list(graphEndpoint.modelReferences).map((entry) => text(entry)).filter(Boolean);
const locations = stringList(graphEndpoint.locations ?? endpointRest.dataCenterIds);
const alreadyGlobal = attached.length === 0 && locations.length === 0 && models.length === 1 && models[0] === MODEL_REFERENCE;

if (alreadyGlobal) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    migration_performed: false,
    already_global_cached_model: true,
    endpoint_network_volume_attached: false,
    endpoint_datacenter_restricted: false,
    model_reference: MODEL_REFERENCE,
    canonical_code_storage_preserved: true,
    canonical_code_storage_id: text(codeVolumes[0]?.id),
    canonical_code_storage_name: text(codeVolumes[0]?.name),
    new_storage_created: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=PASS`);
  process.exit(0);
}

if (attached.length !== 1) throw new Error(`${CONTRACT}_PRE_MIGRATION_ENDPOINT_VOLUME_STATE_INVALID:${attached.length}`);
const result = await runV1(process.cwd());
if (result.exitCode !== 0) throw new Error(`${CONTRACT}_V1_MIGRATION_FAILED:${result.exitCode}`);
if (!result.stdout.includes(V1_PASS)) throw new Error(`${CONTRACT}_V1_PASS_MARKER_REQUIRED`);
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  migration_performed: true,
  endpoint_network_volume_attached: false,
  model_reference: MODEL_REFERENCE,
  canonical_code_storage_preserved: true,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
