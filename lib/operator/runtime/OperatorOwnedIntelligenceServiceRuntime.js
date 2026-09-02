import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const CONTRACT = "AVANTIQO_OPERATOR_OWNED_INTELLIGENCE_SERVICE_V1";
const OWNED_PROVIDER = "avantiqo-intelligence";
const LOCAL_REVIEW_SCOPE = "BENCHMARK_REVIEW_PREVIEW";
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_POLLS = 300;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function positiveInteger(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return fallback;
  return Math.min(number, maximum);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ownedOperatorIntelligenceSelectionPolicy() {
  const local = text(process.env.NODE_ENV, 40).toLowerCase() === "development";
  return {
    provider_id: OWNED_PROVIDER,
    provider_policy: {
      allowed_providers: [OWNED_PROVIDER],
      owned_only_required: true,
      external_fallback_allowed: false,
      ...(local
        ? {
            execution_scope: LOCAL_REVIEW_SCOPE,
            benchmark_only: true,
          }
        : {}),
    },
  };
}

export async function settleOperatorIntelligenceExecution({
  organization_id,
  execution,
  service_id,
  execution_lane,
  metadata = {},
  poll_interval_ms = DEFAULT_POLL_INTERVAL_MS,
  max_polls = DEFAULT_MAX_POLLS,
} = {}) {
  if (execution?.pending !== true) return execution;

  const organizationId = text(organization_id, 200);
  const provider = text(execution?.provider, 160) || OWNED_PROVIDER;
  const providerJobId = text(execution?.provider_job_id, 600);
  const usageId = text(execution?.usage?.id, 240);
  const serviceId = text(service_id, 240);
  const executionLane = text(execution_lane, 80).toLowerCase();

  if (!organizationId) {
    throw new Error("AVANTIQO_OPERATOR_INTELLIGENCE_SETTLEMENT_ORGANIZATION_REQUIRED");
  }
  if (provider !== OWNED_PROVIDER) {
    throw new Error(`AVANTIQO_OPERATOR_INTELLIGENCE_OWNED_PROVIDER_REQUIRED:${provider}`);
  }
  if (!providerJobId || !usageId || !serviceId) {
    throw new Error("AVANTIQO_OPERATOR_INTELLIGENCE_PENDING_SETTLEMENT_BINDING_REQUIRED");
  }
  if (!["fast", "deep"].includes(executionLane)) {
    throw new Error(`AVANTIQO_OPERATOR_INTELLIGENCE_SETTLEMENT_LANE_INVALID:${executionLane}`);
  }

  const pollInterval = positiveInteger(poll_interval_ms, DEFAULT_POLL_INTERVAL_MS, 5000);
  const maxPolls = positiveInteger(max_polls, DEFAULT_MAX_POLLS, 600);

  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const settled = await ServiceExecutionRuntime.settle({
      organization_id: organizationId,
      provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: object(execution?.pricing),
      quantity: execution?.usage?.quantity ?? 1,
      unit: execution?.usage?.unit || execution?.pricing?.unit || "request",
      metadata: {
        ...object(metadata),
        operator_owned_intelligence_contract: CONTRACT,
        owned_provider_required: true,
        external_fallback_allowed: false,
        provider_job_reused: true,
        duplicate_provider_job_submitted: false,
        service_id: serviceId,
        execution_lane: executionLane,
        pending_settlement_poll: poll,
        raw_reasoning_persisted: false,
      },
      provider_status_input: {
        capability: serviceId,
        execution_lane: executionLane,
      },
      credential_id: execution?.credential_id || null,
      started_at: execution?.started_at || null,
    });

    if (settled?.pending === true) {
      if (poll < maxPolls) await sleep(pollInterval);
      continue;
    }

    if (settled?.failed === true || settled?.success !== true) {
      throw new Error(
        `AVANTIQO_OPERATOR_INTELLIGENCE_PENDING_SETTLEMENT_FAILED:${text(settled?.error, 1200) || "UNKNOWN"}`,
      );
    }

    return {
      ...object(execution),
      ...object(settled),
      provider: settled?.provider || execution?.provider || OWNED_PROVIDER,
      model: execution?.model || settled?.model || null,
      pricing: settled?.pricing || execution?.pricing || null,
      usage: settled?.usage || execution?.usage || null,
      output: settled?.output,
      pending: false,
      provider_job_id: providerJobId,
      operator_intelligence_settled: true,
      duplicate_provider_job_submitted: false,
    };
  }

  throw new Error("AVANTIQO_OPERATOR_INTELLIGENCE_PENDING_SETTLEMENT_TIMEOUT");
}

export const OperatorOwnedIntelligenceServiceRuntime = Object.freeze({
  contract: CONTRACT,
  provider: OWNED_PROVIDER,
  selectionPolicy: ownedOperatorIntelligenceSelectionPolicy,
  settle: settleOperatorIntelligenceExecution,
});

export default OperatorOwnedIntelligenceServiceRuntime;
