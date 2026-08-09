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
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  ) ?? null;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
    Boolean(jobId) || PENDING_STATUSES.has(status)
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

function providerUsage(result = {}) {
  const candidates = [
    result?.usage,
    result?.output?.usage,
    result?.output?.raw?.usage,
    result?.raw?.usage,
    result?.result?.usage,
    result?.data?.usage,
  ].filter((value) => value && typeof value === "object");
  const usage = candidates[0] || {};

  return {
    input_tokens: finite(first(
      usage.input_tokens,
      usage.inputTokens,
      usage.prompt_tokens,
      usage.promptTokens,
    )),
    output_tokens: finite(first(
      usage.output_tokens,
      usage.outputTokens,
      usage.completion_tokens,
      usage.completionTokens,
    )),
  };
}

async function actualPricing({ pricing, result }) {
  if (pricing?.estimated !== true) return pricing;

  const usage = providerUsage(result);
  return PricingRuntime.resolveById({
    pricing_id: pricing.pricing_id,
    currency: pricing.currency,
    usage: {
      ...usage,
      actual: true,
    },
  });
}

async function walletGate({
  organizationId,
  provider,
  usageId,
  pricing,
}) {
  const amount = finite(pricing?.customer_price);

  if (amount > 0) {
    await WalletRuntime.reserve({
      organization_id: organizationId,
      amount,
      provider,
      reference: usageId,
      currency: pricing.currency,
      metadata: {
        usage_id: usageId,
        pricing_id: pricing.pricing_id,
        estimated: pricing.estimated === true,
      },
    });

    return {
      mode: "RESERVED",
      reserved_amount: amount,
    };
  }

  if (pricing?.zero_price !== true) {
    throw new Error("SERVICE_ZERO_PRICE_MUST_BE_EXPLICIT");
  }

  const wallet = await WalletRuntime.getOrCreate({
    organization_id: organizationId,
    currency: pricing.currency,
  });

  return {
    mode: "ZERO_PRICE_WALLET_CHECK",
    reserved_amount: 0,
    wallet_id: wallet?.id || null,
  };
}

async function settleReservation({
  organizationId,
  provider,
  usageId,
  reservedAmount,
  chargeAmount,
}) {
  const reserved = finite(reservedAmount);
  const charge = finite(chargeAmount);

  if (reserved === 0 && charge === 0) {
    return {
      reserved_amount: 0,
      charged_amount: 0,
      released_amount: 0,
      remaining_reserved_amount: 0,
      mode: "ZERO_PRICE_WALLET_CHECK",
    };
  }

  if (reserved <= 0 || charge <= 0) {
    throw new Error("SERVICE_SETTLEMENT_AMOUNT_MUST_BE_POSITIVE");
  }
  if (charge > reserved) {
    throw new Error(
      `SERVICE_ACTUAL_PRICE_EXCEEDS_RESERVATION:${charge}:${reserved}`,
    );
  }

  let remaining = reserved;
  const unused = Number((reserved - charge).toFixed(6));

  if (unused > 0) {
    await WalletRuntime.release({
      organization_id: organizationId,
      amount: unused,
      provider,
      reference: `${usageId}:unused-reservation`,
      currency: null,
      metadata: {
        usage_id: usageId,
        settlement: "ACTUAL_USAGE_DIFFERENCE",
      },
    });
    remaining = charge;
  }

  await WalletRuntime.charge({
    organization_id: organizationId,
    amount: charge,
    provider,
    usage_id: usageId,
    reference: usageId,
    metadata: {
      reserved_amount: reserved,
      actual_charge_amount: charge,
      released_amount: unused,
    },
  });
  remaining = 0;

  return {
    reserved_amount: reserved,
    charged_amount: charge,
    released_amount: unused,
    remaining_reserved_amount: remaining,
    mode: "CHARGED",
  };
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

  if (String(organizationService.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error(`Service ${service_id} is not active for organization`);
  }
  if (organizationService.usage_enabled === false) {
    throw new Error(`Service ${service_id} usage is disabled for organization`);
  }

  const serviceCapabilities = resolveServiceCapabilities(service_id);
  if (!serviceCapabilities?.capabilities?.length) {
    throw new Error(`No enabled capability mapping found for ${service_id}`);
  }

  const requestedCapability = String(
    input.capability || payload.capability || ""
  ).trim();
  const resolvedCapabilities = serviceCapabilities.capabilities || [];
  const executionCapability = requestedCapability
    ? requestedCapability
    : resolvePrimaryExecutionCapability(resolvedCapabilities);

  if (!executionCapability) {
    throw new Error(`No execution capability found for ${service_id}`);
  }

  if (
    requestedCapability &&
    !resolvedCapabilities.includes(requestedCapability)
  ) {
    throw new Error(
      `Capability ${requestedCapability} is not enabled for service ${service_id}`
    );
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
      service_id,
      model,
      provider_selection: selectedProvider.selection_evidence || null,
      reservation_pricing: pricing,
    },
  });

  const gate = await walletGate({
    organizationId: organization_id,
    provider,
    usageId: usage.id,
    pricing,
  });

  const startedAt = Date.now();
  let reservationRemaining = gate.reserved_amount;

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

      reservationRemaining = 0;
      return {
        success: true,
        pending: true,
        provider,
        model,
        pricing,
        usage,
        credential_id: selectedProvider.credential_id || null,
        settlement: gate.mode,
        wallet_gate: gate,
        provider_job_id: state.job_id,
        provider_status: state.provider_status,
        started_at: new Date(startedAt).toISOString(),
        output: result,
      };
    }

    if (state.failed) {
      throw new Error(failureMessage(result, state));
    }

    const settledPricing = await actualPricing({ pricing, result });
    const settlement = await settleReservation({
      organizationId: organization_id,
      provider,
      usageId: usage.id,
      reservedAmount: gate.reserved_amount,
      chargeAmount: settledPricing.customer_price,
    });
    reservationRemaining = 0;

    const completedUsage = await UsageRuntime.complete({
      usage_id: usage.id,
      supplier_cost: settledPricing.supplier_cost,
      platform_markup: settledPricing.platform_markup,
      customer_price: settledPricing.customer_price,
      quantity,
      unit,
      latency_ms: Date.now() - startedAt,
      metadata: {
        ...metadata,
        service_id,
        model,
        result,
        provider_usage: providerUsage(result),
        reservation_pricing: pricing,
        settled_pricing: settledPricing,
        wallet_gate: gate,
        wallet_settlement: settlement,
      },
    });

    const billing = settledPricing.customer_price > 0 &&
      organizationService.billing_enabled !== false
      ? await BillingRuntime.billUsage({
          usage_id: completedUsage.id,
        })
      : null;

    return {
      success: true,
      pending: false,
      provider,
      model,
      pricing: settledPricing,
      reservation_pricing: pricing,
      usage: billing?.usage || completedUsage,
      billing,
      settlement:
        settledPricing.customer_price > 0
          ? "CHARGED"
          : "ZERO_PRICE_WALLET_CHECKED",
      wallet_gate: gate,
      wallet_settlement: settlement,
      output: result,
    };
  } catch (error) {
    await UsageRuntime.fail({
      usage_id: usage.id,
      error,
      latency_ms: Date.now() - startedAt,
      metadata: {
        ...metadata,
        service_id,
        wallet_gate: gate,
      },
    }).catch(() => null);

    if (reservationRemaining > 0) {
      await WalletRuntime.release({
        organization_id,
        amount: reservationRemaining,
        provider,
        reference: usage.id,
        currency: pricing.currency,
      }).catch(() => null);
    }

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

  const reservationPricing = Object.keys(pricing || {}).length
    ? pricing
    : usage.metadata?.reservation_pricing || {};
  const reservedAmount = finite(
    reservationPricing.customer_price || usage.metadata?.reservation_pricing?.customer_price,
  );

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
      if (reservedAmount > 0) {
        await WalletRuntime.release({
          organization_id,
          amount: reservedAmount,
          provider,
          reference: usage_id,
          currency: usage.currency,
        });
      }
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
      settlement: reservedAmount > 0 ? "RESERVED" : "ZERO_PRICE_WALLET_CHECKED",
      output: result,
    };
  }

  if (usage.status === "SUCCESS") {
    return {
      success: true,
      pending: false,
      failed: false,
      provider,
      provider_job_id,
      provider_status: state.provider_status || "completed",
      pricing: usage.metadata?.settled_pricing || reservationPricing,
      usage,
      settlement:
        finite(usage.customer_price) > 0
          ? "CHARGED"
          : "ZERO_PRICE_WALLET_CHECKED",
      output: result,
    };
  }

  const settledPricing = await actualPricing({
    pricing: reservationPricing,
    result,
  });
  const resolvedQuantity = Number(quantity ?? usage.quantity ?? 1);
  const resolvedUnit = unit || usage.unit || settledPricing.unit || "request";
  const settlement = await settleReservation({
    organizationId: organization_id,
    provider,
    usageId: usage_id,
    reservedAmount,
    chargeAmount: settledPricing.customer_price,
  });

  const completedUsage = await UsageRuntime.complete({
    usage_id,
    supplier_cost: settledPricing.supplier_cost,
    platform_markup: settledPricing.platform_markup,
    customer_price: settledPricing.customer_price,
    quantity: resolvedQuantity,
    unit: resolvedUnit,
    latency_ms: latencyFrom(started_at),
    metadata: {
      ...(usage.metadata || {}),
      ...metadata,
      provider_job_id,
      provider_status: state.provider_status,
      provider_result: result,
      provider_usage: providerUsage(result),
      reservation_pricing: reservationPricing,
      settled_pricing: settledPricing,
      wallet_settlement: settlement,
    },
  });

  const billing = settledPricing.customer_price > 0
    ? await BillingRuntime.billUsage({
        usage_id: completedUsage.id,
      })
    : null;

  return {
    success: true,
    pending: false,
    failed: false,
    provider,
    provider_job_id,
    provider_status: state.provider_status || "completed",
    pricing: settledPricing,
    reservation_pricing: reservationPricing,
    usage: billing?.usage || completedUsage,
    billing,
    settlement:
      settledPricing.customer_price > 0
        ? "CHARGED"
        : "ZERO_PRICE_WALLET_CHECKED",
    wallet_settlement: settlement,
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
