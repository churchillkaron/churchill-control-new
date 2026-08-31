import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const CONTRACT = "AVANTIQO_BUSINESS_PARTNER_TWO_TURN_E2E_V1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const DEEP_ENDPOINT_NAME = "avantiqo-intelligence-v1";
const ALLOWED_PROVIDER_EVIDENCE = new Set([
  "avantiqo-intelligence",
  "avantiqo-local",
]);

const text = (value, limit = 12000) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(value, code) {
  if (!value) throw new Error(`${CONTRACT}_${code}`);
}

function walk(value, visit, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, seen);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    visit(key, entry);
    walk(entry, visit, seen);
  }
}

function assertOwnedEvidence(result, label) {
  const providerEvidence = object(result?.provider_evidence);
  const forbidden = [];
  walk(providerEvidence, (key, value) => {
    const normalizedKey = text(key, 100).toLowerCase();
    if (["external_fallback_used", "external_ai_fallback_used"].includes(normalizedKey) && value === true) {
      forbidden.push(`${normalizedKey}=true`);
    }
    if (["provider", "provider_id", "providerid"].includes(normalizedKey)) {
      const provider = text(value, 200);
      if (provider && !ALLOWED_PROVIDER_EVIDENCE.has(provider)) forbidden.push(`provider=${provider}`);
    }
  });
  assert(forbidden.length === 0, `${label}_EXTERNAL_PROVIDER_EVIDENCE:${forbidden.join(",")}`);
}

function assertHealthyTurn(result, label) {
  const decision = object(result?.decision);
  const response = text(decision.response_text, 20000);
  const intent = text(decision.intent, 120).toLowerCase();
  const executionReason = text(result?.execution?.reason, 500);
  assert(result?.success !== false, `${label}_SUCCESS_FALSE`);
  assert(response.length > 20, `${label}_RESPONSE_EMPTY`);
  assert(intent !== "runtime_unavailable", `${label}_RUNTIME_UNAVAILABLE`);
  assert(!/temporarily unavailable/i.test(response), `${label}_PUBLIC_UNAVAILABLE_MESSAGE`);
  assert(!/took too long/i.test(response), `${label}_PUBLIC_TIMEOUT_MESSAGE`);
  assert(!/OPERATOR_OWNED_INTELLIGENCE_UNAVAILABLE/i.test(executionReason), `${label}_OWNED_UNAVAILABLE_CODE`);
  assertOwnedEvidence(result, label);
  return { response, intent, decision };
}

async function requestJson(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) throw new Error(`${CONTRACT}_RUNPOD_HTTP_${response.status}`);
  return body;
}

async function verifyDeepRestState() {
  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 1000);
  const queueKey = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY || process.env.RUNPOD_API_KEY, 1000);
  assert(managementKey, "RUNPOD_MANAGEMENT_KEY_REQUIRED");
  assert(queueKey, "RUNPOD_QUEUE_KEY_REQUIRED");
  const rest = "https://rest.runpod.io/v1";
  const queue = "https://api.runpod.ai/v2";
  const deadline = Date.now() + 120000;
  let last = null;
  while (Date.now() < deadline) {
    const endpointsBody = await requestJson(`${rest}/endpoints?includeTemplate=false&includeWorkers=true`, managementKey);
    const endpoints = Array.isArray(endpointsBody)
      ? endpointsBody
      : list(endpointsBody?.endpoints || endpointsBody?.data || endpointsBody?.items || endpointsBody?.results);
    const matches = endpoints.filter((row) => text(row?.name, 300) === DEEP_ENDPOINT_NAME);
    assert(matches.length === 1, `DEEP_ENDPOINT_RESOLUTION:${matches.length}`);
    const endpoint = matches[0];
    const endpointId = text(endpoint?.id, 300);
    const health = await requestJson(`${queue}/${encodeURIComponent(endpointId)}/health`, queueKey);
    const jobs = object(health?.jobs);
    const queued = Number(jobs.inQueue ?? jobs.in_queue ?? 0);
    const inProgress = Number(jobs.inProgress ?? jobs.in_progress ?? 0);
    const workersMin = Number(endpoint?.workersMin ?? -1);
    const workersMax = Number(endpoint?.workersMax ?? -1);
    last = { workers_min: workersMin, workers_max: workersMax, queued, in_progress: inProgress };
    if (workersMin === 0 && workersMax === 0 && queued === 0 && inProgress === 0) return last;
    await sleep(2000);
  }
  throw new Error(`${CONTRACT}_DEEP_NOT_RESTING:${JSON.stringify(last)}`);
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { runSyntheticIntelligenceTurn } = await import("@/lib/operator/runtime/SyntheticIntelligenceTurnRuntime");

const staffResult = await supabaseAdmin
  .from("staff_accounts")
  .select("party_id,auth_user_id,role,active")
  .eq("active_organization_id", ORGANIZATION_ID)
  .eq("active", true)
  .not("party_id", "is", null)
  .order("role", { ascending: true })
  .limit(50);
if (staffResult.error) throw staffResult.error;
const staffRows = list(staffResult.data);
const staff = staffRows.find((row) => text(row?.role, 80).toUpperCase() === "OWNER") || staffRows[0];
assert(staff?.party_id, "STAFF_PARTY_REQUIRED");

const base = {
  organizationId: ORGANIZATION_ID,
  entityId: null,
  periodId: null,
  partyId: staff.party_id,
  actor: {
    id: staff.auth_user_id || null,
    partyId: staff.party_id,
    party_id: staff.party_id,
    role: staff.role || "OWNER",
  },
  role: staff.role || "OWNER",
  permissions: [],
  locale: "en",
  timezone: "Asia/Bangkok",
  source: "text",
  pathname: "/",
  longTermMemory: [],
};

const prompts = [
  "Act as my business partner. Explain the strongest business reason to keep our AI fail-closed rather than silently switching to an unapproved external AI provider. Keep the answer practical and concise.",
  "Good. What is the biggest downside of that approach, and how would you reduce that risk without using external AI?",
];

const startedAt = Date.now();
const firstStarted = Date.now();
const first = await runSyntheticIntelligenceTurn({
  ...base,
  message: prompts[0],
  agreementState: {},
  projectState: {},
  conversation: [],
});
const firstMs = Date.now() - firstStarted;
const firstHealthy = assertHealthyTurn(first, "TURN_1");

const conversation = [
  { role: "user", content: prompts[0] },
  { role: "assistant", content: firstHealthy.response },
];
const firstAgreement = object(first?.agreement_state || firstHealthy.decision.agreement_state);
const firstProject = object(firstHealthy.decision.project_state);

const secondStarted = Date.now();
const second = await runSyntheticIntelligenceTurn({
  ...base,
  message: prompts[1],
  agreementState: firstAgreement,
  projectState: firstProject,
  conversation,
});
const secondMs = Date.now() - secondStarted;
const secondHealthy = assertHealthyTurn(second, "TURN_2");

const activeLeaseResult = await supabaseAdmin
  .from("avantiqo_intelligence_runpod_leases")
  .select("id,lane,state")
  .eq("organization_id", ORGANIZATION_ID)
  .eq("state", "ACTIVE");
if (activeLeaseResult.error) throw activeLeaseResult.error;
assert(list(activeLeaseResult.data).length === 0, `ACTIVE_REQUEST_LEASES_REMAIN:${list(activeLeaseResult.data).length}`);

const restState = await verifyDeepRestState();

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  turns: [
    { pass: 1, intent: firstHealthy.intent, latency_ms: firstMs, response_chars: firstHealthy.response.length },
    { pass: 2, intent: secondHealthy.intent, latency_ms: secondMs, response_chars: secondHealthy.response.length },
  ],
  conversation_continuity_tested: true,
  owned_intelligence_only: true,
  external_ai_fallback_used: false,
  runtime_unavailable_seen: false,
  browser_timeout_contract_ms: 720000,
  request_scoped_active_leases_after_test: 0,
  deep_rest_state: restState,
  total_latency_ms: Date.now() - startedAt,
  mutation_requested: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
