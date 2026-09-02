import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { ModalClient } from "modal";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const CONTRACT = "AVANTIQO_BUSINESS_PARTNER_TWO_TURN_MODAL_E2E_V2";
const ORGANIZATION_ID =
  String(process.env.AVANTIQO_OPERATOR_E2E_ORGANIZATION_ID || "33336a72-acb5-474e-856b-8be0269360e2").trim();
const MODAL_APP = "avantiqo-intelligence-owned";
const DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1";
const ALLOWED_PROVIDER_EVIDENCE = new Set([
  "avantiqo-intelligence",
  "avantiqo-local",
]);

const text = (value, limit = 12000) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());

function assert(value, code) {
  if (!value) throw new Error(`${CONTRACT}_${code}`);
}

function mode() {
  const execute = process.argv.includes("--execute");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--execute");
  if (unknown.length) throw new Error(`${CONTRACT}_INVALID_ARGUMENT:${unknown[0]}`);
  return execute ? "EXECUTE" : "PREFLIGHT";
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
  assert(object(result?.intelligence_supervision).raw_reasoning_persisted === false, `${label}_RAW_REASONING_BOUNDARY_INVALID`);
  assertOwnedEvidence(result, label);
  return { response, intent, decision };
}

function statsShape(stats) {
  return {
    backlog: finite(stats?.backlog),
    total_runners: finite(stats?.numTotalRunners),
  };
}

async function activeRunPodLeaseCount(supabaseAdmin) {
  const result = await supabaseAdmin
    .from("avantiqo_intelligence_runpod_leases")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORGANIZATION_ID)
    .eq("state", "ACTIVE");
  if (result.error) throw result.error;
  return Number(result.count || 0);
}

async function main() {
  const runMode = mode();
  assert(ORGANIZATION_ID, "ORGANIZATION_REQUIRED");
  assert(!text(process.env.AVANTIQO_INTELLIGENCE_MODAL_BASE_URL), "LEGACY_MODAL_GATEWAY_URL_FORBIDDEN");
  assert(!text(process.env.AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN), "LEGACY_MODAL_GATEWAY_TOKEN_FORBIDDEN");

  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID, 500);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET, 1000);
  assert(tokenId && tokenSecret, "MODAL_DIRECT_CREDENTIALS_REQUIRED");
  const modalEnvironment = text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT, 120);
  const modal = new ModalClient({ tokenId, tokenSecret });
  const lookupOptions = modalEnvironment ? { environment: modalEnvironment } : {};

  try {
    const [fastWorker, deepWorker] = await Promise.all([
      modal.functions.fromName(MODAL_APP, "fast", lookupOptions),
      modal.functions.fromName(MODAL_APP, "deep", lookupOptions),
    ]);
    const [fastBeforeRaw, deepBeforeRaw] = await Promise.all([
      fastWorker.getCurrentStats(),
      deepWorker.getCurrentStats(),
    ]);
    const fastBefore = statsShape(fastBeforeRaw);
    const deepBefore = statsShape(deepBeforeRaw);
    assert(fastBefore.backlog === 0, `FAST_MODAL_BACKLOG_NOT_ZERO:${fastBefore.backlog}`);
    assert(deepBefore.backlog === 0, `DEEP_MODAL_BACKLOG_NOT_ZERO:${deepBefore.backlog}`);
    assert(fastBefore.total_runners <= 1, `FAST_MODAL_RUNNER_LIMIT_INVALID:${fastBefore.total_runners}`);
    assert(deepBefore.total_runners <= 1, `DEEP_MODAL_RUNNER_LIMIT_INVALID:${deepBefore.total_runners}`);

    const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
    const { runSyntheticIntelligenceTurn } = await import("@/lib/operator/runtime/SyntheticIntelligenceTurnRuntime");
    const leasesBefore = await activeRunPodLeaseCount(supabaseAdmin);
    assert(leasesBefore === 0, `ACTIVE_RUNPOD_REQUEST_LEASES_BEFORE_TEST:${leasesBefore}`);

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

    console.log(JSON.stringify({
      success: true,
      contract: CONTRACT,
      phase: "PREFLIGHT",
      mode: runMode,
      modal_app: MODAL_APP,
      modal_transport: DIRECT_TRANSPORT,
      modal_gateway_used: false,
      modal_fast: fastBefore,
      modal_deep: deepBefore,
      active_runpod_request_leases: leasesBefore,
      runpod_api_called: false,
      gpu_inference_performed: false,
      external_ai_fallback_used: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }, null, 2));
    console.log(`${CONTRACT}_PREFLIGHT=PASS`);

    if (runMode === "PREFLIGHT") return;
    assert(yes(process.env.AVANTIQO_OPERATOR_MODAL_E2E_REAL_INFERENCE_APPROVED),
      "AVANTIQO_OPERATOR_MODAL_E2E_REAL_INFERENCE_APPROVED=YES_REQUIRED");
    assert(text(process.env.NODE_ENV, 40).toLowerCase() === "development", "DEVELOPMENT_ENV_REQUIRED");

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
      "Think deeply as my business partner. Explain the strongest practical reason to keep our AI fail-closed rather than silently switching to an unapproved external AI provider. Give me a concise recommendation, not private reasoning.",
      "Good. Summarize that recommendation in one concise sentence for me.",
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
    assert(object(first?.intelligence_supervision).owned_brief_used === true, "TURN_1_DEEP_COGNITIVE_BRIEF_REQUIRED");

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

    const leasesAfter = await activeRunPodLeaseCount(supabaseAdmin);
    assert(leasesAfter === 0, `ACTIVE_RUNPOD_REQUEST_LEASES_AFTER_TEST:${leasesAfter}`);

    const [fastAfterRaw, deepAfterRaw] = await Promise.all([
      fastWorker.getCurrentStats(),
      deepWorker.getCurrentStats(),
    ]);
    const fastAfter = statsShape(fastAfterRaw);
    const deepAfter = statsShape(deepAfterRaw);
    assert(fastAfter.backlog === 0, `FAST_MODAL_BACKLOG_AFTER_TEST:${fastAfter.backlog}`);
    assert(deepAfter.backlog === 0, `DEEP_MODAL_BACKLOG_AFTER_TEST:${deepAfter.backlog}`);
    assert(fastAfter.total_runners <= 1, `FAST_MODAL_RUNNER_LIMIT_AFTER_TEST:${fastAfter.total_runners}`);
    assert(deepAfter.total_runners <= 1, `DEEP_MODAL_RUNNER_LIMIT_AFTER_TEST:${deepAfter.total_runners}`);

    console.log(JSON.stringify({
      success: true,
      contract: CONTRACT,
      phase: "EXECUTE",
      turns: [
        {
          pass: 1,
          intent: firstHealthy.intent,
          latency_ms: firstMs,
          response_chars: firstHealthy.response.length,
          deep_cognitive_brief_used: true,
        },
        {
          pass: 2,
          intent: secondHealthy.intent,
          latency_ms: secondMs,
          response_chars: secondHealthy.response.length,
        },
      ],
      conversation_continuity_tested: true,
      owned_intelligence_only: true,
      direct_modal_used: true,
      modal_transport: DIRECT_TRANSPORT,
      modal_gateway_used: false,
      modal_fast_after: fastAfter,
      modal_deep_after: deepAfter,
      runpod_api_called: false,
      active_runpod_request_leases_after_test: leasesAfter,
      external_ai_fallback_used: false,
      runtime_unavailable_seen: false,
      raw_reasoning_persisted: false,
      total_latency_ms: Date.now() - startedAt,
      mutation_requested: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }, null, 2));
    console.log(`${CONTRACT}=PASS`);
  } finally {
    modal.close();
  }
}

await main();