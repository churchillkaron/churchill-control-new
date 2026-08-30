import { readFile, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_PRODUCTION_SERVICE_CERTIFICATION_V1";
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
const FAST_CHILD = "scripts/run-avantiqo-intelligence-code-mission-production-fast-assessment-local.mjs";
const DEEP_CHILD = "scripts/run-avantiqo-intelligence-code-mission-production-deep-reasoning-local.mjs";
const DEEP_CAPACITY_PREFLIGHT = "scripts/diagnose-avantiqo-intelligence-deep-capacity-preflight-local.mjs";
const PARALLEL_SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-parallel-local.mjs";
const EXPECTED_FAST_REQUESTS = 1;
const EXPECTED_DEEP_REQUESTS = 3;
const DEFAULT_MAX_CUSTOMER_CHARGE = 10;
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";

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
    throw new Error(`${code}:${text(result.stderr || result.stdout, 1600)}`);
  }
  return text(result.stdout, 200000);
}
function runNode(args, env, code) {
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
    process.env.AVANTIQO_INTELLIGENCE_DEEP_CERT_EXPECTED_MAIN_COMMIT,
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
function requireApproval() {
  if (!process.argv.includes("--execute")) throw new Error(`${CONTRACT}_EXECUTE_FLAG_REQUIRED`);
  if (!yes(process.env.AVANTIQO_INTELLIGENCE_DEEP_CERT_SPEND_APPROVED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_CERT_SPEND_APPROVED=YES_REQUIRED");
  }
  if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
    throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
  }
}
function deepCapacity(env, code) {
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
  if (result.signal) throw new Error(`${code}_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${code}_RC:${result.status}`);
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new Error(`${code}_JSON_INVALID`);
  }
  if (report?.contract !== "AVANTIQO_INTELLIGENCE_DEEP_CAPACITY_PREFLIGHT_V1") {
    throw new Error(`${code}_CONTRACT_INVALID`);
  }
  if (report?.diagnosis !== "READY_FOR_SAFE_LEASE_RUNTIME_PROBE") {
    throw new Error(`${code}_NOT_READY:${text(report?.diagnosis, 200)}`);
  }
  if (
    report?.safe_lease_resting_0_0 !== true ||
    report?.queue_drained !== true ||
    report?.worker_resting !== true ||
    finite(report?.current_usable_target_count, 0) < 1
  ) {
    throw new Error(`${code}_REST_OR_CAPACITY_INVARIANT_FAILED`);
  }
  return report;
}

const head = expectedMain();
requireApproval();
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { resolveProvider } = await import("@/lib/platform/service-runtime/providers/ProviderResolver");
const { PricingRuntime } = await import("@/lib/platform/service-runtime/pricing/PricingRuntime");
const { WalletRepository } = await import("@/lib/platform/service-runtime/wallet/repositories/WalletRepository");

let organizationId = text(process.env.AVANTIQO_INTELLIGENCE_DEEP_CERT_ORGANIZATION_ID, 200);
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

const servicesResult = await supabaseAdmin
  .from("organization_services")
  .select("*")
  .eq("organization_id", organizationId)
  .in("service_id", [FAST_SERVICE, DEEP_SERVICE]);
if (servicesResult.error) throw servicesResult.error;
const serviceRows = list(servicesResult.data);
for (const serviceId of [FAST_SERVICE, DEEP_SERVICE]) {
  const service = serviceRows.find((row) => text(row?.service_id, 200) === serviceId);
  if (!service?.id) throw new Error(`${CONTRACT}_SERVICE_NOT_ENABLED:${serviceId}`);
  if (upper(service.status) !== "ACTIVE") throw new Error(`${CONTRACT}_SERVICE_NOT_ACTIVE:${serviceId}`);
  if (service.usage_enabled === false) throw new Error(`${CONTRACT}_SERVICE_USAGE_DISABLED:${serviceId}`);
}

const benchmarkPolicy = {
  allowed_providers: [OWNED_PROVIDER],
  execution_scope: "BENCHMARK_REVIEW_PREVIEW",
  benchmark_only: true,
  owned_only_required: true,
  external_fallback_allowed: false,
};

async function resolveLane(serviceId, expectedModel, expectedLane, expectedBinding) {
  const selected = await resolveProvider({
    organization_id: organizationId,
    capability: serviceId,
    preferredProvider: OWNED_PROVIDER,
    policy: benchmarkPolicy,
  });
  if (selected?.provider !== OWNED_PROVIDER) {
    throw new Error(`${CONTRACT}_OWNED_PROVIDER_REQUIRED:${serviceId}`);
  }
  if (text(selected?.model, 300) !== expectedModel) {
    throw new Error(`${CONTRACT}_MODEL_BINDING_INVALID:${serviceId}:${text(selected?.model, 300)}`);
  }
  if (text(selected?.metadata?.execution_lane, 40).toLowerCase() !== expectedLane) {
    throw new Error(`${CONTRACT}_LANE_INVALID:${serviceId}`);
  }
  if (text(selected?.metadata?.lane_model_binding, 160) !== expectedBinding) {
    throw new Error(`${CONTRACT}_LANE_BINDING_INVALID:${serviceId}`);
  }
  const pricing = PricingRuntime.resolveRecord({
    pricing: selected.pricing_record,
    provider: selected.provider,
    capability: serviceId,
    model: selected.model,
    currency: selected.currency,
    usage: { quantity: 1 },
  });
  return { selected, pricing };
}

const fastLane = await resolveLane(FAST_SERVICE, FAST_MODEL, "fast", FAST_BINDING);
const deepLane = await resolveLane(DEEP_SERVICE, DEEP_MODEL, "deep", DEEP_BINDING);
const pricingCurrency = deepLane.pricing.currency || fastLane.pricing.currency;
if (
  upper(fastLane.pricing.currency) &&
  upper(deepLane.pricing.currency) &&
  upper(fastLane.pricing.currency) !== upper(deepLane.pricing.currency)
) {
  throw new Error(`${CONTRACT}_PRICING_CURRENCY_MISMATCH`);
}

const fastReservation = Math.max(0, finite(fastLane.pricing.customer_price));
const deepReservation = Math.max(0, finite(deepLane.pricing.customer_price));
const projectedMaxCharge = money(
  (fastReservation * EXPECTED_FAST_REQUESTS) +
  (deepReservation * EXPECTED_DEEP_REQUESTS),
);
const maxCharge = Math.max(
  0,
  finite(process.env.AVANTIQO_INTELLIGENCE_DEEP_CERT_MAX_CUSTOMER_CHARGE, DEFAULT_MAX_CUSTOMER_CHARGE),
);
if (projectedMaxCharge > maxCharge) {
  throw new Error(`${CONTRACT}_PROJECTED_CHARGE_LIMIT_EXCEEDED:${projectedMaxCharge}:${maxCharge}`);
}
const wallet = await WalletRepository.getByOrganization(organizationId);
if (!wallet?.id) throw new Error(`${CONTRACT}_PREPAID_WALLET_REQUIRED`);
if (upper(wallet.status) !== "ACTIVE") throw new Error(`${CONTRACT}_ACTIVE_WALLET_REQUIRED`);
if (upper(wallet.billing_policy) !== "PREPAID") throw new Error(`${CONTRACT}_PREPAID_POLICY_REQUIRED`);
if (upper(wallet.currency) && upper(pricingCurrency) && upper(wallet.currency) !== upper(pricingCurrency)) {
  throw new Error(`${CONTRACT}_WALLET_CURRENCY_MISMATCH`);
}
if (finite(wallet.available_balance) < projectedMaxCharge) {
  throw new Error(`${CONTRACT}_PREPAID_WALLET_BALANCE_INSUFFICIENT`);
}

const assessmentPath = `/tmp/avantiqo-intelligence-deep-cert-assessment-${process.pid}.json`;
const resultPath = `/tmp/avantiqo-intelligence-deep-cert-result-${process.pid}.json`;
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

console.log("=== DEEP ZERO-SPEND PRE-SPEND CAPACITY GATE ===");
const preflight = deepCapacity(commonEnv, `${CONTRACT}_PRE_CAPACITY`);
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  phase: "PREFLIGHT",
  repository_head: head,
  organization_source: organizationSource,
  organization_id_printed: false,
  fast_evidence_requests: EXPECTED_FAST_REQUESTS,
  deep_reasoning_requests: EXPECTED_DEEP_REQUESTS,
  fast_model: FAST_MODEL,
  deep_model: DEEP_MODEL,
  deep_live_capacity_targets: preflight.current_usable_target_count,
  projected_max_customer_charge: projectedMaxCharge,
  configured_max_customer_charge: maxCharge,
  external_fallback_allowed: false,
  production_activation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}_PREFLIGHT=PASS`);

const executionStartedAt = new Date().toISOString();

console.log("=== ONE FAST CURRENT-REPOSITORY EVIDENCE PASS ===");
const fastEnv = { ...commonEnv };
delete fastEnv.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE;
delete fastEnv.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT;
delete fastEnv.AVANTIQO_RUNPOD_SAFE_LEASE_LANE;
delete fastEnv.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID;
delete fastEnv.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT;
runNode([FAST_CHILD], fastEnv, `${CONTRACT}_FAST_EVIDENCE_FAILED`);

console.log("=== THREE DEEP SERVICE-ACCOUNTED REASONING PASSES ===");
runNode(
  [
    PARALLEL_SAFE_LEASE,
    "--lane=intelligence-deep",
    "--ttl-ms=1800000",
    "--",
    process.execPath,
    DEEP_CHILD,
  ],
  commonEnv,
  `${CONTRACT}_DEEP_REASONING_FAILED`,
);

const executionFinishedAt = new Date().toISOString();
const deepResult = JSON.parse(await readFile(resultPath, "utf8"));
if (deepResult?.contract !== SYSTEM_REASONING_CONTRACT) {
  throw new Error(`${CONTRACT}_DEEP_RESULT_CONTRACT_INVALID`);
}
if (deepResult?.status !== "READY_FOR_CODE") {
  throw new Error(`${CONTRACT}_DEEP_RESULT_STATUS_INVALID:${text(deepResult?.status, 120)}`);
}
if (text(deepResult?.mission_context?.repository_context?.head_sha, 160).toLowerCase() !== head) {
  throw new Error(`${CONTRACT}_DEEP_RESULT_HEAD_MISMATCH`);
}
if (deepResult?.governance?.source_mutation_performed !== false || deepResult?.governance?.deployment_performed !== false) {
  throw new Error(`${CONTRACT}_DEEP_GOVERNANCE_INVALID`);
}

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
    text(row?.provider_model, 300) === FAST_MODEL &&
    upper(row?.status) === "SUCCESS" &&
    upper(row?.execution_status) === "SUCCESS" &&
    metadata?.benchmark_only === true &&
    text(metadata?.repository_head, 160).toLowerCase() === head &&
    text(metadata?.product_repository_assessment_contract, 200) === FAST_ASSESSMENT_CONTRACT &&
    text(metadata?.intelligence_execution_lane, 40).toLowerCase() === "fast";
});
const deepRows = windowRows.filter((row) => {
  const metadata = object(row?.metadata);
  return text(row?.capability, 200) === DEEP_SERVICE &&
    text(row?.provider_model, 300) === DEEP_MODEL &&
    upper(row?.status) === "SUCCESS" &&
    upper(row?.execution_status) === "SUCCESS" &&
    metadata?.benchmark_only === true &&
    text(metadata?.repository_head, 160).toLowerCase() === head &&
    text(metadata?.intelligence_code_mission_system_reasoning_contract, 200) === SYSTEM_REASONING_CONTRACT &&
    text(metadata?.intelligence_execution_lane, 40).toLowerCase() === "deep" &&
    text(metadata?.intelligence_service_id, 200) === DEEP_SERVICE &&
    text(metadata?.intelligence_lane_service_policy, 200) === LANE_SERVICE_POLICY;
});
if (fastRows.length !== EXPECTED_FAST_REQUESTS) {
  throw new Error(`${CONTRACT}_FAST_USAGE_COUNT_INVALID:${fastRows.length}`);
}
if (deepRows.length !== EXPECTED_DEEP_REQUESTS) {
  throw new Error(`${CONTRACT}_DEEP_USAGE_COUNT_INVALID:${deepRows.length}`);
}

const certifiedRows = [...fastRows, ...deepRows];
const usageIds = certifiedRows.map((row) => text(row?.id, 200)).filter(Boolean);
const totalCustomerPrice = money(certifiedRows.reduce((sum, row) => sum + finite(row?.customer_price), 0));
if (totalCustomerPrice > maxCharge) {
  throw new Error(`${CONTRACT}_ACTUAL_CHARGE_LIMIT_EXCEEDED:${totalCustomerPrice}:${maxCharge}`);
}
const positiveRows = certifiedRows.filter((row) => finite(row?.customer_price) > 0);
let chargeRows = [];
if (usageIds.length) {
  const transactionResult = await supabaseAdmin
    .from("wallet_transactions")
    .select("id,type,amount,currency,provider,usage_id,created_at")
    .eq("organization_id", organizationId)
    .eq("provider", OWNED_PROVIDER)
    .eq("type", "CHARGE")
    .in("usage_id", usageIds);
  if (transactionResult.error) throw transactionResult.error;
  chargeRows = list(transactionResult.data);
}
const totalWalletCharge = money(chargeRows.reduce((sum, row) => sum + finite(row?.amount), 0));
if (chargeRows.length !== positiveRows.length) {
  throw new Error(`${CONTRACT}_WALLET_CHARGE_COUNT_INVALID:${chargeRows.length}:${positiveRows.length}`);
}
if (!closeEnough(totalWalletCharge, totalCustomerPrice)) {
  throw new Error(`${CONTRACT}_WALLET_RECONCILIATION_FAILED:${totalWalletCharge}:${totalCustomerPrice}`);
}

console.log("=== DEEP FINAL ZERO-SPEND CLEANUP GATE ===");
const finalCapacity = deepCapacity(commonEnv, `${CONTRACT}_FINAL_CAPACITY`);

const report = {
  success: true,
  contract: CONTRACT,
  repository_head: head,
  provider: OWNED_PROVIDER,
  external_provider_used: false,
  external_fallback_allowed: false,
  reasoning: {
    fast_evidence_requests: fastRows.length,
    deep_provider_requests: deepRows.length,
    deep_model: DEEP_MODEL,
    deep_execution_lane: "deep",
  },
  service_accounting: {
    successful_usage_rows: certifiedRows.length,
    deep_successful_usage_rows: deepRows.length,
    total_customer_price: totalCustomerPrice,
    currency: pricingCurrency,
    wallet_charge_rows: chargeRows.length,
    total_wallet_charge: totalWalletCharge,
    wallet_reconciled: true,
  },
  cleanup: {
    deep_workers_restored_0_0: finalCapacity.safe_lease_resting_0_0 === true,
    deep_queue_drained: finalCapacity.queue_drained === true,
    deep_workers_resting: finalCapacity.worker_resting === true,
  },
  deep_usage_ids: deepRows.map((row) => text(row?.id, 200)),
  production_activation_performed: false,
  production_deploy_performed: false,
  source_mutation_performed: false,
  raw_reasoning_persisted: false,
  organization_id_printed: false,
  secrets_printed: false,
};

const outputPath = text(
  process.env.AVANTIQO_INTELLIGENCE_DEEP_CERT_OUTPUT,
  1000,
) || "/tmp/avantiqo-intelligence-deep-production-service-certification.json";
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
