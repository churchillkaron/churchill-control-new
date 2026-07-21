import {
  OrganizationServiceRuntime,
} from "../services/runtime/OrganizationServiceRuntime";

import {
  resolveProvider,
} from "../providers/ProviderResolver";

import {
  executeProvider,
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

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function resolveAsyncJob(result = {}) {
  const providerResult = result?.output || result || {};
  const output = providerResult?.output || providerResult || {};
  const jobId = firstValue(
    output?.video_job_id,
    output?.job_id,
    output?.task_id,
    providerResult?.video_job_id,
  );
  const status = String(
    firstValue(
      output?.status,
      providerResult?.status,
      "",
    ),
  ).toUpperCase();

  if (!jobId) return null;

  return {
    job_id: jobId,
    status: status || "PROCESSING",
  };
}

async function completeUsage({
  organization_id,
  usage_id,
  provider,
  model,
  pricing,
  quantity,
  unit,
  metadata,
  result,
  started_at,
}) {
  const completedUsage = await UsageRuntime.complete({
    usage_id,
    supplier_cost: pricing.supplier_cost,
    platform_markup: pricing.platform_markup,
    customer_price: pricing.customer_price,
    quantity,
    unit,
    latency_ms:
      started_at
        ? Date.now() - Number(started_at)
        : null,
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
    usage: billing.usage,
    billing,
  };
}

export async function executeService(input = {}) {
  const {
    organization_id,
    party_id = null,
    entity_id = null,
    service_id,
    provider_id,
    input: payload = {},
    metadata = {},
    category = "SERVICE",
  } = input;

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!service_id) {
    throw new Error("service_id required");
  }

  const organizationService = await OrganizationServiceRuntime.get({
    organization_id,
    service_id,
  });

  if (!organizationService) {
    throw new Error(
      `Service ${service_id} is not enabled for organization`,
    );
  }

  const serviceCapabilities = resolveServiceCapabilities(service_id);

  if (!serviceCapabilities) {
    throw new Error(
      `No capability mapping found for service ${service_id}`,
    );
  }

  if (!serviceCapabilities.capabilities?.length) {
    throw new Error(
      `Service ${service_id} has no enabled capabilities`,
    );
  }

  const executionCapability = resolvePrimaryExecutionCapability(
    serviceCapabilities.capabilities,
  );

  if (!executionCapability) {
    throw new Error(
      `No execution capability found for ${service_id}`,
    );
  }

  const selectedProvider = await resolveProvider({
    organization_id,
    capability: executionCapability,
    preferredProvider: provider_id,
    country: input.country || null,
    currency: input.currency || null,
  });

  const provider = selectedProvider.provider;
  const model = selectedProvider.model;

  const pricing = await PricingRuntime.resolve({
    provider,
    model,
    capability: executionCapability,
    country: input.country || null,
    currency: input.currency || null,
  });

  const quantity = input.quantity || 1;
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
        credential_id:
          selectedProvider.credential_id || null,
        organization_service_id:
          organizationService.id,
        country: input.country || null,
        currency: pricing.currency,
      },
    });

    const asyncJob = resolveAsyncJob(result);

    if (asyncJob) {
      return {
        success: true,
        async: true,
        provider,
        model,
        pricing,
        usage,
        billing: null,
        output: result,
        async_job: asyncJob,
        async_context: {
          organization_id,
          usage_id: usage.id,
          provider,
          model,
          pricing,
          quantity,
          unit,
          metadata,
          started_at: startedAt,
        },
      };
    }

    const completed = await completeUsage({
      organization_id,
      usage_id: usage.id,
      provider,
      model,
      pricing,
      quantity,
      unit,
      metadata,
      result,
      started_at: startedAt,
    });

    return {
      success: true,
      async: false,
      provider,
      model,
      pricing,
      usage: completed.usage,
      billing: completed.billing,
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

export async function completeAsyncExecution({
  submission,
  result,
}) {
  const context = submission?.async_context;

  if (!context?.usage_id) {
    throw new Error("async execution context required");
  }

  const completed = await completeUsage({
    ...context,
    result,
  });

  return {
    success: true,
    provider: context.provider,
    model: context.model,
    pricing: context.pricing,
    usage: completed.usage,
    billing: completed.billing,
    output: result,
  };
}

export async function failAsyncExecution({
  submission,
  error,
}) {
  const context = submission?.async_context;

  if (!context?.usage_id) {
    return null;
  }

  await UsageRuntime.fail({
    usage_id: context.usage_id,
    error,
    latency_ms:
      context.started_at
        ? Date.now() - Number(context.started_at)
        : null,
    metadata: context.metadata || {},
  }).catch(() => null);

  await WalletRuntime.release({
    organization_id: context.organization_id,
    amount: context.pricing.customer_price,
    provider: context.provider,
    reference: context.usage_id,
  });

  return {
    success: false,
    released: true,
  };
}

export const ServiceExecutionRuntime = {
  execute: executeService,
  completeAsync: completeAsyncExecution,
  failAsync: failAsyncExecution,
};
