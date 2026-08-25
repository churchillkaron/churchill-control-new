import { register } from "node:module";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

register("./next-alias-loader.mjs", import.meta.url);
loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_PLANNER_CERT_PENDING_SETTLEMENT_V1";
const ORGANIZATION_ID = "916fd3e7-b00b-4dd6-aaf3-bd01dd588e94";
const USAGE_ID = "3d3ee1b4-97be-4cb1-9f37-2b04acc375e4";
const PROVIDER = "avantiqo-code";
const PROVIDER_JOB_ID = "c2417291-d126-40ae-85d7-aa4bde77afae-e1";
const MAX_WAIT_MS = 15 * 60_000;
const POLL_MS = 5_000;

function text(value) {
  return String(value ?? "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (text(process.env.AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_APPROVED=YES_REQUIRED");
}
if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_DEVELOPMENT_ENV_REQUIRED");
}
if (!text(process.env.RUNPOD_API_KEY)) {
  const fallback = text(
    process.env.RUNPOD_AVANTIQO_CODE_API_KEY ||
    process.env.RUNPOD_MANAGEMENT_API_KEY,
  );
  if (fallback) process.env.RUNPOD_API_KEY = fallback;
}
if (!text(process.env.RUNPOD_API_KEY)) {
  throw new Error("RUNPOD_CODE_QUEUE_CREDENTIAL_REQUIRED");
}

const [
  { ServiceExecutionRuntime },
  { UsageRuntime },
  { WalletRuntime },
  { OrganizationServiceRuntime },
] = await Promise.all([
  import("../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js"),
  import("../lib/platform/service-runtime/usage/UsageRuntime.js"),
  import("../lib/platform/service-runtime/wallet/runtime/WalletRuntime.js"),
  import("../lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime.js"),
]);

const usageBefore = await UsageRuntime.get(USAGE_ID);
if (!usageBefore) throw new Error("AVANTIQO_CODE_PLANNER_PENDING_USAGE_NOT_FOUND");
if (text(usageBefore.organization_id) !== ORGANIZATION_ID) {
  throw new Error("AVANTIQO_CODE_PLANNER_PENDING_USAGE_ORGANIZATION_MISMATCH");
}
if (text(usageBefore.provider) !== PROVIDER) {
  throw new Error("AVANTIQO_CODE_PLANNER_PENDING_USAGE_PROVIDER_MISMATCH");
}
if (text(usageBefore.provider_request_id) !== PROVIDER_JOB_ID) {
  throw new Error("AVANTIQO_CODE_PLANNER_PENDING_USAGE_PROVIDER_JOB_MISMATCH");
}
if (!["PENDING", "SUCCESS", "FAILED"].includes(text(usageBefore.status).toUpperCase())) {
  throw new Error(`AVANTIQO_CODE_PLANNER_PENDING_USAGE_STATUS_UNSAFE:${usageBefore.status}`);
}

const organizationService = await OrganizationServiceRuntime.get({
  organization_id: ORGANIZATION_ID,
  service_id: "ai.code.debug",
});
if (!organizationService) {
  throw new Error("AVANTIQO_CODE_PLANNER_CERT_ORGANIZATION_SERVICE_NOT_FOUND");
}
if (organizationService.usage_enabled !== false) {
  throw new Error("AVANTIQO_CODE_PLANNER_CERT_USAGE_MUST_REMAIN_DISABLED_DURING_SETTLEMENT");
}

const walletBefore = await WalletRuntime.prepaid({
  organization_id: ORGANIZATION_ID,
  currency: "THB",
  require_positive_balance: false,
});

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_START",
  contract: CONTRACT,
  usage_id: USAGE_ID,
  provider_job_id: PROVIDER_JOB_ID,
  usage_status: usageBefore.status,
  service_usage_enabled: organizationService.usage_enabled,
  wallet_reserved_before: Number(walletBefore.reserved_balance || 0),
  new_provider_execution_submitted: false,
  service_reenabled: false,
  secrets_printed: false,
}));

let result = null;
let terminal = ["SUCCESS", "FAILED"].includes(text(usageBefore.status).toUpperCase());
const deadline = Date.now() + MAX_WAIT_MS;

while (!terminal && Date.now() < deadline) {
  result = await ServiceExecutionRuntime.settle({
    organization_id: ORGANIZATION_ID,
    provider: PROVIDER,
    provider_job_id: PROVIDER_JOB_ID,
    usage_id: USAGE_ID,
    pricing: {},
    quantity: Number(usageBefore.quantity || 1),
    unit: text(usageBefore.unit) || "request",
    metadata: {
      certification_contract: CONTRACT,
      certification_pending_reconciliation: true,
      new_provider_execution_submitted: false,
      service_reenabled: false,
    },
    started_at: usageBefore.created_at || null,
  });

  const usageNow = await UsageRuntime.get(USAGE_ID);
  const status = text(usageNow?.status).toUpperCase() || "UNKNOWN";
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_PROGRESS",
    contract: CONTRACT,
    usage_id: USAGE_ID,
    provider_job_id: PROVIDER_JOB_ID,
    provider_pending: result?.pending === true,
    provider_failed: result?.failed === true,
    provider_status: result?.provider_status || null,
    usage_status: status,
    new_provider_execution_submitted: false,
    service_reenabled: false,
    secrets_printed: false,
  }));

  terminal = ["SUCCESS", "FAILED"].includes(status);
  if (!terminal) await sleep(POLL_MS);
}

const usageAfter = await UsageRuntime.get(USAGE_ID);
const walletAfter = await WalletRuntime.prepaid({
  organization_id: ORGANIZATION_ID,
  currency: "THB",
  require_positive_balance: false,
});
const serviceAfter = await OrganizationServiceRuntime.get({
  organization_id: ORGANIZATION_ID,
  service_id: "ai.code.debug",
});

const finalStatus = text(usageAfter?.status).toUpperCase() || "UNKNOWN";
if (!["SUCCESS", "FAILED"].includes(finalStatus)) {
  throw new Error(`AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_TIMEOUT:${finalStatus}`);
}
if (Number(walletAfter.reserved_balance || 0) !== 0) {
  throw new Error(`AVANTIQO_CODE_PLANNER_PENDING_RESERVATION_REMAINS:${walletAfter.reserved_balance}`);
}
if (serviceAfter?.usage_enabled !== false) {
  throw new Error("AVANTIQO_CODE_PLANNER_CERT_SERVICE_REENABLED_UNEXPECTEDLY");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  organization_id: ORGANIZATION_ID,
  usage_id: USAGE_ID,
  provider: PROVIDER,
  provider_job_id: PROVIDER_JOB_ID,
  usage_status: finalStatus,
  supplier_cost: Number(usageAfter?.supplier_cost || 0),
  customer_price: Number(usageAfter?.customer_price || 0),
  charged_amount: Number(usageAfter?.charged_amount || 0),
  wallet_available_before: Number(walletBefore.available_balance || 0),
  wallet_available_after: Number(walletAfter.available_balance || 0),
  wallet_reserved_after: Number(walletAfter.reserved_balance || 0),
  service_usage_enabled: serviceAfter.usage_enabled,
  new_provider_execution_submitted: false,
  service_reenabled: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
