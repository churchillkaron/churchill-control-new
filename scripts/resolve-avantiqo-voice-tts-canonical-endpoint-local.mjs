import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_TTS_CANONICAL_ENDPOINT_RESOLUTION_V1";
const REST = "https://rest.runpod.io/v1";
const POLICY_PATH = "config/avantiqo-runpod-safe-lease-policy.json";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function endpointsFrom(body) {
  if (Array.isArray(body)) return body;
  return list(body?.endpoints || body?.data || body?.items || body?.results);
}

const policy = JSON.parse(await readFile(POLICY_PATH, "utf8"));
if (text(policy?.contract) !== "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2") {
  throw new Error(`${CONTRACT}_SAFE_LEASE_POLICY_V2_REQUIRED`);
}
const endpointName = text(policy?.lanes?.["voice-tts"]);
if (endpointName !== "avantiqo-voice-tts-v1") {
  throw new Error(`${CONTRACT}_CANONICAL_NAME_INVALID:${endpointName || "NONE"}`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const response = await fetch(`${REST}/endpoints?includeTemplate=false&includeWorkers=true`, {
  headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" },
  signal: AbortSignal.timeout(30_000),
});
const raw = await response.text();
let body = null;
try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
if (!response.ok) {
  throw new Error(`${CONTRACT}_RUNPOD_HTTP_${response.status}`);
}

const matches = endpointsFrom(body).filter((endpoint) => text(endpoint?.name) === endpointName);
if (matches.length !== 1) {
  throw new Error(`${CONTRACT}_TARGET_RESOLUTION_FAILED:${endpointName}:matches=${matches.length}`);
}
const endpointId = text(matches[0]?.id);
if (!endpointId) throw new Error(`${CONTRACT}_ENDPOINT_ID_REQUIRED`);

const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID);
if (process.argv.includes("--id-only")) {
  process.stdout.write(endpointId);
} else {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: endpointId,
    endpoint_name: endpointName,
    configured_endpoint_matches_canonical: configuredEndpointId === endpointId,
    canonical_endpoint_authoritative_for_certification: true,
    mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }, null, 2));
}
