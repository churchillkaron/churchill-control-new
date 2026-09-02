import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { ModalClient } from "modal";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const CONTRACT = "AVANTIQO_OPERATOR_FAST_TWO_TURN_MODAL_E2E_V1";
const ORGANIZATION_ID = String(
  process.env.AVANTIQO_OPERATOR_E2E_ORGANIZATION_ID || "33336a72-acb5-474e-856b-8be0269360e2",
).trim();
const MODAL_APP = "avantiqo-intelligence-owned";
const DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1";
const INFRASTRUCTURE_PROVIDER = "MODAL_H100_ASYNC_V1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const WARM_LATENCY_LIMIT_MS = 4000;
const COLD_LATENCY_LIMIT_MS = 120000;
const ALLOWED_PROVIDER_EVIDENCE = new Set(["avantiqo-intelligence", "avantiqo-local"]);

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

function providerEvidenceSummary(result) {
  const providerEvidence = object(result?.provider_evidence);
  const providers = new Set();
  const models = new Set();
  const infrastructure = new Set();
  const forbidden = [];
  walk(providerEvidence, (key, value) => {
    const normalizedKey = text(key, 100).toLowerCase();
    if (["external_fallback_used", "external_ai_fallback_used"].includes(normalizedKey) && value === true) {
      forbidden.push(`${normalizedKey}=true`);
    }
    if (["provider", "provider_id", "providerid"].includes(normalizedKey)) {
      const provider = text(value, 300);
      if (provider) providers.add(provider);
      if (provider && !ALLOWED_PROVIDER_EVIDENCE.has(provider)) forbidden.push(`provider=${provider}`);
    }
    if (["model", "model_id", "modelid"].includes(normalizedKey)) {
      const model = text(value, 500);
      if (model) models.add(model);
    }
    if (["infrastructure_provider", "infrastructureprovider"].includes(normalizedKey)) {
      const provider = text(value, 300);
      if (provider) infrastructure.add(provider);
    }
  });
  return { providerEvidence, providers, models, infrastructure, forbidden };
}

function assertFastOwnedTurn(result, label) {
  const decision = object(result?.decision);
  const response = text(decision.response_text, 20000);
  const intent = text(decision.intent, 120).toLowerCase();
  const executionReason = text(result?.execution?.reason, 500);
  const supervision = object(result?.intelligence_supervision);
  const evidence = providerEvidenceSummary(result);

  assert(result?.success !== false, `${label}_SUCCESS_FALSE`);
  assert(response.length > 10, `${label}_RESPONSE_EMPTY`);
  assert(intent !== "runtime_unavailable", `${label}_RUNTIME_UNAVAILABLE`);
  assert(!/temporarily unavailable/i.test(response), `${label}_PUBLIC_UNAVAILABLE_MESSAGE`);
  assert(!/took too long/i.test(response), `${label}_PUBLIC_TIMEOUT_MESSAGE`);
  assert(!/OPERATOR_OWNED_INTELLIGENCE_UNAVAILABLE/i.test(executionReason), `${label}_OWNED_UNAVAILABLE_CODE`);
  assert(supervision.raw_reasoning_persisted === false, `${label}_RAW_REASONING_BOUNDARY_INVALID`);
  assert(supervision.owned_brief_used === false, `${label}_UNEXPECTED_DEEP_COGNITIVE_BRIEF`);
  assert(evidence.forbidden.length === 0, `${label}_EXTERNAL_PROVIDER_EVIDENCE:${evidence.forbidden.join(",")}`);

  if (evidence.models.size) {
    assert(!evidence.models.has(DEEP_MODEL), `${label}_DEEP_MODEL_EVIDENCE_FORBIDDEN`);
    assert(evidence.models.has(FAST_MODEL), `${label}_FAST_MODEL_EVIDENCE_REQUIRED`);
  }
  if (evidence.infrastructure.size) {
    assert(evidence.infrastructure.has(INFRASTRUCTURE_PROVIDER), `${label}_MODAL_H100_EVIDENCE_REQUIRED`);
  }

  return {
    response,
    intent,
    decision,
    providers: [...evidence.providers],
    models: [...evidence.models],
    infrastructure: [...evidence.infrastructure],
  };
}

function statsShape(stats) {
  return {
    backlog: finite(stats?.backlog),
    total_runners: finite(stats?.numTotalRunners),
  };
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
    const { getAvantiqoIntelligenceRuntimeConfiguration } = await import(
      "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js"
    );
    const runtime = getAvantiqoIntelligenceRuntimeConfiguration();
    assert(runtime?.runtime_ready === true, "MODAL_RUNTIME_NOT_READY");
    assert(runtime?.modal_only === true, "MODAL_ONLY_REQUIRED");
    assert(runtime?.infrastructure_provider === INFRASTRUCTURE_PROVIDER, "MODAL_H100_INFRASTRUCTURE_REQUIRED");
    assert(runtime?.infrastructure_fallback === null, "INFRASTRUCTURE_FALLBACK_FORBIDDEN");
    assert(runtime?.safe_lease_required_for_inference === false, "LEGACY_SAFE_LEASE_FORBIDDEN");
    assert(runtime?.modal_transport === DIRECT_TRANSPORT, "DIRECT_MODAL_TRANSPORT_REQUIRED");
    assert(runtime?.gpu === "H100", "H100_REQUIRED");
    assert(runtime?.max_gpu_containers_per_lane === 1, "MODAL_LANE_CONTAINER_LIMIT_INVALID");
    assert(runtime?.scale_to_zero === true, "MODAL_SCALE_TO_ZERO_REQUIRED");
    assert(runtime?.persistent_model_volume === false, "PERSISTENT_MODEL_VOLUME_FORBIDDEN");

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
      target_lane: "fast",
      target_model: FAST_MODEL,
      warm_latency_limit_ms: WARM_LATENCY_LIMIT_MS,
      cold_latency_limit_ms: COLD_LATENCY_LIMIT_MS,
      owned_intelligence_only: true,
      infrastructure_provider: runtime.infrastructure_provider,
      modal_only: runtime.modal_only,
      modal_transport: DIRECT_TRANSPORT,
      modal_gateway_used: false,
      modal_gpu: runtime.gpu,
      modal_fast: fastBefore,
      modal_deep: deepBefore,
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

    // Deliberately ordinary conversational prompts. These must remain on Fast.
    const prompts = [
      "State one concise benefit of fail-closed owned AI routing.",
      "Condense that to ten words.",
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
    const firstHealthy = assertFastOwnedTurn(first, "TURN_1");
    assert(firstMs <= COLD_LATENCY_LIMIT_MS, `TURN_1_COLD_LATENCY_EXCEEDED:${firstMs}`);

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
    const secondHealthy = assertFastOwnedTurn(second, "TURN_2");
    assert(secondMs <= WARM_LATENCY_LIMIT_MS, `TURN_2_WARM_LATENCY_EXCEEDED:${secondMs}`);

    const [fastAfterRaw, deepAfterRaw] = await Promise.all([
      fastWorker.getCurrentStats(),
      deepWorker.getCurrentStats(),
    ]);
    const fastAfter = statsShape(fastAfterRaw);
    const deepAfter = statsShape(deepAfterRaw);
    assert(fastAfter.backlog === 0, `FAST_MODAL_BACKLOG_AFTER_TEST:${fastAfter.backlog}`);
    assert(deepAfter.backlog === 0, `DEEP_MODAL_BACKLOG_AFTER_TEST:${deepAfter.backlog}`);
    assert(fastAfter.total_runners <= 1, `FAST_MODAL_RUNNER_LIMIT_AFTER_TEST:${fastAfter.total_runners}`);
    assert(deepAfter.total_runners === deepBefore.total_runners,
      `DEEP_MODAL_RUNNER_CHANGED_DURING_FAST_CERT:${deepBefore.total_runners}->${deepAfter.total_runners}`);

    console.log(JSON.stringify({
      success: true,
      contract: CONTRACT,
      phase: "EXECUTE",
      target_lane: "fast",
      target_model: FAST_MODEL,
      turns: [
        {
          pass: 1,
          intent: firstHealthy.intent,
          latency_ms: firstMs,
          response_chars: firstHealthy.response.length,
          owned_brief_used: false,
          provider_models: firstHealthy.models,
        },
        {
          pass: 2,
          intent: secondHealthy.intent,
          latency_ms: secondMs,
          response_chars: secondHealthy.response.length,
          owned_brief_used: false,
          provider_models: secondHealthy.models,
          warm_latency_limit_ms: WARM_LATENCY_LIMIT_MS,
          warm_latency_pass: secondMs <= WARM_LATENCY_LIMIT_MS,
        },
      ],
      conversation_continuity_tested: true,
      owned_intelligence_only: true,
      direct_modal_used: true,
      modal_only: true,
      modal_transport: DIRECT_TRANSPORT,
      modal_gateway_used: false,
      modal_fast_after: fastAfter,
      modal_deep_before: deepBefore,
      modal_deep_after: deepAfter,
      deep_lane_untouched: deepAfter.total_runners === deepBefore.total_runners,
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
