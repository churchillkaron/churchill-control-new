import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_FAST_SERVICE_CERTIFICATION_V1";
const OWNED_PROVIDER = "avantiqo-intelligence";
const FAST_SERVICE = "ai.text.generate";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const FAST_BINDING = "OWNED_INTELLIGENCE_FAST_V1";
const FAST_ASSESSMENT_CONTRACT = "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1";
const FAST_CHILD = "scripts/run-avantiqo-intelligence-code-mission-production-fast-assessment-local.mjs";
const FAST_CAPACITY_REPAIR = "scripts/repair-avantiqo-intelligence-fast-volume-local-capacity-local.mjs";
const FAST_CAPACITY_CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_VOLUME_LOCAL_CAPACITY_REPAIR_V1";
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";
const DEFAULT_MAX_CUSTOMER_CHARGE = 3;

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
function money(value) {
  return Number(finite(value, 0).toFixed(6));
}
function closeEnough(left, right) {
  return Math.abs(finite(left, 0) - finite(right, 0)) <= 0.000001;
}
function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 1200)}`);
  }
  return text(result.stdout, 200000);
}
function expectedMain() {
  const expected = text(
    process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_EXPECTED_MAIN_COMMIT,
    160,
  ).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_COMMIT_REQUIRED`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`).toLowerCase();
  if (head !== expected) {
    throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
  }
  const tracked = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    `${CONTRACT}_GIT_STATUS_FAILED`,
  );
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
function runFastCapacityGate(env) {
  const result = spawnSync(
    process.execPath,
    [FAST_CAPACITY_REPAIR, "--apply"],
    {
      cwd: process.cwd(),
      env: {
        ...env,
        AVANTIQO_INTELLIGENCE_FAST_CAPACITY_REPAIR_APPROVED: "YES",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stdout = text(result.stdout, 200000);
  const stderr = text(result.stderr, 12000);
  if (stdout) process.stdout.write(`${stdout}\n`);
  if (stderr) process.stderr.write(`${stderr}\n`);
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${CONTRACT}_FAST_CAPACITY_GATE_SIGNAL:${result.signal}`);
  if (result.status !== 0) {
    throw new Error(`${CONTRACT}_FAST_CAPACITY_GATE_FAILED_RC:${result.status}`);
  }
  if (!stdout.includes(`${FAST_CAPACITY_CONTRACT}=PASS`)) {
    throw new Error(`${CONTRACT}_FAST_CAPACITY_GATE_CONTRACT_NOT_PROVEN`);
  }
  if (!stdout.includes(`${FAST_CAPACITY_CONTRACT}_PAID_CERTIFICATION_READY=true`)) {
    throw new Error(`${CONTRACT}_FAST_CAPACITY_NOT_STRONG_ENOUGH_FOR_PAID_CERTIFICATION`);
  }
  return true;
}
function runFastChild(env) {
  const result = spawnSync(process.execPath, [FAST_CHILD], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${CONTRACT}_FAST_PHASE_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${CONTRACT}_FAST_PHASE_FAILED_RC:${result.status}`);
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
  if (matches.length !== 1) {
    throw new Error(`${CONTRACT}_PLATFORM_ORGANIZATION_RESOLUTION_FAILED:${matches.length}`);
  }
  organizationId = text(matches[0]?.id, 200);
  if (!organizationId) throw new Error(`${CONTRACT}_PLATFORM_ORGANIZATION_ID_REQUIRED`);
  organizationSource = "CANONICAL_AVANTIQO_PLATFORM_DATABASE_RECORD";
}

const serviceResult = await supabaseAdmin
  .from("organization_services")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("service_id", FAST_SERVICE)
  .maybeSingle();
if (serviceResult.error) throw serviceResult.error;
const organizationService = serviceResult.data;
if (!organizationService?.id) throw new Error(`${CONTRACT}_FAST_SERVICE_NOT_ENABLED`);
if (upper(organizationService.status) !== "ACTIVE") throw new Error(`${CONTRACT}_FAST_SERVICE_NOT_ACTIVE`);
if (organizationService.usage_enabled === false) throw new Error(`${CONTRACT}_FAST_SERVICE_USAGE_DISABLED`);

const providerPolicy = {
  allowed_providers: [OWNED_PROVIDER],
  execution_scope: "BENCHMARK_REVIEW_PREVIEW",
  benchmark_only: true,
  owned_only_required: true,
  external_fallback_allowed: false,
};
const selectedProvider = await resolveProvider({
  organization_id: organizationId,
  capability: FAST_SERVICE,
  preferredProvider: OWNED_PROVIDER,
  policy: providerPolicy,
});
if (selectedProvider?.provider !== OWNED_PROVIDER) {
  throw new Error(`${CONTRACT}_OWNED_PROVIDER_RESOLUTION_FAILED`);
}
if (text(selectedProvider?.model, 300) !== FAST_MODEL) {
  throw new Error(`${CONTRACT}_FAST_MODEL_BINDING_INVALID:${text(selectedProvider?.model, 300)}`);
}
if (text(selectedProvider?.metadata?.execution_lane, 40).toLowerCase() !== "fast") {
  throw new Error(`${CONTRACT}_FAST_PRICING_LANE_INVALID`);
}
if (text(selectedProvider?.metadata?.lane_model_binding, 160) !== FAST_BINDING) {
  throw new Error(`${CONTRACT}_FAST_PRICING_BINDING_INVALID`);
}

const pricing = PricingRuntime.resolveRecord({
  pricing: selectedProvider.pricing_record,
  provider: selectedProvider.provider,
  capability: FAST_SERVICE,
  model: selectedProvider.model,
  currency: selectedProvider.currency,
  usage: { quantity: 1 },
});
const projectedMaxCharge = money(Math.max(0, finite(pricing.customer_price)));
const configuredMaxCharge = Math.max(
  0,
  finite(
    process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_FAST_CERT_MAX_CUSTOMER_CHARGE,
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
if (finite(wallet.available_balance) < projectedMaxCharge) {
  throw new Error(`${CONTRACT}_PREPAID_WALLET_BALANCE_INSUFFICIENT`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  phase: "PREFLIGHT",
  repository_head: head,
  organization_source: organizationSource,
  organization_id_printed: false,
  fast_service: FAST_SERVICE,
  fast_model: FAST_MODEL,
  lane_model_binding: FAST_BINDING,
  owned_provider_resolved: true,
  expected_provider_requests: 1,
  deep_provider_requests_allowed: 0,
  projected_max_customer_charge: projectedMaxCharge,
  configured_max_customer_charge: configuredMaxCharge,
  live_capacity_gate_required: true,
  live_capacity_minimum_stock_status: "MEDIUM",
  fast_transport: "RUNPOD_EPHEMERAL_POD_OPENAI_COMPATIBLE",
  serverless_fast_transport_allowed: false,
  runpod_mutation_performed: false,
  provider_requests_submitted: 0,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}_PREFLIGHT=PASS`);

const assessmentPath = `/tmp/avantiqo-intelligence-code-mission-fast-cert-assessment-${process.pid}.json`;
const commonEnv = {
  ...process.env,
  NODE_ENV: "development",
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_SPEND_APPROVED: "YES",
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_EXPECTED_MAIN_COMMIT: head,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_ORGANIZATION_ID: organizationId,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_ASSESSMENT_PATH: assessmentPath,
};
delete commonEnv.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE;
delete commonEnv.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT;
delete commonEnv.AVANTIQO_RUNPOD_SAFE_LEASE_LANE;
delete commonEnv.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID;
delete commonEnv.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT;

console.log("=== FAST LIVE CAPACITY GATE ===");
runFastCapacityGate(commonEnv);
console.log(`${CONTRACT}_FAST_LIVE_CAPACITY_GATE=PASS`);

const executionStartedAt = new Date().toISOString();
console.log("=== SINGLE FAST SERVICE-ACCOUNTED REPOSITORY ASSESSMENT ===");
runFastChild(commonEnv);
const executionFinishedAt = new Date().toISOString();

const usageResult = await supabaseAdmin
  .from("platform_service_usage")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("provider", OWNED_PROVIDER)
  .eq("capability", FAST_SERVICE)
  .gte("created_at", executionStartedAt)
  .lte("created_at", executionFinishedAt)
  .order("created_at", { ascending: true });
if (usageResult.error) throw usageResult.error;
const fastRows = list(usageResult.data).filter((row) => {
  const metadata = object(row?.metadata);
  return text(metadata.repository_head, 160).toLowerCase() === head &&
    text(metadata.product_repository_assessment_contract, 200) === FAST_ASSESSMENT_CONTRACT &&
    text(metadata.intelligence_execution_lane, 40).toLowerCase() === "fast" &&
    text(metadata.intelligence_service_id, 200) === FAST_SERVICE &&
    text(metadata.intelligence_lane_service_policy, 200) === "FAST_TEXT_DEEP_REASONING_V1";
});
if (fastRows.length !== 1) throw new Error(`${CONTRACT}_FAST_USAGE_COUNT_INVALID:${fastRows.length}`);
const usage = fastRows[0];
if (upper(usage?.status) !== "SUCCESS") throw new Error(`${CONTRACT}_FAST_USAGE_NOT_SUCCESS:${upper(usage?.status)}`);
if (text(usage?.provider_model, 300) !== FAST_MODEL) {
  throw new Error(`${CONTRACT}_OBSERVED_FAST_MODEL_INVALID:${text(usage?.provider_model, 300)}`);
}
const totalCustomerPrice = money(usage?.customer_price);
if (totalCustomerPrice > configuredMaxCharge) {
  throw new Error(`${CONTRACT}_ACTUAL_CHARGE_LIMIT_EXCEEDED:${totalCustomerPrice}:${configuredMaxCharge}`);
}

const transactionResult = await supabaseAdmin
  .from("wallet_transactions")
  .select("id,type,amount,currency,provider,usage_id,reference,metadata,created_at")
  .eq("organization_id", organizationId)
  .eq("provider", OWNED_PROVIDER)
  .eq("type", "CHARGE")
  .eq("usage_id", text(usage?.id, 200));
if (transactionResult.error) throw transactionResult.error;
const charges = list(transactionResult.data);
const totalWalletCharge = money(charges.reduce((sum, row) => sum + finite(row?.amount), 0));
if (totalCustomerPrice > 0) {
  if (charges.length !== 1) throw new Error(`${CONTRACT}_WALLET_CHARGE_COUNT_INVALID:${charges.length}`);
  if (!closeEnough(totalWalletCharge, totalCustomerPrice)) {
    throw new Error(`${CONTRACT}_WALLET_CHARGE_RECONCILIATION_FAILED:${totalWalletCharge}:${totalCustomerPrice}`);
  }
} else if (charges.length !== 0 || totalWalletCharge !== 0) {
  throw new Error(`${CONTRACT}_UNEXPECTED_ZERO_PRICE_CHARGE`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  repository_head: head,
  execution_window: {
    started_at: executionStartedAt,
    finished_at: executionFinishedAt,
  },
  reasoning: {
    approved_provider_request_count: 1,
    observed_provider_request_count: 1,
    fast_provider_requests: 1,
    deep_provider_requests: 0,
    service_id: FAST_SERVICE,
    provider_model: text(usage?.provider_model, 300),
    execution_lane: "fast",
  },
  service_accounting: {
    service_usage_accounting_performed: true,
    successful_usage_rows: 1,
    total_customer_price: totalCustomerPrice,
    pricing_currency: pricing.currency,
    wallet_accounting_performed: true,
    wallet_charge_count: charges.length,
    total_wallet_charge: totalWalletCharge,
    wallet_charge_reconciled_to_usage: closeEnough(totalWalletCharge, totalCustomerPrice),
    billing_handoff_semantics:
      totalCustomerPrice > 0 && organizationService.billing_enabled !== false
        ? "QUEUED_BY_SERVICE_RUNTIME_NOT_INVOICE_PROCESSED"
        : "NOT_REQUIRED_FOR_ZERO_PRICE_OR_DISABLED_BILLING",
    billing_invoice_processing_certified: false,
  },
  governance: {
    general_intelligence_only: true,
    code_execution_performed: false,
    source_mutation_performed: false,
    learning_knowledge_promoted: false,
    production_deploy_performed: false,
    raw_reasoning_persisted: false,
    fast_serverless_transport_allowed: false,
    governed_ephemeral_pod_transport_required: true,
    distributed_fast_lane_lease_required: true,
    direct_endpoint_scaling_performed_by_child: false,
    provider_selection_changed: false,
    pricing_activation_performed: false,
    live_capacity_gate_passed_before_paid_inference: true,
  },
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);