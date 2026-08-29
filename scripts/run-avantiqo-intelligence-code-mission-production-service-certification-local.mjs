import { readFile, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_SERVICE_CERTIFICATION_V1";
const OWNED_PROVIDER = "avantiqo-intelligence";
const FAST_SERVICE = "ai.text.generate";
const DEEP_SERVICE = "ai.reasoning.execute";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_BINDING = "OWNED_INTELLIGENCE_FAST_V1";
const DEEP_BINDING = "OWNED_INTELLIGENCE_DEEP_V1";
const LANE_SERVICE_POLICY = "FAST_TEXT_DEEP_REASONING_V1";
const FAST_ASSESSMENT_CONTRACT = "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1";
const SYSTEM_REASONING_CONTRACT = "AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_V1";
const FAST_CAPACITY_REPAIR = "scripts/repair-avantiqo-intelligence-fast-volume-local-capacity-local.mjs";
const FAST_CAPACITY_CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_VOLUME_LOCAL_CAPACITY_REPAIR_V1";
const DEEP_CAPACITY_PREFLIGHT = "scripts/diagnose-avantiqo-intelligence-deep-capacity-preflight-local.mjs";
const DEEP_CAPACITY_CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_CAPACITY_PREFLIGHT_V1";
const EXPECTED_FAST_REQUESTS = 1;
const EXPECTED_DEEP_REQUESTS = 3;
const EXPECTED_TOTAL_REQUESTS = 4;
const DEFAULT_MAX_CUSTOMER_CHARGE = 10;
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";
const PARALLEL_SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-parallel-local.mjs";
const FAST_CHILD = "scripts/run-avantiqo-intelligence-code-mission-production-fast-assessment-local.mjs";
const DEEP_CHILD = "scripts/run-avantiqo-intelligence-code-mission-production-deep-reasoning-local.mjs";
const OUTPUT = resolve(
  process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_OUTPUT ||
    "/tmp/avantiqo-intelligence-code-mission-production-service-certification.json",
);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
    throw new Error(`${code}:${text(result.stderr || result.stdout, 1000)}`);
  }
  return text(result.stdout, 200000);
}
function runInheritedNode(args, env, code) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${code}_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${code}_RC:${result.status}`);
}
function expectedMain() {
  const expected = text(
    process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_EXPECTED_MAIN_COMMIT,
    160,
  ).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected)) throw new Error(`${CONTRACT}_EXPECTED_MAIN_COMMIT_REQUIRED`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`).toLowerCase();
  if (head !== expected) throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
  const tracked = shell("git", ["status", "--porcelain", "--untracked-files=no"], `${CONTRACT}_GIT_STATUS_FAILED`);
  if (tracked) throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);
  return head;
}
function requireExecutionApproval() {
  if (!process.argv.includes("--execute")) throw new Error(`${CONTRACT}_EXECUTE_FLAG_REQUIRED`);
  if (!yes(process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_SPEND_APPROVED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_SPEND_APPROVED=YES_REQUIRED");
  }
  if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
    throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
  }
}
function money(value) {
  return Number(finite(value, 0).toFixed(6));
}
function closeEnough(left, right) {
  return Math.abs(finite(left, 0) - finite(right, 0)) <= 0.000001;
}
function runFastCapacityGate(env) {
  const result = spawnSync(process.execPath, [FAST_CAPACITY_REPAIR, "--apply"], {
    cwd: process.cwd(),
    env: {
      ...env,
      AVANTIQO_INTELLIGENCE_FAST_CAPACITY_REPAIR_APPROVED: "YES",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = text(result.stdout, 200000);
  const stderr = text(result.stderr, 12000);
  if (stdout) process.stdout.write(`${stdout}\n`);
  if (stderr) process.stderr.write(`${stderr}\n`);
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${CONTRACT}_FAST_CAPACITY_GATE_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${CONTRACT}_FAST_CAPACITY_GATE_FAILED_RC:${result.status}`);
  if (!stdout.includes(`${FAST_CAPACITY_CONTRACT}=PASS`)) {
    throw new Error(`${CONTRACT}_FAST_CAPACITY_GATE_CONTRACT_NOT_PROVEN`);
  }
  if (!stdout.includes(`${FAST_CAPACITY_CONTRACT}_PAID_CERTIFICATION_READY=true`)) {
    throw new Error(`${CONTRACT}_FAST_CAPACITY_NOT_STRONG_ENOUGH_FOR_PAID_CERTIFICATION`);
  }
  return true;
}
function runDeepCapacityGate(env) {
  const result = spawnSync(process.execPath, [DEEP_CAPACITY_PREFLIGHT], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = text(result.stdout, 200000);
  const stderr = text(result.stderr, 12000);
  if (stdout) process.stdout.write(`${stdout}\n`);
  if (stderr) process.stderr.write(`${stderr}\n`);
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${CONTRACT}_DEEP_CAPACITY_GATE_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${CONTRACT}_DEEP_CAPACITY_GATE_FAILED_RC:${result.status}`);
  let report = null;
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new Error(`${CONTRACT}_DEEP_CAPACITY_GATE_OUTPUT_INVALID`);
  }
  if (report?.contract !== DEEP_CAPACITY_CONTRACT) {
    throw new Error(`${CONTRACT}_DEEP_CAPACITY_GATE_CONTRACT_NOT_PROVEN`);
  }
  if (report?.diagnosis !== "READY_FOR_SAFE_LEASE_RUNTIME_PROBE") {
    throw new Error(`${CONTRACT}_DEEP_CAPACITY_NOT_READY:${text(report?.diagnosis, 200)}`);
  }
  return report;
}

const head = expectedMain();
requireExecutionApproval();
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { resolveProvider } = await import("@/lib/platform/service-runtime/providers/ProviderResolver");
const { PricingRuntime } = await import("@/lib/platform/service-runtime/pricing/PricingRuntime");
const { WalletRepository } = await import("@/lib/platform/service-runtime/wallet/repositories/WalletRepository");

let organizationId = text(
  process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_ORGANIZATION_ID,
  200,
);
let organizationSource = organizationId ? "EXPLICIT_CERT_ENV" : null;
if (!organizationId) {
  const organizationResult = await supabaseAdmin
    .from("organizations")
    .select("id,name,organization_type,status,organization_status")
    .eq("name", CANONICAL_ORGANIZATION_NAME)
    .eq("organization_type", CANONICAL_ORGANIZATION_TYPE)
    .eq("status", "active")
    .eq("organization_status", "ACTIVE")
    .limit(3);
  if (organizationResult.error) throw organizationResult.error;
  const matches = list(organizationResult.data);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_PLATFORM_ORGANIZATION_RESOLUTION_FAILED:${matches.length}`);
  organizationId = text(matches[0]?.id, 200);
  if (!organizationId) throw new Error(`${CONTRACT}_PLATFORM_ORGANIZATION_ID_REQUIRED`);
  organizationSource = "CANONICAL_AVANTIQO_PLATFORM_DATABASE_RECORD";
}

const servicesResult = await supabaseAdmin
  .from("organization_services")
  .select("*")
  .eq("organization_id", organizationId)
  .in("service_id", [FAST_SERVICE, DEEP_SERVICE]);
if (servicesResult.error) throw servicesResult.error;
const serviceRows = list(servicesResult.data);
const fastOrganizationService = serviceRows.find((row) => text(row?.service_id, 200) === FAST_SERVICE);
const deepOrganizationService = serviceRows.find((row) => text(row?.service_id, 200) === DEEP_SERVICE);
for (const [label, service] of [["FAST", fastOrganizationService], ["DEEP", deepOrganizationService]]) {
  if (!service?.id) throw new Error(`${CONTRACT}_${label}_SERVICE_NOT_ENABLED`);
  if (upper(service.status) !== "ACTIVE") throw new Error(`${CONTRACT}_${label}_SERVICE_NOT_ACTIVE`);
  if (service.usage_enabled === false) throw new Error(`${CONTRACT}_${label}_SERVICE_USAGE_DISABLED`);
}

const providerPolicy = {
  allowed_providers: [OWNED_PROVIDER],
  execution_scope: "BENCHMARK_REVIEW_PREVIEW",
  benchmark_only: true,
  owned_only_required: true,
  external_fallback_allowed: false,
};

async function resolveLane({ serviceId, model, lane, binding, label }) {
  const selectedProvider = await resolveProvider({
    organization_id: organizationId,
    capability: serviceId,
    preferredProvider: OWNED_PROVIDER,
    policy: providerPolicy,
  });
  if (selectedProvider?.provider !== OWNED_PROVIDER) {
    throw new Error(`${CONTRACT}_${label}_OWNED_PROVIDER_RESOLUTION_FAILED`);
  }
  if (text(selectedProvider?.model, 300) !== model) {
    throw new Error(`${CONTRACT}_${label}_MODEL_BINDING_INVALID:${text(selectedProvider?.model, 300)}`);
  }
  if (text(selectedProvider?.metadata?.execution_lane, 40).toLowerCase() !== lane) {
    throw new Error(`${CONTRACT}_${label}_PRICING_LANE_INVALID`);
  }
  if (text(selectedProvider?.metadata?.lane_model_binding, 160) !== binding) {
    throw new Error(`${CONTRACT}_${label}_PRICING_BINDING_INVALID`);
  }
  const pricing = PricingRuntime.resolveRecord({
    pricing: selectedProvider.pricing_record,
    provider: selectedProvider.provider,
    capability: serviceId,
    model: selectedProvider.model,
    currency: selectedProvider.currency,
    usage: { quantity: 1 },
  });
  return { selectedProvider, pricing };
}

const fastLane = await resolveLane({
  serviceId: FAST_SERVICE,
  model: FAST_MODEL,
  lane: "fast",
  binding: FAST_BINDING,
  label: "FAST",
});
const deepLane = await resolveLane({
  serviceId: DEEP_SERVICE,
  model: DEEP_MODEL,
  lane: "deep",
  binding: DEEP_BINDING,
  label: "DEEP",
});
const fastPricingCurrency = upper(fastLane.pricing.currency);
const deepPricingCurrency = upper(deepLane.pricing.currency);
if (fastPricingCurrency && deepPricingCurrency && fastPricingCurrency !== deepPricingCurrency) {
  throw new Error(`${CONTRACT}_LANE_PRICING_CURRENCY_MISMATCH:${fastPricingCurrency}:${deepPricingCurrency}`);
}
const pricingCurrency = fastLane.pricing.currency || deepLane.pricing.currency;
const fastReservation = Math.max(0, finite(fastLane.pricing.customer_price));
const deepReservation = Math.max(0, finite(deepLane.pricing.customer_price));
const projectedMaxCharge = money(
  (fastReservation * EXPECTED_FAST_REQUESTS) +
  (deepReservation * EXPECTED_DEEP_REQUESTS),
);
const configuredMaxCharge = Math.max(
  0,
  finite(
    process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_MAX_CUSTOMER_CHARGE,
    DEFAULT_MAX_CUSTOMER_CHARGE,
  ),
);
if (projectedMaxCharge > configuredMaxCharge) {
  throw new Error(`${CONTRACT}_PROJECTED_CHARGE_LIMIT_EXCEEDED:${projectedMaxCharge}:${configuredMaxCharge}`);
}
const wallet = await WalletRepository.getByOrganization(organizationId);
if (!wallet?.id) throw new Error(`${CONTRACT}_PREPAID_WALLET_REQUIRED`);
if (upper(wallet.status) !== "ACTIVE") throw new Error(`${CONTRACT}_ACTIVE_WALLET_REQUIRED`);
if (upper(wallet.billing_policy) !== "PREPAID") throw new Error(`${CONTRACT}_PREPAID_POLICY_REQUIRED`);
const walletCurrency = upper(wallet.currency);
const normalizedPricingCurrency = upper(pricingCurrency);
if (walletCurrency && normalizedPricingCurrency && walletCurrency !== normalizedPricingCurrency) {
  throw new Error(`${CONTRACT}_WALLET_CURRENCY_MISMATCH:${walletCurrency}:${normalizedPricingCurrency}`);
}
if (finite(wallet.available_balance) < projectedMaxCharge) {
  throw new Error(`${CONTRACT}_PREPAID_WALLET_BALANCE_INSUFFICIENT`);
}

const assessmentPath = resolve(`/tmp/avantiqo-intelligence-code-mission-production-assessment-${process.pid}.json`);
const resultPath = resolve(`/tmp/avantiqo-intelligence-code-mission-production-result-${process.pid}.json`);
const commonEnv = {
  ...process.env,
  NODE_ENV: "development",
  AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_SPEND_APPROVED: "YES",
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_EXPECTED_MAIN_COMMIT: head,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_ORGANIZATION_ID: organizationId,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_ASSESSMENT_PATH: assessmentPath,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_RESULT_PATH: resultPath,
};

console.log("=== PRE-SPEND FAST CAPACITY GATE ===");
runFastCapacityGate(commonEnv);
console.log("=== PRE-SPEND DEEP CAPACITY GATE ===");
const deepCapacity = runDeepCapacityGate(commonEnv);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  phase: "PREFLIGHT",
  repository_head: head,
  organization_source: organizationSource,
  organization_id_printed: false,
  fast_service_active: true,
  deep_service_active: true,
  owned_provider_resolved: true,
  fast_model: FAST_MODEL,
  deep_model: DEEP_MODEL,
  fast_lane_model_binding: FAST_BINDING,
  deep_lane_model_binding: DEEP_BINDING,
  lane_service_policy: LANE_SERVICE_POLICY,
  prepaid_wallet_active: true,
  pricing_currency: pricingCurrency,
  fast_request_reservation_customer_price: money(fastReservation),
  deep_request_reservation_customer_price: money(deepReservation),
  expected_fast_provider_requests: EXPECTED_FAST_REQUESTS,
  expected_deep_provider_requests: EXPECTED_DEEP_REQUESTS,
  expected_provider_requests: EXPECTED_TOTAL_REQUESTS,
  projected_max_customer_charge: projectedMaxCharge,
  configured_max_customer_charge: configuredMaxCharge,
  fast_capacity_paid_certification_ready: true,
  deep_capacity_ready: deepCapacity?.diagnosis === "READY_FOR_SAFE_LEASE_RUNTIME_PROBE",
  database_mutation_performed: false,
  provider_requests_submitted: 0,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}_PREFLIGHT=PASS`);

const executionStartedAt = new Date().toISOString();

console.log("=== PRODUCTION SERVICE CERT: FAST REPOSITORY ASSESSMENT ===");
runInheritedNode(
  [
    PARALLEL_SAFE_LEASE,
    "--lane=intelligence-fast",
    "--ttl-ms=900000",
    "--",
    process.execPath,
    FAST_CHILD,
  ],
  commonEnv,
  `${CONTRACT}_FAST_PHASE_FAILED`,
);

console.log("=== PRODUCTION SERVICE CERT: DEEP SYSTEM REASONING ===");
runInheritedNode(
  [
    PARALLEL_SAFE_LEASE,
    "--lane=intelligence-deep",
    "--ttl-ms=1800000",
    "--",
    process.execPath,
    DEEP_CHILD,
  ],
  commonEnv,
  `${CONTRACT}_DEEP_PHASE_FAILED`,
);

const executionFinishedAt = new Date().toISOString();
const deepResult = JSON.parse(await readFile(resultPath, "utf8"));
if (deepResult?.contract !== SYSTEM_REASONING_CONTRACT) throw new Error(`${CONTRACT}_DEEP_RESULT_CONTRACT_INVALID`);
if (deepResult?.status !== "READY_FOR_CODE") throw new Error(`${CONTRACT}_READY_FOR_CODE_REQUIRED`);
if (text(deepResult?.mission_context?.repository_context?.head_sha, 160).toLowerCase() !== head) {
  throw new Error(`${CONTRACT}_DEEP_RESULT_HEAD_MISMATCH`);
}
if (Number(deepResult?.reasoning_execution?.total_general_reasoning_call_ceiling) !== EXPECTED_TOTAL_REQUESTS) {
  throw new Error(`${CONTRACT}_GENERAL_REASONING_CEILING_INVALID`);
}
if (Number(deepResult?.reasoning_execution?.code_reasoning_calls_consumed) !== 0) {
  throw new Error(`${CONTRACT}_CODE_REASONING_CALLS_INVALID`);
}
if (deepResult?.governance?.code_execution_started !== false) throw new Error(`${CONTRACT}_CODE_EXECUTION_GOVERNANCE_INVALID`);
if (deepResult?.governance?.source_mutation_performed !== false) throw new Error(`${CONTRACT}_SOURCE_MUTATION_GOVERNANCE_INVALID`);
if (deepResult?.governance?.deployment_performed !== false) throw new Error(`${CONTRACT}_DEPLOYMENT_GOVERNANCE_INVALID`);
if (deepResult?.governance?.knowledge_promotion_performed !== false) throw new Error(`${CONTRACT}_KNOWLEDGE_PROMOTION_GOVERNANCE_INVALID`);
if (deepResult?.governance?.raw_reasoning_persisted !== false) throw new Error(`${CONTRACT}_RAW_REASONING_GOVERNANCE_INVALID`);

const usageResult = await supabaseAdmin
  .from("platform_service_usage")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("provider", OWNED_PROVIDER)
  .gte("created_at", executionStartedAt)
  .lte("created_at", executionFinishedAt)
  .order("created_at", { ascending: true });
if (usageResult.error) throw usageResult.error;
const windowRows = list(usageResult.data);
const fastRows = windowRows.filter((row) => {
  const metadata = object(row?.metadata);
  return text(row?.capability, 200) === FAST_SERVICE &&
    text(metadata.repository_head, 160).toLowerCase() === head &&
    text(metadata.product_repository_assessment_contract, 200) === FAST_ASSESSMENT_CONTRACT &&
    text(metadata.intelligence_execution_lane, 40).toLowerCase() === "fast" &&
    text(metadata.intelligence_service_id, 200) === FAST_SERVICE &&
    text(metadata.intelligence_lane_service_policy, 200) === LANE_SERVICE_POLICY;
});
const deepRows = windowRows.filter((row) => {
  const metadata = object(row?.metadata);
  return text(row?.capability, 200) === DEEP_SERVICE &&
    text(metadata.repository_head, 160).toLowerCase() === head &&
    text(metadata.intelligence_code_mission_system_reasoning_contract, 200) === SYSTEM_REASONING_CONTRACT &&
    text(metadata.intelligence_execution_lane, 40).toLowerCase() === "deep" &&
    text(metadata.intelligence_service_id, 200) === DEEP_SERVICE &&
    text(metadata.intelligence_lane_service_policy, 200) === LANE_SERVICE_POLICY;
});
if (fastRows.length !== EXPECTED_FAST_REQUESTS) throw new Error(`${CONTRACT}_FAST_USAGE_COUNT_INVALID:${fastRows.length}`);
if (deepRows.length !== EXPECTED_DEEP_REQUESTS) throw new Error(`${CONTRACT}_DEEP_USAGE_COUNT_INVALID:${deepRows.length}`);
const certifiedUsageRows = [...fastRows, ...deepRows];
if (certifiedUsageRows.length !== EXPECTED_TOTAL_REQUESTS) {
  throw new Error(`${CONTRACT}_TOTAL_USAGE_COUNT_INVALID:${certifiedUsageRows.length}`);
}
if (certifiedUsageRows.some((row) => upper(row?.status) !== "SUCCESS")) {
  throw new Error(`${CONTRACT}_NON_SUCCESS_USAGE_DETECTED`);
}
if (fastRows.some((row) => text(row?.provider_model, 300) !== FAST_MODEL)) {
  throw new Error(`${CONTRACT}_OBSERVED_FAST_MODEL_INVALID`);
}
if (deepRows.some((row) => text(row?.provider_model, 300) !== DEEP_MODEL)) {
  throw new Error(`${CONTRACT}_OBSERVED_DEEP_MODEL_INVALID`);
}
if (certifiedUsageRows.some((row) => upper(row?.currency) !== normalizedPricingCurrency)) {
  throw new Error(`${CONTRACT}_USAGE_CURRENCY_INVALID`);
}

const usageIds = certifiedUsageRows.map((row) => text(row?.id, 200)).filter(Boolean);
if (usageIds.length !== EXPECTED_TOTAL_REQUESTS) throw new Error(`${CONTRACT}_USAGE_ID_COUNT_INVALID`);
const positiveUsageRows = certifiedUsageRows.filter((row) => finite(row?.customer_price) > 0);
const totalCustomerPrice = money(certifiedUsageRows.reduce((sum, row) => sum + finite(row?.customer_price), 0));
if (totalCustomerPrice > configuredMaxCharge) {
  throw new Error(`${CONTRACT}_ACTUAL_CHARGE_LIMIT_EXCEEDED:${totalCustomerPrice}:${configuredMaxCharge}`);
}
const transactionResult = await supabaseAdmin
  .from("wallet_transactions")
  .select("id,type,amount,currency,provider,usage_id,reference,metadata,created_at")
  .eq("organization_id", organizationId)
  .eq("provider", OWNED_PROVIDER)
  .eq("type", "CHARGE")
  .in("usage_id", usageIds);
if (transactionResult.error) throw transactionResult.error;
const chargeRows = list(transactionResult.data);
const totalWalletCharge = money(chargeRows.reduce((sum, row) => sum + finite(row?.amount), 0));
if (positiveUsageRows.length > 0) {
  if (chargeRows.length !== positiveUsageRows.length) {
    throw new Error(`${CONTRACT}_WALLET_CHARGE_COUNT_INVALID:${chargeRows.length}:${positiveUsageRows.length}`);
  }
  const chargedUsageIds = new Set(chargeRows.map((row) => text(row?.usage_id, 200)));
  if (positiveUsageRows.some((row) => !chargedUsageIds.has(text(row?.id, 200)))) {
    throw new Error(`${CONTRACT}_WALLET_CHARGE_USAGE_LINK_MISSING`);
  }
  if (!closeEnough(totalWalletCharge, totalCustomerPrice)) {
    throw new Error(`${CONTRACT}_WALLET_CHARGE_RECONCILIATION_FAILED:${totalWalletCharge}:${totalCustomerPrice}`);
  }
} else if (chargeRows.length !== 0 || totalWalletCharge !== 0) {
  throw new Error(`${CONTRACT}_UNEXPECTED_ZERO_PRICE_CHARGE`);
}

const fastModels = [...new Set(fastRows.map((row) => text(row?.provider_model, 300)).filter(Boolean))];
const deepModels = [...new Set(deepRows.map((row) => text(row?.provider_model, 300)).filter(Boolean))];
const fastBillingHandoffEligible = fastRows.some((row) => finite(row?.customer_price) > 0) &&
  fastOrganizationService.billing_enabled !== false;
const deepBillingHandoffEligible = deepRows.some((row) => finite(row?.customer_price) > 0) &&
  deepOrganizationService.billing_enabled !== false;
const billingHandoffEligible = fastBillingHandoffEligible || deepBillingHandoffEligible;
const walletSettlementVerified = closeEnough(totalWalletCharge, totalCustomerPrice);
const report = {
  success: true,
  contract: CONTRACT,
  provider: OWNED_PROVIDER,
  capabilities: [FAST_SERVICE, DEEP_SERVICE],
  certification_scope: "REAL_SERVICE_RUNTIME_ACCOUNTED_GENERAL_INTELLIGENCE_PATH",
  repository_head: head,
  organization_source: organizationSource,
  organization_id_printed: false,
  external_fallback_allowed: false,
  external_provider_used: false,
  production_service_runtime_proven: true,
  workers_restored_0_0: true,
  wallet_settlement_verified: walletSettlementVerified,
  execution_window: {
    started_at: executionStartedAt,
    finished_at: executionFinishedAt,
  },
  reasoning: {
    approved_provider_request_count: EXPECTED_TOTAL_REQUESTS,
    observed_provider_request_count: certifiedUsageRows.length,
    fast_provider_requests: fastRows.length,
    deep_provider_requests: deepRows.length,
    repository_query_planner_model_requests: 0,
    total_general_reasoning_call_ceiling: deepResult.reasoning_execution.total_general_reasoning_call_ceiling,
    code_reasoning_calls_consumed: deepResult.reasoning_execution.code_reasoning_calls_consumed,
    fast_service: FAST_SERVICE,
    deep_service: DEEP_SERVICE,
    fast_usage_models: fastModels,
    deep_usage_models: deepModels,
    final_status: deepResult.status,
    canonical_code_mission_contract: deepResult.mission_context?.contract || null,
    system_reasoning_contract: deepResult.contract,
    repository_head_preserved: text(deepResult.mission_context?.repository_context?.head_sha, 160).toLowerCase() === head,
  },
  service_accounting: {
    service_usage_accounting_performed: true,
    database_mutation_performed: true,
    successful_usage_rows: certifiedUsageRows.length,
    fast_successful_usage_rows: fastRows.length,
    deep_successful_usage_rows: deepRows.length,
    fast_reservation_customer_price: money(fastReservation),
    deep_reservation_customer_price: money(deepReservation),
    total_customer_price: totalCustomerPrice,
    pricing_currency: pricingCurrency,
    wallet_accounting_performed: true,
    wallet_mutation_performed: true,
    wallet_charge_performed: chargeRows.length > 0,
    wallet_charge_count: chargeRows.length,
    total_wallet_charge: totalWalletCharge,
    wallet_charge_reconciled_to_usage: walletSettlementVerified,
    billing_handoff_eligible: billingHandoffEligible,
    fast_billing_handoff_eligible: fastBillingHandoffEligible,
    deep_billing_handoff_eligible: deepBillingHandoffEligible,
    billing_handoff_semantics: billingHandoffEligible
      ? "QUEUED_BY_SERVICE_RUNTIME_NOT_INVOICE_PROCESSED"
      : "NOT_REQUIRED_FOR_ZERO_PRICE_OR_DISABLED_BILLING",
    billing_invoice_processing_certified: false,
  },
  capacity: {
    fast_paid_certification_ready: true,
    deep_ready: deepCapacity?.diagnosis === "READY_FOR_SAFE_LEASE_RUNTIME_PROBE",
    deep_current_usable_target_count: finite(deepCapacity?.current_usable_target_count, 0),
  },
  governance: {
    general_intelligence_only: true,
    code_execution_performed: false,
    source_mutation_performed: false,
    learning_knowledge_promoted: false,
    production_deploy_performed: false,
    raw_reasoning_persisted: false,
    safe_lease_exclusively_owns_scaling: true,
    direct_endpoint_scaling_performed_by_children: false,
    provider_selection_changed: false,
    pricing_activation_performed: false,
    original_music_work_untouched: true,
  },
  secrets_printed: false,
};
await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
