import { register } from "node:module";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import {
  CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS,
  shouldRecoverStaleQueuedPlannerJob,
} from "../lib/code/runtime/CodeAICertificationResiliencePolicy.js";

register("./next-alias-loader.mjs", import.meta.url);
loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_PLANNER_CERT_PENDING_SETTLEMENT_V1";
const ORGANIZATION_ID = "916fd3e7-b00b-4dd6-aaf3-bd01dd588e94";
const DEFAULT_USAGE_ID = "3d3ee1b4-97be-4cb1-9f37-2b04acc375e4";
const PROVIDER = "avantiqo-code";
const DEFAULT_PROVIDER_JOB_ID = "c2417291-d126-40ae-85d7-aa4bde77afae-e1";
const RUNPOD_REST = "https://rest.runpod.io/v1";
const RUNPOD_SERVERLESS = "https://api.runpod.ai/v2";
const MIN_ORPHAN_AGE_MS = CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS;
const MAX_WAIT_MS = 15 * 60_000;
const POLL_MS = 5_000;
const MAX_CONSECUTIVE_TRANSIENT_STATUS_ERRORS = 12;
const AMOUNT_EPSILON = 0.000001;

function text(value) {
  return String(value ?? "").trim();
}

const explicitUsageId = text(process.env.AVANTIQO_CODE_PLANNER_PENDING_USAGE_ID);
const explicitProviderJobId = text(process.env.AVANTIQO_CODE_PLANNER_PENDING_PROVIDER_JOB_ID);
if (Boolean(explicitUsageId) !== Boolean(explicitProviderJobId)) {
  throw new Error("AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_TARGET_PAIR_REQUIRED");
}
const USAGE_ID = explicitUsageId || DEFAULT_USAGE_ID;
const PROVIDER_JOB_ID = explicitProviderJobId || DEFAULT_PROVIDER_JOB_ID;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sameAmount(left, right) {
  return Math.abs(amount(left) - amount(right)) <= AMOUNT_EPSILON;
}

function transientRunpodStatusError(error) {
  const message = text(error?.message || error);
  const match = message.match(/AVANTIQO_CODE_RUNPOD_REQUEST_FAILED:(\d{3}):/);
  if (!match) return null;
  const status = Number(match[1]);
  if (status === 429 || (status >= 500 && status <= 599)) {
    return { status, message: message.slice(0, 1200) };
  }
  return null;
}

function healthSummary(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  const finite = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
      completed: finite(jobs.completed),
      failed: finite(jobs.failed),
      retried: finite(jobs.retried),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}

async function runpodRequest(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { response, body, raw };
}

async function locateOwningEndpoint({ managementKey, apiKey, configuredEndpointId, jobId }) {
  const endpointResponse = await runpodRequest(
    `${RUNPOD_REST}/endpoints?includeTemplate=true&includeWorkers=false`,
    managementKey,
  );
  if (!endpointResponse.response.ok || !Array.isArray(endpointResponse.body)) {
    throw new Error(
      `AVANTIQO_CODE_PLANNER_PENDING_ENDPOINT_LIST_FAILED:${endpointResponse.response.status}`,
    );
  }

  const endpoints = endpointResponse.body;
  const ordered = [
    ...endpoints.filter((endpoint) => text(endpoint?.id) === configuredEndpointId),
    ...endpoints.filter((endpoint) => text(endpoint?.id) !== configuredEndpointId),
  ];
  const seen = new Set();
  const probes = [];

  for (const endpoint of ordered) {
    const endpointId = text(endpoint?.id);
    if (!endpointId || seen.has(endpointId)) continue;
    seen.add(endpointId);

    const result = await runpodRequest(
      `${RUNPOD_SERVERLESS}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
      apiKey,
    );
    probes.push({
      endpoint_id: endpointId,
      endpoint_name: text(endpoint?.name) || null,
      status_code: result.response.status,
    });

    if (result.response.status === 404) continue;
    if (!result.response.ok) {
      throw new Error(
        `AVANTIQO_CODE_PLANNER_PENDING_ENDPOINT_PROBE_FAILED:${endpointId}:${result.response.status}`,
      );
    }

    return {
      found: true,
      endpoint_id: endpointId,
      endpoint_name: text(endpoint?.name) || null,
      configured_endpoint_matched: endpointId === configuredEndpointId,
      probed_endpoint_count: probes.length,
      provider_status: text(result.body?.status).toUpperCase() || null,
      all_probes_not_found: false,
    };
  }

  return {
    found: false,
    endpoint_id: null,
    endpoint_name: null,
    configured_endpoint_matched: false,
    probed_endpoint_count: probes.length,
    provider_status: null,
    all_probes_not_found:
      probes.length > 0 && probes.every((probe) => probe.status_code === 404),
  };
}

if (text(process.env.AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_APPROVED=YES_REQUIRED");
}
if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_DEVELOPMENT_ENV_REQUIRED");
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
if (!managementKey) {
  throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED_FOR_CODE_PENDING_ENDPOINT_DISCOVERY");
}

const codeApiKey = text(
  process.env.RUNPOD_AVANTIQO_CODE_API_KEY ||
  process.env.RUNPOD_API_KEY ||
  process.env.RUNPOD_MANAGEMENT_API_KEY,
);
if (!codeApiKey) {
  throw new Error("RUNPOD_CODE_QUEUE_CREDENTIAL_REQUIRED");
}
process.env.RUNPOD_API_KEY = codeApiKey;

const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const endpointResolution = await locateOwningEndpoint({
  managementKey,
  apiKey: codeApiKey,
  configuredEndpointId,
  jobId: PROVIDER_JOB_ID,
});

if (endpointResolution.found) {
  process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID = endpointResolution.endpoint_id;
  process.env.AVANTIQO_CODE_ENGINE_ENABLED = "true";
}

console.log(JSON.stringify({
  event: endpointResolution.found
    ? "AVANTIQO_CODE_PLANNER_PENDING_ENDPOINT_RESOLVED"
    : "AVANTIQO_CODE_PLANNER_PENDING_ENDPOINT_ORPHAN_CANDIDATE",
  contract: CONTRACT,
  usage_id: USAGE_ID,
  provider_job_id: PROVIDER_JOB_ID,
  explicit_target: Boolean(explicitUsageId),
  endpoint_id: endpointResolution.endpoint_id,
  endpoint_name: endpointResolution.endpoint_name,
  configured_endpoint_matched: endpointResolution.configured_endpoint_matched,
  probed_endpoint_count: endpointResolution.probed_endpoint_count,
  all_probes_not_found: endpointResolution.all_probes_not_found,
  provider_status: endpointResolution.provider_status,
  endpoint_mutation_performed: false,
  new_provider_execution_submitted: false,
  secrets_printed: false,
}));

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
const usageStatusBefore = text(usageBefore.status).toUpperCase();
if (!["PENDING", "SUCCESS", "FAILED"].includes(usageStatusBefore)) {
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
const reservedAmount = amount(usageBefore.metadata?.reservation_pricing?.customer_price);
const usageCreatedAtMs = Date.parse(text(usageBefore.created_at));
const usageAgeMs = Number.isFinite(usageCreatedAtMs)
  ? Math.max(0, Date.now() - usageCreatedAtMs)
  : 0;

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_START",
  contract: CONTRACT,
  usage_id: USAGE_ID,
  provider_job_id: PROVIDER_JOB_ID,
  endpoint_id: endpointResolution.endpoint_id,
  usage_status: usageBefore.status,
  usage_age_ms: usageAgeMs,
  service_usage_enabled: organizationService.usage_enabled,
  wallet_reserved_before: amount(walletBefore.reserved_balance),
  reservation_customer_price: reservedAmount,
  new_provider_execution_submitted: false,
  service_reenabled: false,
  secrets_printed: false,
}));

let result = null;
let orphanedJobReconciled = false;
let terminal = ["SUCCESS", "FAILED"].includes(usageStatusBefore);
let consecutiveTransientStatusErrors = 0;
let totalTransientStatusErrors = 0;
let staleQueuedJobCanceled = false;

if (endpointResolution.found && usageStatusBefore === "PENDING") {
  const healthProbe = await runpodRequest(
    `${RUNPOD_SERVERLESS}/${encodeURIComponent(endpointResolution.endpoint_id)}/health`,
    codeApiKey,
  );
  const health = healthProbe.response.ok ? healthSummary(healthProbe.body) : null;
  if (shouldRecoverStaleQueuedPlannerJob({
    provider: PROVIDER,
    providerStatus: endpointResolution.provider_status,
    startedAt: usageBefore.created_at,
    recoveryCount: 0,
    health,
  })) {
    const cancel = await runpodRequest(
      `${RUNPOD_SERVERLESS}/${encodeURIComponent(endpointResolution.endpoint_id)}/cancel/${encodeURIComponent(PROVIDER_JOB_ID)}`,
      codeApiKey,
      { method: "POST" },
    );
    if (!cancel.response.ok) {
      throw new Error(
        `AVANTIQO_CODE_PLANNER_PENDING_STALE_CANCEL_FAILED:${cancel.response.status}`,
      );
    }
    staleQueuedJobCanceled = true;
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_PLANNER_PENDING_STALE_QUEUE_CANCELED",
      contract: CONTRACT,
      usage_id: USAGE_ID,
      provider_job_id: PROVIDER_JOB_ID,
      endpoint_id: endpointResolution.endpoint_id,
      provider_status_before_cancel: endpointResolution.provider_status,
      usage_age_ms: usageAgeMs,
      exact_job_cancel_only: true,
      blind_queue_purge_performed: false,
      new_provider_execution_submitted: false,
      service_reenabled: false,
      secrets_printed: false,
    }));
  }
}

if (!endpointResolution.found) {
  if (!endpointResolution.all_probes_not_found) {
    throw new Error("AVANTIQO_CODE_PLANNER_PENDING_ORPHAN_EVIDENCE_INCOMPLETE");
  }
  if (endpointResolution.probed_endpoint_count < 1) {
    throw new Error("AVANTIQO_CODE_PLANNER_PENDING_ORPHAN_ENDPOINT_PROBE_REQUIRED");
  }
  if (usageAgeMs < MIN_ORPHAN_AGE_MS) {
    throw new Error(
      `AVANTIQO_CODE_PLANNER_PENDING_ORPHAN_MINIMUM_AGE_REQUIRED:${usageAgeMs}:${MIN_ORPHAN_AGE_MS}`,
    );
  }
  if (reservedAmount <= 0) {
    throw new Error("AVANTIQO_CODE_PLANNER_PENDING_ORPHAN_RESERVATION_REQUIRED");
  }

  if (usageStatusBefore === "SUCCESS") {
    throw new Error("AVANTIQO_CODE_PLANNER_PENDING_ORPHAN_SUCCESS_USAGE_RECONCILIATION_REFUSED");
  }

  const walletReservedBefore = amount(walletBefore.reserved_balance);
  if (walletReservedBefore > 0 && !sameAmount(walletReservedBefore, reservedAmount)) {
    throw new Error(
      `AVANTIQO_CODE_PLANNER_PENDING_ORPHAN_WALLET_SCOPE_UNSAFE:${walletReservedBefore}:${reservedAmount}`,
    );
  }

  if (usageStatusBefore === "PENDING") {
    const orphanError = new Error(
      `AVANTIQO_CODE_PROVIDER_JOB_ORPHANED_ALL_CURRENT_ENDPOINTS_404:${PROVIDER_JOB_ID}`,
    );
    await UsageRuntime.fail({
      usage_id: USAGE_ID,
      error: orphanError,
      latency_ms: usageAgeMs,
      metadata: {
        ...(usageBefore.metadata || {}),
        certification_contract: CONTRACT,
        certification_pending_reconciliation: true,
        provider_job_id: PROVIDER_JOB_ID,
        provider_status: "ORPHANED_NOT_FOUND",
        orphaned_provider_job_reconciled: true,
        all_current_endpoints_returned_404: true,
        probed_endpoint_count: endpointResolution.probed_endpoint_count,
        minimum_orphan_age_ms: MIN_ORPHAN_AGE_MS,
        observed_usage_age_ms: usageAgeMs,
        new_provider_execution_submitted: false,
        service_reenabled: false,
      },
    });
  }

  if (walletReservedBefore > 0) {
    await WalletRuntime.release({
      organization_id: ORGANIZATION_ID,
      amount: reservedAmount,
      provider: PROVIDER,
      reference: USAGE_ID,
      currency: usageBefore.currency || "THB",
      metadata: {
        usage_id: USAGE_ID,
        provider_job_id: PROVIDER_JOB_ID,
        settlement: "ORPHANED_PROVIDER_JOB_RELEASE",
        all_current_endpoints_returned_404: true,
        probed_endpoint_count: endpointResolution.probed_endpoint_count,
      },
    });
  }

  orphanedJobReconciled = true;
  terminal = true;
  result = {
    success: false,
    pending: false,
    failed: true,
    orphaned: true,
    provider: PROVIDER,
    provider_job_id: PROVIDER_JOB_ID,
    provider_status: "ORPHANED_NOT_FOUND",
    settlement: walletReservedBefore > 0 ? "RELEASED" : "ALREADY_RELEASED",
  };

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_PLANNER_PENDING_ORPHAN_RECONCILED",
    contract: CONTRACT,
    usage_id: USAGE_ID,
    provider_job_id: PROVIDER_JOB_ID,
    probed_endpoint_count: endpointResolution.probed_endpoint_count,
    usage_age_ms: usageAgeMs,
    reservation_released: walletReservedBefore > 0,
    released_amount: walletReservedBefore > 0 ? reservedAmount : 0,
    new_provider_execution_submitted: false,
    service_reenabled: false,
    secrets_printed: false,
  }));
} else {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (!terminal && Date.now() < deadline) {
    try {
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
          recovered_provider_endpoint_id: endpointResolution.endpoint_id,
          new_provider_execution_submitted: false,
          service_reenabled: false,
        },
        started_at: usageBefore.created_at || null,
      });
      consecutiveTransientStatusErrors = 0;
    } catch (error) {
      const transient = transientRunpodStatusError(error);
      if (!transient) throw error;

      consecutiveTransientStatusErrors += 1;
      totalTransientStatusErrors += 1;
      const healthProbe = await runpodRequest(
        `${RUNPOD_SERVERLESS}/${encodeURIComponent(endpointResolution.endpoint_id)}/health`,
        codeApiKey,
      );
      const health = healthProbe.response.ok
        ? healthSummary(healthProbe.body)
        : null;

      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_PLANNER_PENDING_TRANSIENT_STATUS_ERROR",
        contract: CONTRACT,
        usage_id: USAGE_ID,
        provider_job_id: PROVIDER_JOB_ID,
        endpoint_id: endpointResolution.endpoint_id,
        http_status: transient.status,
        consecutive_transient_status_errors: consecutiveTransientStatusErrors,
        transient_status_error_limit: MAX_CONSECUTIVE_TRANSIENT_STATUS_ERRORS,
        endpoint_health_http_status: healthProbe.response.status,
        endpoint_health: health,
        new_provider_execution_submitted: false,
        service_reenabled: false,
        reservation_preserved: true,
        secrets_printed: false,
      }));

      if (consecutiveTransientStatusErrors >= MAX_CONSECUTIVE_TRANSIENT_STATUS_ERRORS) {
        throw new Error(
          `AVANTIQO_CODE_PLANNER_PENDING_TRANSIENT_STATUS_ERROR_LIMIT:${transient.status}:${consecutiveTransientStatusErrors}`,
        );
      }
      await sleep(POLL_MS);
      continue;
    }

    const usageNow = await UsageRuntime.get(USAGE_ID);
    const status = text(usageNow?.status).toUpperCase() || "UNKNOWN";
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_PROGRESS",
      contract: CONTRACT,
      usage_id: USAGE_ID,
      provider_job_id: PROVIDER_JOB_ID,
      endpoint_id: endpointResolution.endpoint_id,
      provider_pending: result?.pending === true,
      provider_failed: result?.failed === true,
      provider_status: result?.provider_status || null,
      usage_status: status,
      total_transient_status_errors: totalTransientStatusErrors,
      new_provider_execution_submitted: false,
      service_reenabled: false,
      secrets_printed: false,
    }));

    terminal = ["SUCCESS", "FAILED"].includes(status);
    if (!terminal) await sleep(POLL_MS);
  }
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
if (!sameAmount(walletAfter.reserved_balance, 0)) {
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
  endpoint_found: endpointResolution.found,
  endpoint_id: endpointResolution.endpoint_id,
  endpoint_name: endpointResolution.endpoint_name,
  probed_endpoint_count: endpointResolution.probed_endpoint_count,
  orphaned_job_reconciled: orphanedJobReconciled,
  stale_queued_job_canceled: staleQueuedJobCanceled,
  usage_status: finalStatus,
  provider_status: result?.provider_status || null,
  total_transient_status_errors: totalTransientStatusErrors,
  supplier_cost: Number(usageAfter?.supplier_cost || 0),
  customer_price: Number(usageAfter?.customer_price || 0),
  charged_amount: Number(usageAfter?.charged_amount || 0),
  wallet_available_before: Number(walletBefore.available_balance || 0),
  wallet_available_after: Number(walletAfter.available_balance || 0),
  wallet_reserved_after: Number(walletAfter.reserved_balance || 0),
  service_usage_enabled: serviceAfter.usage_enabled,
  endpoint_mutation_performed: false,
  new_provider_execution_submitted: false,
  service_reenabled: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
