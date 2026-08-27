import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_INTELLIGENCE_COGNITION_RUNTIME_CERTIFICATION_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-deep";
const OWNED_PROVIDER = "avantiqo-intelligence";
const REASONING_SERVICE = "ai.reasoning.execute";
const READ_BRIDGE_CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_READ_TOOL_BRIDGE_V1";
const RESEARCH_CAPABILITY = "platform.research.search";
const MAX_PROVIDER_REQUESTS = 5;
const DEFAULT_MAX_PROJECTED_CUSTOMER_CHARGE = 5;
const OUTPUT = resolve(
  process.env.AVANTIQO_INTELLIGENCE_COGNITION_CERT_OUTPUT ||
    "/tmp/avantiqo-intelligence-cognition-runtime-certification.json",
);
const TRACE_ID = `avantiqo-cognition-cert-${randomUUID()}`;
const BENCHMARK_POLICY = Object.freeze({
  allowed_providers: [OWNED_PROVIDER],
  execution_scope: "BENCHMARK_REVIEW_PREVIEW",
  benchmark_only: true,
  owned_only_required: true,
  external_fallback_allowed: false,
});
const CERTIFICATION_CRITICAL_PATHS = Object.freeze([
  "scripts/run-avantiqo-intelligence-cognition-runtime-certification-local.mjs",
  "scripts/run-avantiqo-intelligence-cognition-runtime-certification-platform-local.mjs",
  "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
  "config/avantiqo-runpod-safe-lease-policy.json",
  "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js",
  "lib/intelligence/runtime/AvantiqoEpistemicCompletionGateRuntime.mjs",
  "lib/intelligence/runtime/AvantiqoInvocationEpistemicRoleRuntime.mjs",
  "lib/intelligence/runtime/AvantiqoResearchEvidencePayloadRuntime.mjs",
  "lib/intelligence/runtime/AvantiqoResearchMarginalUtilityRuntime.mjs",
  "lib/intelligence/runtime/IntelligenceToolRegistry.js",
  "lib/platform/service-runtime/execution/ServiceExecutionRuntime.js",
  "lib/platform/service-runtime/providers/ProviderResolver.js",
  "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js",
  "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceSafeLeaseGuard.js",
  "lib/platform/service-runtime/pricing/PricingRuntime.js",
  "lib/platform/service-runtime/wallet/repositories/WalletRepository.js",
]);
let mainValidation = null;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function upper(value) {
  return text(value, 120).toUpperCase();
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(upper(value));
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 900)}`);
  }
  return text(result.stdout, 1000);
}

function shellSucceeded(name, args) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_COGNITION_CERT_GIT_FETCH_FAILED");
  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_COGNITION_CERT_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(`AVANTIQO_COGNITION_CERT_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_COGNITION_CERT_GIT_HEAD_FAILED");
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    "AVANTIQO_COGNITION_CERT_GIT_REMOTE_FAILED",
  );
  const localCriticalChanges = shell(
    "git",
    ["diff", "--name-only", "--", ...CERTIFICATION_CRITICAL_PATHS],
    "AVANTIQO_COGNITION_CERT_LOCAL_CRITICAL_DIFF_FAILED",
  );
  const stagedCriticalChanges = shell(
    "git",
    ["diff", "--cached", "--name-only", "--", ...CERTIFICATION_CRITICAL_PATHS],
    "AVANTIQO_COGNITION_CERT_STAGED_CRITICAL_DIFF_FAILED",
  );
  if (localCriticalChanges || stagedCriticalChanges) {
    throw new Error("AVANTIQO_COGNITION_CERT_LOCAL_CRITICAL_PATHS_DIRTY");
  }
  if (head !== remote) {
    if (!shellSucceeded("git", ["merge-base", "--is-ancestor", head, remote])) {
      throw new Error("AVANTIQO_COGNITION_CERT_LOCAL_MAIN_DIVERGED");
    }
    const relevantRemoteChanges = shell(
      "git",
      [
        "diff",
        "--name-only",
        `${head}..${remote}`,
        "--",
        ...CERTIFICATION_CRITICAL_PATHS,
      ],
      "AVANTIQO_COGNITION_CERT_REMOTE_CRITICAL_DIFF_FAILED",
    );
    if (relevantRemoteChanges) {
      throw new Error(
        `AVANTIQO_COGNITION_CERT_RELEVANT_MAIN_ADVANCED:${relevantRemoteChanges.split("\n").filter(Boolean).length}`,
      );
    }
  }
  mainValidation = {
    local_main_commit: head,
    remote_main_commit_at_validation: remote,
    exact_remote_match: head === remote,
    irrelevant_remote_advance_tolerated: head !== remote,
    critical_paths_clean: true,
  };
  return head;
}

function benchmarkOrganizationId() {
  return text(
    process.env.AVANTIQO_INTELLIGENCE_COGNITION_CERT_ORGANIZATION_ID ||
      process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_ORGANIZATION_ID ||
      process.env.AVANTIQO_MUSIC_BENCHMARK_ORGANIZATION_ID,
    200,
  );
}

function executionMode() {
  const execute = process.argv.includes("--execute");
  const preflight = process.argv.includes("--preflight") || !execute;
  if (execute && process.argv.includes("--preflight")) {
    throw new Error("AVANTIQO_COGNITION_CERT_MODE_CONFLICT");
  }
  return preflight ? "PREFLIGHT" : "EXECUTE";
}

function requireExecutionApproval() {
  if (!yes(process.env.AVANTIQO_INTELLIGENCE_COGNITION_CERT_SPEND_APPROVED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_COGNITION_CERT_SPEND_APPROVED=YES_REQUIRED");
  }
  if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
    throw new Error("AVANTIQO_COGNITION_CERT_DEVELOPMENT_ENV_REQUIRED");
  }
}

function requireSafeLease() {
  if (upper(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE) !== "YES") {
    throw new Error("AVANTIQO_COGNITION_CERT_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_COGNITION_CERT_SAFE_LEASE_V2_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_COGNITION_CERT_SAFE_LEASE_LANE_MISMATCH");
  }
  const leasedEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 200);
  const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID, 200);
  if (!leasedEndpointId || !configuredEndpointId || leasedEndpointId !== configuredEndpointId) {
    throw new Error("AVANTIQO_COGNITION_CERT_SAFE_LEASE_ENDPOINT_MISMATCH");
  }
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160));
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 180_000) {
    throw new Error("AVANTIQO_COGNITION_CERT_SAFE_LEASE_EXPIRY_INSUFFICIENT");
  }
  return {
    contract: SAFE_LEASE_CONTRACT,
    lane: SAFE_LEASE_LANE,
    endpoint_binding_verified: true,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

function healthSummary(health = {}) {
  return {
    workers_running: finite(health?.workers?.running),
    workers_idle: finite(health?.workers?.idle),
    workers_initializing: finite(health?.workers?.initializing),
    jobs_in_queue: finite(health?.jobs?.inQueue ?? health?.jobs?.in_queue),
    jobs_in_progress: finite(health?.jobs?.inProgress ?? health?.jobs?.in_progress),
    latency_ms: finite(health?.latency_ms),
  };
}

function canonicalResearchPayload() {
  return {
    sources: [
      {
        url: "https://cert-a.invalid/evidence-one",
        official: false,
        primary: false,
      },
      {
        url: "https://cert-b.invalid/evidence-two",
        official: false,
        primary: false,
      },
    ],
    claims: [
      {
        claim: "Certification evidence is source backed.",
        verification_status: "SOURCE_BACKED",
        source_urls: ["https://cert-a.invalid/evidence-one"],
      },
    ],
    uncertainty: [],
    follow_up_queries: [],
    evidence: {
      provider_source_count: 2,
      returned_source_count: 2,
      web_search_observed: true,
    },
    evidence_graph: {
      conflicted_claim_count: 0,
      relevant_conflict_count: 0,
    },
  };
}

function certificationResearchTool({ organizationId, expectedCalls }) {
  let calls = 0;
  return {
    state: {
      count: () => calls,
    },
    tool: {
      name: "operator_live_read",
      description: [
        "Read deterministic certification research evidence through the canonical Operator read bridge.",
        `This certification case permits exactly ${expectedCalls} successful call(s).`,
        `Always use capability_key ${RESEARCH_CAPABILITY}.`,
        "This tool is read-only and grants no execution authority.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          capability_key: {
            type: "string",
            enum: [RESEARCH_CAPABILITY],
          },
        },
        required: ["capability_key"],
        additionalProperties: false,
      },
      mutates: false,
      approval_required: false,
      max_result_chars: 12000,
      async execute(args = {}) {
        if (text(args.capability_key, 300) !== RESEARCH_CAPABILITY) {
          throw new Error("AVANTIQO_COGNITION_CERT_RESEARCH_CAPABILITY_INVALID");
        }
        calls += 1;
        if (calls > expectedCalls) {
          throw new Error("AVANTIQO_COGNITION_CERT_TOOL_CALL_BUDGET_EXCEEDED");
        }
        return {
          contract: READ_BRIDGE_CONTRACT,
          status: "completed",
          capability_key: RESEARCH_CAPABILITY,
          organization_id: organizationId,
          entity_id: null,
          result: canonicalResearchPayload(),
        };
      },
    },
  };
}

function completionResult({ response, stopReason }) {
  return {
    response,
    goal_status: "completed",
    confidence: 1,
    self_check: { passed: true, issues: [] },
    repair_needed: false,
    next_step: null,
    epistemic_state: {
      information_sufficient: true,
      research_status: "satisfied",
      live_read_status: "not_required",
      verification_status: "not_required",
      conflict_status: "none",
      unresolved_contradictions: [],
      critical_assumptions: [],
      unresolved_questions: [],
      stop_reason: stopReason,
    },
  };
}

function researchRoute() {
  return {
    requirements: {
      research_required: true,
      live_read_required: false,
      verification_required: false,
    },
    signals: {
      mutation_intent: false,
      irreversible_intent: false,
    },
    reasons: [],
  };
}

function transcriptCalls(loop = {}) {
  return list(loop.transcript).flatMap((turn) => list(turn?.tool_calls));
}

function validateCase({
  id,
  loop,
  gate,
  expectedCalls,
  finalMarker,
  stopReason,
}) {
  const calls = transcriptCalls(loop);
  const researchCalls = calls.filter((call) =>
    list(call?.epistemic_roles).includes("research"),
  );
  const succeededResearchCalls = researchCalls.filter(
    (call) => text(call?.outcome, 40) === "succeeded",
  );
  const evidence = researchCalls.map((call) => object(call?.epistemic_evidence));
  const transcriptText = JSON.stringify(loop.transcript || []);
  const rawResearchLeaked =
    transcriptText.includes("cert-a.invalid") ||
    transcriptText.includes("cert-b.invalid") ||
    transcriptText.includes("Certification evidence is source backed");
  const allReadOnly = calls.every((call) => call?.mutates !== true);
  const evidenceSafe = evidence.every(
    (item) => item.raw_research_persisted === false,
  );
  const common = Boolean(
    loop?.success === true &&
      text(loop?.text, 200) === finalMarker &&
      calls.length === expectedCalls &&
      researchCalls.length === expectedCalls &&
      succeededResearchCalls.length === expectedCalls &&
      allReadOnly &&
      evidenceSafe &&
      !rawResearchLeaked &&
      gate?.goal_status === "completed" &&
      gate?.epistemic_state?.gate_passed === true &&
      gate?.epistemic_state?.research_tool_observed === true &&
      gate?.epistemic_state?.research_stop_proven === true &&
      gate?.epistemic_state?.stop_reason === stopReason
  );
  const stopSpecific = stopReason === "diminishing_returns"
    ? Boolean(
        gate?.epistemic_state?.diminishing_returns_proven === true &&
        gate?.epistemic_state?.diminishing_returns_evidence_reason ===
          "OBSERVED_ZERO_MARGINAL_RESEARCH_UTILITY" &&
        evidence.at(-1)?.research_round >= 2 &&
        evidence.at(-1)?.marginal_comparison_available === true
      )
    : gate?.epistemic_state?.research_stop_proven === true;

  return {
    id,
    passed: common && stopSpecific,
    expected_tool_calls: expectedCalls,
    observed_tool_calls: calls.length,
    successful_research_calls: succeededResearchCalls.length,
    all_tools_read_only: allReadOnly,
    raw_research_persisted: false,
    raw_research_identity_leaked_in_transcript: rawResearchLeaked,
    final_marker_exact: text(loop?.text, 200) === finalMarker,
    gate_passed: gate?.epistemic_state?.gate_passed === true,
    stop_reason: gate?.epistemic_state?.stop_reason || null,
    research_stop_proven: gate?.epistemic_state?.research_stop_proven === true,
    research_stop_evidence_reason:
      gate?.epistemic_state?.research_stop_evidence_reason || null,
    diminishing_returns_proven:
      gate?.epistemic_state?.diminishing_returns_proven === true,
    diminishing_returns_evidence_reason:
      gate?.epistemic_state?.diminishing_returns_evidence_reason || null,
    latest_research_round: evidence.at(-1)?.research_round || 0,
    latest_marginal_comparison_available:
      evidence.at(-1)?.marginal_comparison_available === true,
    usage: object(loop?.usage),
    turns: finite(loop?.turns),
  };
}

async function runCertificationCase({
  id,
  organizationId,
  expectedCalls,
  finalMarker,
  stopReason,
  systemInstruction,
  runIntelligenceReasoningLoop,
  applyAvantiqoEpistemicCompletionGate,
}) {
  const research = certificationResearchTool({ organizationId, expectedCalls });
  const loop = await runIntelligenceReasoningLoop({
    organization_id: organizationId,
    system: [
      "You are running a bounded Avantiqo Intelligence cognition certification protocol.",
      `Diagnostic trace: ${TRACE_ID}. Never repeat this trace in the answer.`,
      systemInstruction,
      `After the required successful tool calls, answer exactly: ${finalMarker}`,
      "Do not output JSON, URLs, source identities, claim text, explanations, or private chain-of-thought.",
      "Do not call any mutating tool. Do not answer from memory instead of using the required governed read.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: "Execute the certification protocol exactly as instructed.",
      },
    ],
    tools: [research.tool],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "INTELLIGENCE",
      operation: "AVANTIQO_INTELLIGENCE_COGNITION_RUNTIME_CERTIFICATION",
      certification_contract: CONTRACT,
      certification_case: id,
      certification_trace_id: TRACE_ID,
      production_certification_effect: "NONE",
      raw_reasoning_persisted: false,
    },
    execution_lane: "deep",
    temperature: 0,
    max_output_tokens: 700,
    max_turns: expectedCalls + 1,
    max_tool_calls: expectedCalls,
  });

  if (research.state.count() !== expectedCalls) {
    throw new Error(
      `AVANTIQO_COGNITION_CERT_TOOL_CALL_COUNT_MISMATCH:${id}:${research.state.count()}:${expectedCalls}`,
    );
  }

  const gate = applyAvantiqoEpistemicCompletionGate({
    result: completionResult({ response: loop.text, stopReason }),
    route: researchRoute(),
    phases: {
      reason_act_observe: loop,
      critique_repair: null,
    },
  });

  return validateCase({
    id,
    loop,
    gate,
    expectedCalls,
    finalMarker,
    stopReason,
  });
}

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const mode = executionMode();
const mainCommit = validateCurrentMain();
const organizationId = benchmarkOrganizationId();
if (!organizationId) {
  throw new Error(
    "AVANTIQO_COGNITION_CERT_BENCHMARK_ORGANIZATION_REQUIRED:configure_AVANTIQO_INTELLIGENCE_COGNITION_CERT_ORGANIZATION_ID_or_existing_benchmark_org",
  );
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { WalletRepository } = await import(
  "@/lib/platform/service-runtime/wallet/repositories/WalletRepository"
);
const { resolveProvider } = await import(
  "@/lib/platform/service-runtime/providers/ProviderResolver"
);
const { PricingRuntime } = await import(
  "@/lib/platform/service-runtime/pricing/PricingRuntime"
);

const serviceResult = await supabaseAdmin
  .from("organization_services")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("service_id", REASONING_SERVICE)
  .maybeSingle();
if (serviceResult.error) throw serviceResult.error;
const organizationService = serviceResult.data;
if (!organizationService) {
  throw new Error("AVANTIQO_COGNITION_CERT_REASONING_SERVICE_NOT_ENABLED");
}
if (upper(organizationService.status) !== "ACTIVE") {
  throw new Error("AVANTIQO_COGNITION_CERT_REASONING_SERVICE_NOT_ACTIVE");
}
if (organizationService.usage_enabled === false) {
  throw new Error("AVANTIQO_COGNITION_CERT_REASONING_SERVICE_USAGE_DISABLED");
}

const wallet = await WalletRepository.getByOrganization(organizationId);
if (!wallet?.id || upper(wallet.status) !== "ACTIVE" || upper(wallet.billing_policy) !== "PREPAID") {
  throw new Error("AVANTIQO_COGNITION_CERT_ACTIVE_PREPAID_WALLET_REQUIRED");
}

const selectedProvider = await resolveProvider({
  organization_id: organizationId,
  capability: REASONING_SERVICE,
  preferredProvider: OWNED_PROVIDER,
  policy: BENCHMARK_POLICY,
});
if (selectedProvider?.provider !== OWNED_PROVIDER) {
  throw new Error("AVANTIQO_COGNITION_CERT_OWNED_PROVIDER_RESOLUTION_FAILED");
}
const pricing = PricingRuntime.resolveRecord({
  pricing: selectedProvider.pricing_record,
  provider: selectedProvider.provider,
  capability: REASONING_SERVICE,
  model: selectedProvider.model,
  currency: selectedProvider.currency,
  usage: { quantity: 1 },
});
const walletCurrency = upper(wallet.currency);
const pricingCurrency = upper(pricing.currency);
if (walletCurrency && pricingCurrency && walletCurrency !== pricingCurrency) {
  throw new Error("AVANTIQO_COGNITION_CERT_WALLET_CURRENCY_MISMATCH");
}
const perRequestReservation = Math.max(0, finite(pricing.customer_price));
const projectedMaxCharge = Number(
  (perRequestReservation * MAX_PROVIDER_REQUESTS).toFixed(6),
);
const maxProjectedCharge = Math.max(
  0,
  finite(
    process.env.AVANTIQO_INTELLIGENCE_COGNITION_CERT_MAX_CUSTOMER_CHARGE,
    DEFAULT_MAX_PROJECTED_CUSTOMER_CHARGE,
  ),
);
if (projectedMaxCharge > maxProjectedCharge) {
  throw new Error(
    `AVANTIQO_COGNITION_CERT_PROJECTED_CHARGE_LIMIT_EXCEEDED:${projectedMaxCharge}:${maxProjectedCharge}`,
  );
}
if (finite(wallet.available_balance) < projectedMaxCharge) {
  throw new Error("AVANTIQO_COGNITION_CERT_PREPAID_WALLET_BALANCE_INSUFFICIENT");
}

const baseReport = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  mode,
  main_commit: mainCommit,
  main_remote_commit_at_validation:
    mainValidation?.remote_main_commit_at_validation || mainCommit,
  main_exact_remote_match_at_validation:
    mainValidation?.exact_remote_match === true,
  main_irrelevant_remote_advance_tolerated:
    mainValidation?.irrelevant_remote_advance_tolerated === true,
  main_critical_paths_clean: mainValidation?.critical_paths_clean === true,
  provider: OWNED_PROVIDER,
  execution_lane: "deep",
  organization_scope_resolved: true,
  organization_id_redacted: true,
  reasoning_service_active: true,
  prepaid_wallet_active: true,
  pricing_currency: pricing.currency,
  per_request_reservation_customer_price: perRequestReservation,
  provider_request_hard_ceiling: MAX_PROVIDER_REQUESTS,
  projected_max_customer_charge: projectedMaxCharge,
  configured_max_customer_charge: maxProjectedCharge,
  benchmark_review_preview: pricing.benchmark_review_preview === true,
  production_pricing_active: pricing.production_pricing_active === true,
  production_deploy_performed: false,
  provider_selection_changed: false,
  pricing_activation_performed: false,
  business_domain_mutation_performed: false,
  deterministic_certification_tool_mutation_performed: false,
  external_research_performed: false,
  raw_research_persisted: false,
  raw_reasoning_persisted: false,
  secrets_printed: false,
};

if (mode === "PREFLIGHT") {
  const report = {
    ...baseReport,
    ready_for_controlled_runtime_certification: true,
    provider_requests_submitted: 0,
    safe_lease_required_for_execute: true,
    summary: { passed: true, preflight_only: true },
  };
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode,
    ready_for_controlled_runtime_certification: true,
    provider_requests_submitted: 0,
    projected_max_customer_charge: projectedMaxCharge,
    main_irrelevant_remote_advance_tolerated:
      report.main_irrelevant_remote_advance_tolerated,
    output_path: OUTPUT,
    secrets_printed: false,
  }, null, 2));
  process.exit(0);
}

requireExecutionApproval();
const safeLease = requireSafeLease();
const {
  getAvantiqoIntelligenceEndpointHealth,
} = await import(
  "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider"
);
const preHealth = await getAvantiqoIntelligenceEndpointHealth();
const compactPreHealth = healthSummary(preHealth);
if (compactPreHealth.jobs_in_queue > 0 || compactPreHealth.jobs_in_progress > 0) {
  throw new Error("AVANTIQO_COGNITION_CERT_ENDPOINT_NOT_QUIESCENT");
}

const {
  runIntelligenceReasoningLoop,
} = await import("@/lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime");
const {
  applyAvantiqoEpistemicCompletionGate,
} = await import("@/lib/intelligence/runtime/AvantiqoEpistemicCompletionGateRuntime.mjs");

const cases = [];
try {
  cases.push(await runCertificationCase({
    id: "source-backed-sufficient-evidence",
    organizationId,
    expectedCalls: 1,
    finalMarker: "CERT_SUFFICIENT_EVIDENCE_DONE",
    stopReason: "sufficient_evidence",
    systemInstruction: [
      `Call operator_live_read exactly once with capability_key ${RESEARCH_CAPABILITY}.`,
      "Do not answer before that governed read succeeds.",
    ].join(" "),
    runIntelligenceReasoningLoop,
    applyAvantiqoEpistemicCompletionGate,
  }));

  cases.push(await runCertificationCase({
    id: "observed-zero-marginal-research-utility",
    organizationId,
    expectedCalls: 2,
    finalMarker: "CERT_DIMINISHING_RETURNS_DONE",
    stopReason: "diminishing_returns",
    systemInstruction: [
      `Call operator_live_read exactly twice with capability_key ${RESEARCH_CAPABILITY}.`,
      "The second call must occur even if the first result appears sufficient.",
      "Do not answer before both governed reads succeed.",
    ].join(" "),
    runIntelligenceReasoningLoop,
    applyAvantiqoEpistemicCompletionGate,
  }));
} catch (error) {
  const report = {
    ...baseReport,
    mode,
    safe_lease: safeLease,
    pre_health: compactPreHealth,
    cases,
    error: text(error?.message || error, 1200),
    summary: {
      passed: false,
      completed_cases: cases.length,
      expected_cases: 2,
    },
  };
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(`AVANTIQO_INTELLIGENCE_COGNITION_RUNTIME_CERTIFICATION=FAIL reason=${report.error}`);
  process.exit(1);
}

const passed = cases.length === 2 && cases.every((item) => item.passed === true);
const report = {
  ...baseReport,
  mode,
  safe_lease: safeLease,
  pre_health: compactPreHealth,
  cases,
  provider_requests_submitted: cases.reduce((sum, item) => sum + item.turns, 0),
  service_usage_accounting_performed: true,
  summary: {
    passed,
    cases: cases.length,
    cases_passed: cases.filter((item) => item.passed).length,
    source_backed_sufficient_evidence_passed: cases[0]?.passed === true,
    zero_marginal_utility_passed: cases[1]?.passed === true,
  },
};
await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: passed,
  contract: CONTRACT,
  mode,
  provider_requests_submitted: report.provider_requests_submitted,
  projected_max_customer_charge: projectedMaxCharge,
  summary: report.summary,
  output_path: OUTPUT,
  production_deploy_performed: false,
  provider_selection_changed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(
  `AVANTIQO_INTELLIGENCE_COGNITION_RUNTIME_CERTIFICATION=${passed ? "PASS" : "FAIL"}`,
);
if (!passed) process.exit(1);
