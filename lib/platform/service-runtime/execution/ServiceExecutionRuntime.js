import {
  OrganizationServiceRuntime,
} from "../services/runtime/OrganizationServiceRuntime";

import {
  resolveProvider,
} from "../providers/ProviderResolver";

import {
  executeProvider,
  getProviderStatus,
} from "../providers/ProviderExecutor";

import {
  PricingRuntime,
} from "../pricing/PricingRuntime";

import {
  WalletRuntime,
} from "../wallet/runtime/WalletRuntime";

import {
  UsageRuntime,
} from "../usage/UsageRuntime";

import {
  BillingRuntime,
} from "../billing/runtime/BillingRuntime";

import {
  resolveServiceCapabilities,
} from "../services/resolver/ServiceCapabilityResolver";

import {
  resolvePrimaryExecutionCapability,
} from "../services/resolver/CapabilityExecutionResolver";

const PENDING_STATUSES = new Set([
  "pending",
  "queued",
  "submitted",
  "processing",
  "running",
  "in_progress",
  "in-progress",
]);

const SUCCESS_STATUSES = new Set([
  "complete",
  "completed",
  "succeeded",
  "success",
  "finished",
  "done",
]);

const FAILURE_STATUSES = new Set([
  "failed",
  "failure",
  "cancelled",
  "canceled",
  "rejected",
  "error",
  "expired",
]);

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function urlFrom(value, seen = new Set()) {
  if (!value) return null;
  if (typeof value === "string") {
    return /^(https?:\/\/|data:|blob:|s3:\/\/|gs:\/\/)/i.test(value)
      ? value
      : null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => urlFrom(item, seen)).find(Boolean) || null;
  }

  const direct = first(
    value.url,
    value.file_url,
    value.fileUrl,
    value.image_url,
    value.imageUrl,
    value.video_url,
    value.videoUrl,
    value.audio_url,
    value.audioUrl,
    value.download_url,
    value.downloadUrl,
  );
  const directUrl = urlFrom(direct, seen);
  if (directUrl) return directUrl;

  for (const key of [
    "output",
    "outputs",
    "result",
    "results",
    "data",
    "files",
    "images",
    "videos",
    "audio",
  ]) {
    const nested = urlFrom(value[key], seen);
    if (nested) return nested;
  }

  return null;
}

function executionState(result = {}) {
  const output = result?.output || result || {};
  const status = String(first(
    output.status,
    output.state,
    output.phase,
    result.status,
    result.state,
    result.phase,
  ) || "").toLowerCase();
  const jobId = first(
    output.provider_job_id,
    output.providerJobId,
    output.job_id,
    output.jobId,
    output.task_id,
    output.taskId,
    output.request_id,
    output.requestId,
    output.video_job_id,
    output.videoJobId,
    result.provider_job_id,
    result.providerJobId,
    result.job_id,
    result.jobId,
    result.task_id,
    result.taskId,
    result.request_id,
    result.requestId,
  );
  const mediaUrl = urlFrom(output) || urlFrom(result);
  const failed = FAILURE_STATUSES.has(status);
  const completed = Boolean(mediaUrl) || SUCCESS_STATUSES.has(status);
  const pending = !failed && !completed && (
    Boolean(jobId) ||
    PENDING_STATUSES.has(status)
  );

  return {
    pending,
    failed,
    completed,
    job_id: jobId,
    media_url: mediaUrl,
    provider_status: status || null,
  };
}

function failureMessage(result = {}, state = {}) {
  return first(
    result?.error?.message,
    result?.error,
    result?.message,
    result?.output?.error?.message,
    result?.output?.error,
    result?.output?.message,
    state.provider_status && `Provider job ${state.provider_status}`,
    "Provider job failed",
  );
}

function latencyFrom(startedAt) {
  const timestamp = Date.parse(startedAt || "");
  return Number.isFinite(timestamp)
    ? Math.max(0, Date.now() - timestamp)
    : null;
}

export async function executeService(input = {}) {
  const {
    organization_id,
    party_id = null,
    entity_id = null,
    service_id,
    provider_id = null,
    input: payload = {},
    metadata = {},
    category = "SERVICE",
    provider_policy = {},
  } = input;

  if (!organization_id) throw new Error("organization_id required");
  if (!service_id) throw new Error("service_id required");

  const organizationService = await OrganizationServiceRuntime.get({
    organization_id,
    service_id,
  });

  if (!organizationService) {
    throw new Error(`Service ${service_id} is not enabled for organization`);
  }

  const serviceCapabilities = resolveServiceCapabilities(service_id);
  if (!serviceCapabilities?.capabilities?.length) {
    throw new Error(`No enabled capability mapping found for ${service_id}`);
  }

  const executionCapability = resolvePrimaryExecutionCapability(
    serviceCapabilities.capabilities,
  );
  if (!executionCapability) {
    throw new Error(`No execution capability found for ${service_id}`);
  }

  const country = payload.country ?? input.country ?? null;
  const currency = payload.currency ?? input.currency ?? null;
  const selectedProvider = await resolveProvider({
    organization_id,
    capability: executionCapability,
    preferredProvider: provider_id,
    country,
    currency,
    policy: {
      ...(organizationService.provider_policy || {}),
      ...(provider_policy || {}),
    },
  });
  const provider = selectedProvider.provider;
  const model = selectedProvider.model;
  const pricing = await PricingRuntime.resolve({
    provider,
    model,
    capability: executionCapability,
    country,
    currency,
  });
  const quantity = Number(payload.quantity ?? input.quantity ?? 1);
  const unit = pricing.unit || "request";
  const usage = await UsageRuntime.start({
    organization_id,
    bill_to_organization_id:
      input.bill_to_organization_id || organization_id,
    party_id,
    entity_id,
    organization_service_id: organizationService.id,
    pricing_id: pricing.pricing_id,
    category,
    provider,
    capability: executionCapability,
    operation: executionCapability,
    currency: pricing.currency,
    quantity,
    unit,
    metadata: {
      ...metadata,
      model,
      provider_selection: selectedProvider.selection_evidence || null,
    },
  });

  await WalletRuntime.reserve({
    organization_id,
    amount: pricing.customer_price,
    provider,
    reference: usage.id,
  });

  const startedAt = Date.now();

  try {
    const result = await executeProvider({
      provider,
      capability: executionCapability,
      model,
      input: payload,
      context: {
        organization_id,
        party_id,
        entity_id,
        credential_id: selectedProvider.credential_id || null,
        organization_service_id: organizationService.id,
        country,
        currency: pricing.currency,
        usage_id: usage.id,
      },
    });
    const state = executionState(result);

    if (state.pending) {
      if (!state.job_id) {
        throw new Error("PROVIDER_PENDING_JOB_ID_REQUIRED");
      }

      return {
        success: true,
        pending: true,
        provider,
        model,
        pricing,
        usage,
        credential_id: selectedProvider.credential_id || null,
        settlement: "RESERVED",
        provider_job_id: state.job_id,
        provider_status: state.provider_status,
        started_at: new Date(startedAt).toISOString(),
        output: result,
      };
    }

    if (state.failed) {
      throw new Error(failureMessage(result, state));
    }

    const completedUsage = await UsageRuntime.complete({
      usage_id: usage.id,
      supplier_cost: pricing.supplier_cost,
      platform_markup: pricing.platform_markup,
      customer_price: pricing.customer_price,
      quantity,
      unit,
      latency_ms: Date.now() - startedAt,
      metadata: {
        ...metadata,
        model,
        result,
      },
    });

    await WalletRuntime.charge({
      organization_id,
      amount: pricing.customer_price,
      provider,
      usage_id: completedUsage.id,
      reference: completedUsage.id,
    });

    const billing = await BillingRuntime.billUsage({
      usage_id: completedUsage.id,
    });

    return {
      success: true,
      pending: false,
      provider,
      model,
      pricing,
      usage: billing.usage,
      billing,
      settlement: "CHARGED",
      output: result,
    };
  } catch (error) {
    await UsageRuntime.fail({
      usage_id: usage.id,
      error,
      latency_ms: Date.now() - startedAt,
      metadata,
    }).catch(() => null);

    await WalletRuntime.release({
      organization_id,
      amount: pricing.customer_price,
      provider,
      reference: usage.id,
    });

    throw error;
  }
}

export async function settlePendingService(input = {}) {
  const {
    organization_id,
    provider,
    provider_job_id,
    usage_id,
    pricing = {},
    quantity = null,
    unit = null,
    metadata = {},
    provider_status_input = {},
    credential_id = null,
    started_at = null,
  } = input;

  if (!organization_id) throw new Error("organization_id required");
  if (!provider) throw new Error("provider required");
  if (!provider_job_id) throw new Error("provider_job_id required");
  if (!usage_id) throw new Error("usage_id required");

  const usage = await UsageRuntime.get(usage_id);
  if (!usage || usage.organization_id !== organization_id) {
    throw new Error("Service usage not found");
  }
  if (usage.provider && usage.provider !== provider) {
    throw new Error("Provider does not match reserved usage");
  }

  const result = await getProviderStatus({
    provider,
    job_id: provider_job_id,
    input: provider_status_input,
    context: {
      organization_id,
      credential_id,
      usage_id,
    },
  });
  const state = executionState(result);

  if (state.failed) {
    const error = new Error(failureMessage(result, state));
    if (usage.status !== "FAILED" && usage.status !== "SUCCESS") {
      await UsageRuntime.fail({
        usage_id,
        error,
        latency_ms: latencyFrom(started_at),
        metadata: {
          ...(usage.metadata || {}),
          ...metadata,
          provider_job_id,
          provider_status: state.provider_status,
          provider_result: result,
        },
      });
      await WalletRuntime.release({
        organization_id,
        amount: Number(pricing.customer_price || usage.customer_price || 0),
        provider,
        reference: usage_id,
      });
    }

    return {
      success: false,
      pending: false,
      failed: true,
      provider,
      provider_job_id,
      provider_status: state.provider_status,
      settlement: usage.status === "SUCCESS" ? "CHARGED" : "RELEASED",
      error: error.message,
      output: result,
    };
  }

  if (state.pending || !state.completed) {
    return {
      success: true,
      pending: true,
      failed: false,
      provider,
      provider_job_id,
      provider_status: state.provider_status || "unknown",
      settlement: "RESERVED",
      output: result,
    };
  }

  const resolvedQuantity = Number(quantity ?? usage.quantity ?? 1);
  const resolvedUnit = unit || usage.unit || pricing.unit || "request";
  const supplierCost = Number(pricing.supplier_cost ?? usage.supplier_cost ?? 0);
  const platformMarkup = Number(pricing.platform_markup ?? usage.platform_markup ?? 0);
  const customerPrice = Number(pricing.customer_price ?? usage.customer_price ?? 0);
  const completedUsage = usage.status === "SUCCESS"
    ? usage
    : await UsageRuntime.complete({
        usage_id,
        supplier_cost: supplierCost,
        platform_markup: platformMarkup,
        customer_price: customerPrice,
        quantity: resolvedQuantity,
        unit: resolvedUnit,
        latency_ms: latencyFrom(started_at),
        metadata: {
          ...(usage.metadata || {}),
          ...metadata,
          provider_job_id,
          provider_status: state.provider_status,
          provider_result: result,
        },
      });

  await WalletRuntime.charge({
    organization_id,
    amount: customerPrice,
    provider,
    usage_id: completedUsage.id,
    reference: completedUsage.id,
  });

  const billing = await BillingRuntime.billUsage({
    usage_id: completedUsage.id,
  });

  return {
    success: true,
    pending: false,
    failed: false,
    provider,
    provider_job_id,
    provider_status: state.provider_status || "completed",
    pricing,
    usage: billing.usage,
    billing,
    settlement: "CHARGED",
    output: {
      url: state.media_url,
      provider_job_id,
      status: state.provider_status || "completed",
      raw: result,
    },
  };
}

export const ServiceExecutionRuntime = {
  execute: executeService,
  settle: settlePendingService,
};
