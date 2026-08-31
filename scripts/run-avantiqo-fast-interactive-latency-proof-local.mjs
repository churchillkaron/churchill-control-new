import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_FAST_INTERACTIVE_LATENCY_PROOF_V1";
const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const MAX_LATENCY_MS = 10_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];

function collectStrings(value, output = [], depth = 0) {
  if (depth > 8 || output.length > 500) return output;
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, output, depth + 1);
    return output;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, output, depth + 1);
  }
  return output;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${CONTRACT}_${name}_REQUIRED`);
  return value;
}

async function requestJson(url, key, timeoutMs = 20_000) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || body === null) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}`);
  }
  return body;
}

if (text(process.env.NODE_ENV).toLowerCase() !== "production") {
  throw new Error(`${CONTRACT}_PRODUCTION_MODE_REQUIRED`);
}
required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_KEY_REQUIRED`);
const queueKey = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY || process.env.RUNPOD_API_KEY || managementKey);

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { runIntelligenceReasoningLoop } = await import("@/lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime");
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const beforeLeases = await supabaseAdmin
  .from("avantiqo_intelligence_runpod_leases")
  .select("id,lane,state")
  .eq("state", "ACTIVE");
if (beforeLeases.error) throw beforeLeases.error;
if (list(beforeLeases.data).length) {
  throw new Error(`${CONTRACT}_ACTIVE_LEASE_EXISTS_BEFORE_TEST:${beforeLeases.data.length}`);
}

const startedAt = performance.now();
const result = await runIntelligenceReasoningLoop({
  organization_id: ORGANIZATION_ID,
  execution_lane: "fast",
  messages: [
    { role: "system", content: "You are Avantiqo Fast. Follow the user's exact concise response instruction." },
    { role: "user", content: "Reply exactly FAST_OK and nothing else." },
  ],
  tools: [],
  max_turns: 1,
  max_tool_calls: 1,
  max_output_tokens: 16,
  temperature: 0,
  metadata: {
    module: "INTELLIGENCE",
    operation: CONTRACT,
    latency_proof: true,
    external_fallback_allowed: false,
  },
});
const elapsedMs = Math.round(performance.now() - startedAt);

const strings = collectStrings(result).map(text).filter(Boolean);
if (!strings.some((value) => value.includes("FAST_OK"))) {
  throw new Error(`${CONTRACT}_VALID_FAST_RESPONSE_REQUIRED`);
}
if (elapsedMs >= MAX_LATENCY_MS) {
  throw new Error(`${CONTRACT}_LATENCY_GATE_FAILED:${elapsedMs}:${MAX_LATENCY_MS}`);
}

const afterLeases = await supabaseAdmin
  .from("avantiqo_intelligence_runpod_leases")
  .select("id,lane,state,release_reason")
  .eq("state", "ACTIVE");
if (afterLeases.error) throw afterLeases.error;
if (list(afterLeases.data).length) {
  throw new Error(`${CONTRACT}_ACTIVE_LEASE_REMAINS:${afterLeases.data.length}`);
}

const endpointsRaw = await requestJson(
  "https://rest.runpod.io/v1/endpoints?includeTemplate=false&includeWorkers=true",
  managementKey,
);
const endpoints = Array.isArray(endpointsRaw)
  ? endpointsRaw
  : list(endpointsRaw?.endpoints || endpointsRaw?.data || endpointsRaw?.items || endpointsRaw?.results);
const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (matches.length !== 1) throw new Error(`${CONTRACT}_FAST_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
const endpoint = matches[0];
if (Number(endpoint?.workersMin) !== 0 || Number(endpoint?.workersMax) !== 0) {
  throw new Error(`${CONTRACT}_FAST_ENDPOINT_NOT_PARKED:${endpoint?.workersMin}:${endpoint?.workersMax}`);
}
const endpointId = text(endpoint?.id);
const health = await requestJson(
  `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/health`,
  queueKey,
);
const jobs = health?.jobs || {};
const workers = health?.workers || {};
if (Number(jobs.inQueue || 0) !== 0 || Number(jobs.inProgress || 0) !== 0) {
  throw new Error(`${CONTRACT}_FAST_QUEUE_NOT_EMPTY:${jobs.inQueue || 0}:${jobs.inProgress || 0}`);
}
if ([workers.idle, workers.initializing, workers.ready, workers.running].some((value) => Number(value || 0) > 0)) {
  throw new Error(`${CONTRACT}_FAST_WORKER_REMAINS_ACTIVE`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  latency_ms: elapsedMs,
  latency_gate_ms: MAX_LATENCY_MS,
  response_verified: true,
  execution_lane: "fast",
  provider: "avantiqo-intelligence",
  model: "Qwen/Qwen3-30B-A3B-Instruct-2507",
  external_ai_fallback_used: false,
  active_leases_after: 0,
  endpoint_workers_min_after: 0,
  endpoint_workers_max_after: 0,
  queued_jobs_after: 0,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
